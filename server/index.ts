import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Store } from './store.js';
import type { ClientMessage, Op, Peer, ServerMessage } from './types.js';
import {
  chatLocal,
  hasKey,
  organizeLocal,
  organizeWithLlm,
  type AiMemo,
  type ChatMessage,
} from './ai.js';
import {
  accountDir,
  chatStreamText,
  clearConfig,
  listModels,
  loadConfig,
  probe,
  publicConfig,
  resolveProvider,
  saveConfig,
  statusOf,
  type Provider,
} from './llm.js';

// 三种运行形态：tsx 直跑（ESM）、Docker/Node（ESM）、Electron（esbuild 打成 CJS）
const HERE =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR ?? 'data');

const store = new Store(DATA_DIR);
const startedAt = Date.now();

/** 某个账号的 AI 配置目录 */
const aiDir = (userId: string) => accountDir(DATA_DIR, userId);

/** 有几个账号配了模型（/api/health 用，不含任何账号信息） */
function aiConfigured(): number {
  try {
    return fs
      .readdirSync(path.join(DATA_DIR, 'ai'))
      .filter((name) => fs.existsSync(path.join(DATA_DIR, 'ai', name, 'ai.json'))).length;
  } catch {
    return 0;
  }
}

/**
 * 早期那份全站共用的 `data/ai.json` 不再自动套给任何账号——那正是「一个账号填了、
 * 所有账号都变成这个接口」的来源。文件留在原处（里面有 Key，不能丢），
 * 谁能用「只导入给一个账号」的方式领走一次：面板里出现一个导入入口，点一下归当前账号。
 */
const LEGACY_AI = () => path.join(DATA_DIR, 'ai.json');

function legacyAiClaimed(): boolean {
  return fs.existsSync(`${LEGACY_AI()}.claimed`);
}

function legacyAiInfo(): { available: boolean; keyHint: string } {
  const file = LEGACY_AI();
  if (legacyAiClaimed() || !fs.existsSync(file)) return { available: false, keyHint: '' };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { apiKey?: string };
    const key = (raw.apiKey ?? '').trim();
    if (!key) return { available: false, keyHint: '' };
    return { available: true, keyHint: `${key.slice(0, 3)}…${key.slice(-4)}` };
  } catch {
    return { available: false, keyHint: '' };
  }
}

interface SocketMeta {
  clientId: string;
  name: string;
  platform: string;
  connectedAt: number;
  userId: string;
  alive: boolean;
}

