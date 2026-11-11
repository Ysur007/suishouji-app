import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Store } from './store.js';
import type { ClientMessage, Op, Peer, ServerMessage } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR ?? 'data');

const store = new Store(DATA_DIR);
const startedAt = Date.now();

interface SocketMeta {
  clientId: string;
  name: string;
  platform: string;
  connectedAt: number;
  alive: boolean;
}

const meta = new WeakMap<WebSocket, SocketMeta>();

/* ------------------------------------------------------------------ *
 * HTTP：静态资源 + 少量 REST 接口
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

function serveStatic(res: ServerResponse, pathname: string) {
  if (!fs.existsSync(DIST)) {
    const hint = `<!doctype html><meta charset="utf-8"><title>随手记 · API</title>
<body style="font:16px/1.7 -apple-system,'Segoe UI',sans-serif;padding:48px;color:#1b1917;background:#f4f2ee">
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
    // SPA 兜底
    file = path.join(DIST, 'index.html');
  }
  const ext = path.extname(file).toLowerCase();
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': cache });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;

  if (pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      seq: store.seq,
      records: store.recordCount,
      clients: [...wss.clients].filter((c) => c.readyState === WebSocket.OPEN).length,
      uptime: Math.round((Date.now() - startedAt) / 1000),
    });
  }

  if (pathname === '/api/snapshot') {
    const since = Number(url.searchParams.get('since') ?? 0);
    const ops = store.since(since);
    if (!ops) return json(res, 200, { reset: true, seq: store.seq, records: store.allRecords() });
    return json(res, 200, { seq: store.seq, ops });
  }

  if (pathname === '/api/export') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="suishouji-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    return res.end(JSON.stringify(store.exportAll(), null, 2));
  }

  if (pathname === '/api/ops' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req)) as { ops?: Op[]; clientId?: string };
      const ops = Array.isArray(body.ops) ? body.ops : [];
      const accepted = store.applyMany(ops);
      if (accepted.length) broadcast({ type: 'ops', seq: store.seq, ops: accepted });
      return json(res, 200, { seq: store.seq, applied: accepted.length });
    } catch (err) {
      return json(res, 400, { error: (err as Error).message });
    }
  }

  if (pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });

  serveStatic(res, pathname);
});

/* ------------------------------------------------------------------ *
 * WebSocket：实时同步 + 在线设备
 * ------------------------------------------------------------------ */

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 * 1024 });

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function currentPeers(): Peer[] {
  const peers: Peer[] = [];
  for (const ws of wss.clients) {
    const m = meta.get(ws);
    if (m && ws.readyState === WebSocket.OPEN) {
      peers.push({ clientId: m.clientId, name: m.name, platform: m.platform, connectedAt: m.connectedAt });
    }
  }
  return peers;
}

function broadcast(msg: ServerMessage, except?: WebSocket) {
  for (const ws of wss.clients) {
    if (ws === except) continue;
    send(ws, msg);
  }
}

function broadcastPresence() {
  broadcast({ type: 'presence', peers: currentPeers() });
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
      const existing = meta.get(ws);
      const next: SocketMeta = {
        clientId: msg.clientId || existing?.clientId || 'anonymous',
        name: msg.name || existing?.name || '未命名设备',
        platform: msg.platform || existing?.platform || 'web',
        connectedAt: existing?.connectedAt ?? Date.now(),
        alive: true,
      };
      meta.set(ws, next);

      send(ws, { type: 'ready', seq: store.seq, minSeq: store.minSeq, peers: currentPeers(), serverTime: Date.now() });

      const since = Number(msg.since ?? 0);
      const ops = Number.isFinite(since) ? store.since(since) : null;
      if (ops) {
        if (ops.length) send(ws, { type: 'sync', seq: store.seq, ops });
        else send(ws, { type: 'sync', seq: store.seq, ops: [] });
      } else {
        send(ws, { type: 'reset', seq: store.seq, records: store.allRecords() });
      }

      broadcastPresence();
      return;
    }

    if (msg.type === 'ops' && Array.isArray(msg.ops)) {
      const accepted = store.applyMany(msg.ops);
      if (accepted.length) {
        broadcast({ type: 'ops', seq: store.seq, ops: accepted }, ws);
      }
      send(ws, { type: 'ack', seq: store.seq, ids: msg.ops.map((o) => o.id) });
      return;
    }

    if (msg.type === 'ping') send(ws, { type: 'pong' });
  });

  ws.on('close', () => {
    broadcastPresence();
  });

  ws.on('pong', () => {
    const m = meta.get(ws);
    if (m) m.alive = true;
  });
});

// 心跳：清掉半开连接，否则「在线设备」会虚高
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
  console.log(`  已载入记录       ${store.recordCount} 条 / seq ${store.seq}\n`);
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
