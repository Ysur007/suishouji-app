import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Op, PublicUser, StoredOp, StoredRecord, TokenRow, UserRow } from './types.js';

interface DB {
  v: 2;
  seq: number;
  minSeq: number;
  users: Record<string, UserRow>;
  tokens: Record<string, TokenRow>;
  /** 键：`${userId}|${entity}:${entityId}` */
  records: Record<string, StoredRecord>;
  ops: StoredOp[];
}

const MAX_OPS = 8000;
const TRIM_TO = 4000;
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5-]{2,24}$/;
const MIN_PASSWORD = 6;

export type AuthResult = { ok: true; token: string; user: PublicUser } | { ok: false; error: string; code: number };

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const recordKey = (userId: string, entity: string, entityId: string) => `${userId}|${entity}:${entityId}`;

/**
 * 「操作日志 + 快照 + 账号」的单文件存储。
 *
 * 分区规则：records 用 `${userId}|${entity}:${entityId}` 做键，ops 行内带 userId。
 * 任何查询都必须显式传 userId —— 这是不同账号之间唯一的隔离边界。
 */
export class Store {
  private db: DB;
  private file: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private seen = new Set<string>();

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'db.json');
    this.db = this.load();
    for (const op of this.db.ops) this.seen.add(op.id);
  }

  private load(): DB {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw) as { v?: number; [key: string]: unknown };
      if (parsed && parsed.v === 2 && parsed.records && parsed.users) {
        const db = parsed as unknown as DB;
        return {
          v: 2,
          seq: db.seq ?? 0,
          minSeq: db.minSeq ?? db.seq ?? 0,
          users: db.users,
          tokens: db.tokens ?? {},
          records: db.records,
          ops: db.ops ?? [],
        };
      }
      if (parsed && parsed.v === 1) {
        console.warn('[store] 检测到 v1 数据（无账号概念），已忽略旧记录并升级到 v2');
      }
    } catch {
      /* 首次启动 */
    }
    return { v: 2, seq: 0, minSeq: 0, users: {}, tokens: {}, records: {}, ops: [] };
  }

  get seq(): number {
    return this.db.seq;
  }

  get minSeq(): number {
    return this.db.minSeq;
  }

  get recordCount(): number {
    return Object.keys(this.db.records).length;
  }

  get userCount(): number {
    return Object.keys(this.db.users).length;
  }

  /* ----------------------------- 账号 ----------------------------- */

  register(usernameRaw: string, password: string): AuthResult {
    const username = usernameRaw.trim();
    if (!USERNAME_RE.test(username)) {
      return { ok: false, error: '用户名需 2–24 位，仅限中英文、数字、下划线或连字符', code: 400 };
    }
    if (password.length < MIN_PASSWORD) {
      return { ok: false, error: `密码至少 ${MIN_PASSWORD} 位`, code: 400 };
    }
    const lower = username.toLowerCase();
    const exists = Object.values(this.db.users).some((u) => u.username.toLowerCase() === lower);
    if (exists) return { ok: false, error: '这个用户名已经被注册了', code: 409 };

    const salt = crypto.randomBytes(16).toString('hex');
    const user: UserRow = {
      id: `u_${crypto.randomBytes(9).toString('hex')}`,
      username,
      salt,
      hash: hashPassword(password, salt),
      createdAt: Date.now(),
    };
    this.db.users[user.id] = user;
    const token = this.issueToken(user.id);
    this.scheduleSave();
    return { ok: true, token, user: { id: user.id, username: user.username } };
  }

  login(usernameRaw: string, password: string): AuthResult {
    const username = usernameRaw.trim().toLowerCase();
    const user = Object.values(this.db.users).find((u) => u.username.toLowerCase() === username);
    if (!user) return { ok: false, error: '用户名或密码不对', code: 401 };
    if (!safeEqual(hashPassword(password, user.salt), user.hash)) {
      return { ok: false, error: '用户名或密码不对', code: 401 };
    }
    const token = this.issueToken(user.id);
    this.scheduleSave();
    return { ok: true, token, user: { id: user.id, username: user.username } };
  }

  private issueToken(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    this.db.tokens[token] = { userId, createdAt: Date.now() };
    return token;
  }

  logout(token: string) {
    if (this.db.tokens[token]) {
      delete this.db.tokens[token];
      this.scheduleSave();
    }
  }

  userByToken(token: string | undefined): PublicUser | null {
    if (!token) return null;
    const row = this.db.tokens[token];
    if (!row) return null;
    const user = this.db.users[row.userId];
    return user ? { id: user.id, username: user.username } : null;
  }

  /* ----------------------------- 数据 ----------------------------- */

  /** 应用一批 Op（限定在某用户分区内） */
  applyMany(ops: Op[], userId: string): StoredOp[] {
    const accepted: StoredOp[] = [];
    for (const op of ops) {
      const stored = this.apply(op, userId);
      if (stored) accepted.push(stored);
    }
    if (accepted.length) this.scheduleSave();
    return accepted;
  }

  private apply(op: Op, userId: string): StoredOp | null {
    if (!op?.id || !op?.entityId || !op?.hlc || !op?.entity) return null;
    if (this.seen.has(op.id)) {
      return this.db.ops.find((o) => o.id === op.id) ?? null;
    }

    const key = recordKey(userId, op.entity, op.entityId);
    const existing = this.db.records[key];
    if (existing && existing.hlc >= op.hlc) {
      this.seen.add(op.id);
      return null;
    }

    this.seen.add(op.id);
    this.db.seq += 1;
    const stored: StoredOp = { ...op, seq: this.db.seq, userId };
    this.db.ops.push(stored);
    this.dirty = true;

    if (op.kind === 'del') {
      this.db.records[key] = {
        id: op.entityId,
        entity: op.entity,
        hlc: op.hlc,
        deleted: true,
        updatedAt: Date.now(),
      };
    } else {
      this.db.records[key] = {
        ...(op.data ?? {}),
        id: op.entityId,
        entity: op.entity,
        hlc: op.hlc,
        deleted: false,
      };
    }

    if (this.db.ops.length > MAX_OPS) {
      const dropped = this.db.ops.splice(0, this.db.ops.length - TRIM_TO);
      for (const d of dropped) this.seen.delete(d.id);
      this.db.minSeq = this.db.ops[0]?.seq ?? this.db.seq;
      this.dirty = true;
    }
    return stored;
  }

  /** 只返回该用户自己的增量；since 过旧时返回 null 由调用方改发快照 */
  since(seq: number, userId: string): StoredOp[] | null {
    if (seq < this.db.minSeq) return null;
    return this.db.ops.filter((o) => o.userId === userId && o.seq > seq);
  }

  allRecords(userId: string): StoredRecord[] {
    return Object.entries(this.db.records)
      .filter(([key]) => key.startsWith(`${userId}|`))
      .map(([, value]) => value);
  }

  exportAll(userId: string, username: string) {
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      account: username,
      records: this.allRecords(userId),
    };
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 120);
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const tmp = `${this.file}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.db), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] 写入失败', err);
      this.dirty = true;
    }
  }
}