const meta = new WeakMap<WebSocket, SocketMeta>();

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function json(res: ServerResponse, code: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: IncomingMessage, limit = 16 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function bearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

function serveStatic(res: ServerResponse, pathname: string) {
  if (!fs.existsSync(DIST)) {
    const hint = `<!doctype html><meta charset="utf-8"><title>随手记 · API</title>
<body style="font:16px/1.7 -apple-system,'Segoe UI',sans-serif;padding:48px;color:#0a0a0a;background:#f2f2f2">
<h1 style="font-weight:600">随手记 · 同步服务已启动</h1>
<p>当前是开发模式，前端请访问 <b>http://localhost:5173</b>。</p>
<p>生产模式下先执行 <code>npm run build</code>，再访问 <b>http://localhost:${PORT}</b>。</p>
</body>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(hint);
    return;
  }

  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(DIST, safe);
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html');
  }
  const ext = path.extname(file).toLowerCase();
  const cache = file.includes(`${path.sep}assets${path.sep}`)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': cache });
  fs.createReadStream(file).pipe(res);
}


/** 把该用户可见的记录整理成 AI 需要的扁平结构 */
function memosFor(
  userId: string,
  opts: { spaceId?: string; days?: number | null; folderId?: string | null } = {},
): AiMemo[] {
  const now = Date.now();
  const out: AiMemo[] = [];
  for (const r of store.allRecords(userId)) {
    if (r.entity !== 'memo' || r.deleted) continue;
    const text = String((r as Record<string, unknown>).text ?? '').trim();
    if (!text) continue;
    if (opts.spaceId && r.spaceId !== opts.spaceId) continue;
    const createdAt = Number((r as Record<string, unknown>).createdAt ?? 0) || 0;
    if (opts.days && opts.days > 0 && now - createdAt > opts.days * 86400000) continue;
    const folderId = ((r as Record<string, unknown>).folderId ?? null) as string | null;
    if (opts.folderId && folderId !== opts.folderId) continue;
    out.push({
      id: r.id,
      text,
      createdAt,
      folderId,
      spaceId: r.spaceId,
      ownerName: String((r as Record<string, unknown>).ownerName ?? ''),
      pinned: Boolean((r as Record<string, unknown>).pinned),
    });
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

const server = http.createServer(async (req, res) => {
  // 移动端壳从 https://localhost 调接口属于跨域；这里放开 origin，鉴权仍靠 Bearer token
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type,authorization');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-max-age', '86400');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;

  if (pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      seq: store.seq,
      records: store.recordCount,
      users: store.userCount,
      groups: store.groupCount,
      ai: 'per-user',
      aiUsers: aiConfigured(),
      clients: [...wss.clients].filter((c) => c.readyState === WebSocket.OPEN).length,
      uptime: Math.round((Date.now() - startedAt) / 1000),
    });
  }

  /* ----------------------------- 账号 ----------------------------- */

  if ((pathname === '/api/auth/register' || pathname === '/api/auth/login') && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req, 64 * 1024)) as {
        username?: string;
        password?: string;
      };
      const username = String(body.username ?? '');
      const password = String(body.password ?? '');
      const result =
        pathname === '/api/auth/register'
          ? store.register(username, password)
          : store.login(username, password);
      if (!result.ok) return json(res, result.code, { error: result.error });
      return json(res, 200, { token: result.token, user: result.user });
    } catch (err) {
      return json(res, 400, { error: (err as Error).message });
    }
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = bearer(req);
    if (token) store.logout(token);
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/auth/me') {
    const me = store.userByToken(bearer(req) ?? url.searchParams.get('token') ?? undefined);
    if (!me) return json(res, 401, { error: '未登录或登录已失效' });
    return json(res, 200, { user: me });
  }

  /* ----------------------------- 群组 ----------------------------- */

  const user = store.userByToken(bearer(req) ?? url.searchParams.get('token') ?? undefined);

  // 改密码：要求原密码；改完把其它设备上的登录作废，只留这台
  if (pathname === '/api/auth/password' && req.method === 'POST') {
    if (!user) return json(res, 401, { error: '未登录' });
    try {
      const body = JSON.parse(await readBody(req, 8 * 1024)) as {
        oldPassword?: string;
        newPassword?: string;
      };
      const result = store.changePassword(
        user.id,
        String(body.oldPassword ?? ''),
        String(body.newPassword ?? ''),
        bearer(req) ?? '',
      );
      if (!result.ok) return json(res, result.code ?? 400, { error: result.error });
      return json(res, 200, { ok: true, dropped: result.dropped ?? 0 });
    } catch (err) {
      return json(res, 400, { error: (err as Error).message });
    }
  }


  if (pathname.startsWith('/api/groups')) {
    if (!user) return json(res, 401, { error: '未登录' });

    if (pathname === '/api/groups' && req.method === 'GET') {
      return json(res, 200, { groups: store.groupsOf(user.id) });
    }

    if (req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req, 64 * 1024)) as Record<string, unknown>;

        if (pathname === '/api/groups') {
          const result = store.createGroup(user.id, String(body.name ?? ''));
          if (!result.ok) return json(res, result.code, { error: result.error });
          pushGroups([user.id]);
          return json(res, 200, { group: result.group, groups: store.groupsOf(user.id) });
        }

        if (pathname === '/api/groups/invite') {
          const groupId = String(body.groupId ?? '');
          const before = store.groupById(groupId);
          const usernames = Array.isArray(body.usernames) ? (body.usernames as string[]) : [];
          const result = store.invite(groupId, user.id, usernames);
          if (!result.ok) return json(res, result.code, { error: result.error });
          const after = result.group;
          const added = after.members
            .map((m) => m.id)
            .filter((id) => !(before?.members.some((m) => m.id === id) ?? false));
          pushGroups(
            after.members.map((m) => m.id),
            added,
          );
          return json(res, 200, { group: after, groups: store.groupsOf(user.id) });
        }

        if (pathname === '/api/groups/rename') {
          const result = store.renameGroup(String(body.groupId ?? ''), user.id, String(body.name ?? ''));
          if (!result.ok) return json(res, result.code, { error: result.error });
          pushGroups(result.group.members.map((m) => m.id));
          return json(res, 200, { group: result.group, groups: store.groupsOf(user.id) });
        }

        if (pathname === '/api/groups/remove') {
          const groupId = String(body.groupId ?? '');
          const targetId = String(body.userId ?? '');
          const result = store.removeMember(groupId, user.id, targetId);
          if (!result.ok) return json(res, result.code, { error: result.error });
          const members = result.group.members.map((m) => m.id);
          pushGroups([...members, targetId], [targetId]);
          return json(res, 200, { group: result.group, groups: store.groupsOf(user.id) });
        }

        if (pathname === '/api/groups/leave') {
          const groupId = String(body.groupId ?? '');
          const result = store.leaveGroup(groupId, user.id);
          if (!result.ok) return json(res, result.code, { error: result.error });
          const members = result.group ? result.group.members.map((m) => m.id) : [];
          pushGroups([...members, user.id], [user.id]);
          return json(res, 200, { groups: store.groupsOf(user.id) });
        }
      } catch (err) {
        return json(res, 400, { error: (err as Error).message });
      }
      return json(res, 404, { error: 'not found' });
    }
  }


  /* ----------------------------- AI ----------------------------- */

  if (pathname === '/api/ai/status' && req.method === 'GET') {
    // 未登录就是「没配」：配置按账号存，游客没有可继承的那一份
    const st = statusOf(user ? aiDir(user.id) : path.join(DATA_DIR, 'ai', 'guest'));
    return json(res, 200, {
      engine: st.configured ? 'llm' : 'local',
      configured: st.configured,
      provider: st.provider,
      resolved: st.resolved,
      baseUrl: st.baseUrl,
      model: st.model,
      keyHint: st.keyHint,
      source: st.source,
    });
  }

  // AI 接入配置：读写都在服务端，key 不下发到前端（只回显末四位）
  if (pathname === '/api/ai/config') {
    if (!user) return json(res, 401, { error: '未登录' });
    if (req.method === 'GET') {
      return json(res, 200, { config: publicConfig(aiDir(user.id)), legacy: legacyAiInfo() });
    }
    if (req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req, 32 * 1024)) as {
          provider?: Provider;
          baseUrl?: string;
          apiKey?: string;
          model?: string;
          maxTokens?: number;
          clear?: boolean;
        };
        if (body.clear) {
          clearConfig(aiDir(user.id));
          return json(res, 200, {
            config: publicConfig(aiDir(user.id)),
            engine: hasKey(aiDir(user.id)) ? 'llm' : 'local',
          });
        }
        const next = saveConfig(aiDir(user.id), {
          provider: body.provider,
          baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
          apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
          model: typeof body.model === 'string' ? body.model : undefined,
          maxTokens: body.maxTokens,
        });
        return json(res, 200, {
          config: publicConfig(aiDir(user.id)),
          resolved: resolveProvider(next),
          engine: next.apiKey ? 'llm' : 'local',
        });
      } catch (err) {
        return json(res, 400, { error: (err as Error).message });
      }
    }
  }

  if (pathname === '/api/ai/config/test' && req.method === 'POST') {
    if (!user) return json(res, 401, { error: '未登录' });
    const result = await probe(aiDir(user.id));
    return json(res, 200, result);
  }

  // 领走旧版那份全站配置：只能领一次，领走后就归这个账号（其他人不再看到入口）
  if (pathname === '/api/ai/config/import-legacy' && req.method === 'POST') {
    if (!user) return json(res, 401, { error: '未登录' });
    if (legacyAiClaimed()) return json(res, 400, { error: '旧版配置已经被某个账号领走了' });
    const info = legacyAiInfo();
    if (!info.available) return json(res, 400, { error: '没有可导入的旧版配置' });
    if (hasKey(aiDir(user.id))) return json(res, 400, { error: '本账号已经有配置了，先清除再导入' });
    try {
      fs.mkdirSync(aiDir(user.id), { recursive: true });
      fs.copyFileSync(LEGACY_AI(), path.join(aiDir(user.id), 'ai.json'));
      fs.writeFileSync(`${LEGACY_AI()}.claimed`, JSON.stringify({ by: user.id, at: Date.now() }), {
        mode: 0o600,
      });
      return json(res, 200, { config: publicConfig(aiDir(user.id)), engine: 'llm' });
    } catch (err) {
      return json(res, 500, { error: `导入失败：${(err as Error).message}` });
    }
  }

  // 列模型：用当前（或表单里还没保存的）地址 + Key 去问服务商要一份模型清单
  if (pathname === '/api/ai/models' && req.method === 'POST') {
    if (!user) return json(res, 401, { error: '未登录' });
    try {
      const body = JSON.parse(await readBody(req, 32 * 1024)) as {
        provider?: Provider;
        baseUrl?: string;
        apiKey?: string;
      };
      const result = await listModels(aiDir(user.id), {
        provider: body.provider,
        baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
        apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      });
      return json(res, 200, result);
    } catch (err) {
      return json(res, 400, { error: (err as Error).message });
    }
  }

  if (pathname === '/api/ai/organize' && req.method === 'POST') {
    if (!user) return json(res, 401, { error: '未登录' });
    try {
      const body = JSON.parse(await readBody(req, 512 * 1024)) as {
        spaceId?: string;
        days?: number | null;
        folderId?: string | null;
      };
      const days = body.days === null || body.days === undefined ? null : Number(body.days);
      const memos = memosFor(user.id, {
        spaceId: body.spaceId,
        days: days && days > 0 ? days : null,
        folderId: body.folderId ?? null,
      });
      const label =
        days && days > 0 ? `最近 ${days} 天` : body.spaceId && body.spaceId.startsWith('g:') ? '群共享' : '全部记录';
      const report = hasKey(aiDir(user.id))
        ? await organizeWithLlm(aiDir(user.id), memos, label, days && days > 0 ? days : null)
        : organizeLocal(memos, label, days && days > 0 ? days : null);
      return json(res, 200, { report });
    } catch (err) {
      return json(res, 400, { error: (err as Error).message });
    }
  }

  if (pathname === '/api/ai/chat' && req.method === 'POST') {
    if (!user) return json(res, 401, { error: '未登录' });
    const body = (await (async () => {
      try {
        return JSON.parse(await readBody(req, 512 * 1024)) as {
          messages?: ChatMessage[];
          spaceId?: string;
        };
      } catch {
        return {};
      }
    })()) as { messages?: ChatMessage[]; spaceId?: string };

    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-10);
    if (!messages.length) return json(res, 400, { error: '消息为空' });

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const emit = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    const emitDelta = (text: string) => emit({ delta: text });

    try {
      const memos = memosFor(user.id, { spaceId: body.spaceId });
      const cfg = loadConfig(aiDir(user.id));

      if (cfg.apiKey) {
        // 模型路径：边收边转，前端拿到的就是真实增量
        const refs = (await import('./ai.js')).retrieve(memos, messages[messages.length - 1]?.content ?? '', 6).map(
          (m) => ({ id: m.id, text: m.text.slice(0, 40), createdAt: m.createdAt }),
        );
        const context = memos
          .slice(0, 120)
          .map((m, i) => `${i + 1}. [${new Date(m.createdAt).toLocaleDateString('zh-CN')}] ${m.text.replace(/\s+/g, ' ').slice(0, 160)}`)
          .join('\n');
        await chatStreamText(
          aiDir(user.id),
          [
            {
              role: 'system',
              content: `你是用户私人笔记的助手。只根据下面这些记录回答，记录里没有的就直说没有，不要编造。
回答用中文，简洁，必要时分点。引用记录时写「（见 N 月 N 日那条）」。\n\n用户的相关记录：\n${context}`,
            },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ],
          emitDelta,
        );
        emit({ done: true, refs, engine: 'llm', model: cfg.model });
      } else {
        const result = chatLocal(memos, messages);
        // 本地引擎一次算完，这里按节奏吐出来，让阅读像对话
        const chunks = result.answer.match(/[^\n]{1,18}\n?|[\n]/g) ?? [result.answer];
        for (const chunk of chunks) {
          emit({ delta: chunk });
          await new Promise((r) => setTimeout(r, 16));
        }
        emit({ done: true, refs: result.refs, engine: 'local', model: null });
      }
    } catch (err) {
      emit({ error: (err as Error).message });
    }
    res.end();
    return;
  }

  /* ----------------------------- 数据 ----------------------------- */

  // 单条记录：整理报告里点开的记录如果本机没有（同步没补齐/换设备），用它补一条
  if (pathname === '/api/memo' && req.method === 'GET') {
    if (!user) return json(res, 401, { error: '未登录' });
    const id = (url.searchParams.get('id') ?? '').trim();
    if (!id) return json(res, 400, { error: '缺少 id' });
    const memo = store.findRecord(user.id, id);
    if (!memo) return json(res, 404, { error: '记录不存在或无权访问' });
    return json(res, 200, { memo });
  }

  // 全量记录（不含 op 日志）：本机怀疑数据不全时用来对齐一次，体积只和记录数有关
  if (pathname === '/api/records' && req.method === 'GET') {
    if (!user) return json(res, 401, { error: '未登录' });
    return json(res, 200, { seq: store.seq, records: store.allRecords(user.id) });
  }

  if (pathname === '/api/snapshot') {
    if (!user) return json(res, 401, { error: '未登录' });
    const since = Number(url.searchParams.get('since') ?? 0);
    const ops = store.since(since, user.id);
    if (!ops) {
      return json(res, 200, { reset: true, seq: store.seq, records: store.allRecords(user.id) });
    }
    return json(res, 200, { seq: store.seq, ops });
  }

  if (pathname === '/api/export') {
    if (!user) return json(res, 401, { error: '未登录' });
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="suishouji-${user.username}-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    });
    return res.end(JSON.stringify(store.exportAll(user.id, user.username), null, 2));
  }

  if (pathname === '/api/ops' && req.method === 'POST') {
    if (!user) return json(res, 401, { error: '未登录' });
    try {
      const body = JSON.parse(await readBody(req)) as { ops?: Op[] };
      const ops = Array.isArray(body.ops) ? body.ops : [];
      const accepted = store.applyMany(ops, user.id);
      if (accepted.length) {
        broadcastSpaces(
          new Set(accepted.map((op) => op.spaceId)),
          { type: 'ops', seq: store.seq, ops: accepted },
        );
      }
      return json(res, 200, { seq: store.seq, applied: accepted.length });
    } catch (err) {
      return json(res, 400, { error: (err as Error).message });
    }
  }

  if (pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });

  serveStatic(res, pathname);
});

/* ------------------------------------------------------------------ *
 * WebSocket：按用户分区的实时同步
 * ------------------------------------------------------------------ */

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 * 1024 });

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function peersOf(userId: string): Peer[] {
  const peers: Peer[] = [];
  for (const ws of wss.clients) {
    const m = meta.get(ws);
    if (m && m.userId === userId && ws.readyState === WebSocket.OPEN) {
      peers.push({
        clientId: m.clientId,
        name: m.name,
        platform: m.platform,
        connectedAt: m.connectedAt,
        userId: m.userId,
      });
    }
  }
  return peers;
}

/** 广播给「能看到这些空间」的所有连接：个人空间只有本人，群空间发给全部成员 */
function broadcastSpaces(spaces: Set<string>, msg: ServerMessage, except?: WebSocket) {
  for (const ws of wss.clients) {
    if (ws === except) continue;
    const m = meta.get(ws);
    if (!m) continue;
    for (const space of spaces) {
      if (store.canAccess(m.userId, space)) {
        send(ws, msg);
        break;
      }
    }
  }
}

/** 群信息变更：给每个受影响的人推最新群列表，需要重建视图的再补一份快照 */
function pushGroups(userIds: string[], resetFor: string[] = []) {
  const resetSet = new Set(resetFor);
  for (const ws of wss.clients) {
    const m = meta.get(ws);
    if (!m || !userIds.includes(m.userId)) continue;
    send(ws, { type: 'groups', groups: store.groupsOf(m.userId) });
    if (resetSet.has(m.userId)) {
      send(ws, { type: 'reset', seq: store.seq, records: store.allRecords(m.userId) });
    }
  }
}

function broadcastPresence(userId: string) {
  for (const ws of wss.clients) {
    const m = meta.get(ws);
    if (m?.userId === userId) send(ws, { type: 'presence', peers: peersOf(userId) });
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }

    if (msg.type === 'hello') {
      const user = store.userByToken(msg.token);
      if (!user) {
        send(ws, { type: 'unauthorized', reason: '未登录或登录已失效' });
        return;
      }

      meta.set(ws, {
        clientId: msg.clientId || 'anonymous',
        name: msg.name || '未命名设备',
        platform: msg.platform || 'web',
        connectedAt: Date.now(),
        userId: user.id,
        alive: true,
      });

      send(ws, {
        type: 'ready',
        seq: store.seq,
        minSeq: store.minSeq,
        peers: peersOf(user.id),
        serverTime: Date.now(),
      });

      send(ws, { type: 'groups', groups: store.groupsOf(user.id) });

      const since = Number(msg.since ?? 0);
      const ops = Number.isFinite(since) ? store.since(since, user.id) : null;
      if (ops) {
        send(ws, { type: 'sync', seq: store.seq, ops });
      } else {
        send(ws, { type: 'reset', seq: store.seq, records: store.allRecords(user.id) });
      }

      broadcastPresence(user.id);
      return;
    }

    const me = meta.get(ws);
    if (!me) {
      send(ws, { type: 'unauthorized', reason: '连接未认证' });
      return;
    }

    if (msg.type === 'ops' && Array.isArray(msg.ops)) {
      const accepted = store.applyMany(msg.ops, me.userId);
      if (accepted.length) {
        broadcastSpaces(
          new Set(accepted.map((op) => op.spaceId)),
          { type: 'ops', seq: store.seq, ops: accepted },
          ws,
        );
      }
      send(ws, { type: 'ack', seq: store.seq, ids: msg.ops.map((o) => o.id) });
      return;
    }

    if (msg.type === 'resync') {
      send(ws, { type: 'groups', groups: store.groupsOf(me.userId) });
      send(ws, { type: 'reset', seq: store.seq, records: store.allRecords(me.userId) });
      return;
    }

    if (msg.type === 'ping') send(ws, { type: 'pong' });
  });

  ws.on('close', () => {
    const m = meta.get(ws);
    if (m) broadcastPresence(m.userId);
  });

  ws.on('pong', () => {
    const m = meta.get(ws);
    if (m) m.alive = true;
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const m = meta.get(ws);
    if (m && !m.alive) {
      ws.terminate();
      continue;
    }
    if (m) m.alive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 25_000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`\n  随手记 · 同步服务  http://localhost:${PORT}`);
  console.log(`  数据文件         ${path.join(DATA_DIR, 'db.json')}`);
  console.log(`  已载入           ${store.userCount} 个账号 / ${store.recordCount} 条记录 / seq ${store.seq}\n`);
});

function shutdown(signal: string) {
  console.log(`\n收到 ${signal}，正在保存数据…`);
  store.flush();
  clearInterval(heartbeat);
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
