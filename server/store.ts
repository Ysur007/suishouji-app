import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  GroupPublic,
  GroupRow,
  Op,
  PublicUser,
  StoredOp,
  StoredRecord,
  TokenRow,
  UserRow,
} from './types.js';

interface DB {
  v: 3;
  seq: number;
  minSeq: number;
  users: Record<string, UserRow>;
  tokens: Record<string, TokenRow>;
  groups: Record<string, GroupRow>;
  /** 键：`${spaceId}|${entity}:${entityId}`，spaceId 为 `u:<userId>` 或 `g:<groupId>` */
  records: Record<string, StoredRecord>;
  ops: StoredOp[];
}

const MAX_OPS = 8000;
const TRIM_TO = 4000;
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5-]{2,24}$/;
const MIN_PASSWORD = 6;
const MAX_MEMBERS = 32;

export type AuthResult = { ok: true; token: string; user: PublicUser } | { ok: false; error: string; code: number };
export type GroupResult = { ok: true; group: GroupPublic } | { ok: false; error: string; code: number };

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const recordKey = (spaceId: string, entity: string, entityId: string) => `${spaceId}|${entity}:${entityId}`;

/**
 * 「操作日志 + 快照 + 账号 + 群组」的单文件存储。
 *
 * 分区规则：每条记录归某个空间，个人空间 `u:<userId>` 只有本人可读写，
 * 群空间 `g:<groupId>` 由 members 共享。任何读取路径都必须先算出
 * 当前用户可见的空间集合，再做过滤——这是账号之间、群与群之间的唯一隔离边界。
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
    // 旧版本数据刚迁移完，尽早在磁盘上落成新结构
    if (this.dirty) this.scheduleSave();
  }

  private load(): DB {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw) as { v?: number; [key: string]: unknown };
      if (!parsed) throw new Error('empty');

      if (parsed.v === 3 && parsed.records && parsed.users) {
        const db = parsed as unknown as DB;
        return {
          v: 3,
          seq: db.seq ?? 0,
          minSeq: db.minSeq ?? db.seq ?? 0,
          users: db.users,
          tokens: db.tokens ?? {},
          groups: db.groups ?? {},
          records: db.records,
          ops: db.ops ?? [],
        };
      }

      // v2 → v3：记录键补上个人空间前缀
      if (parsed.v === 2 && parsed.records && parsed.users) {
        const old = parsed as unknown as {
          seq: number;
          minSeq?: number;
          users: Record<string, UserRow>;
          tokens?: Record<string, TokenRow>;
          records: Record<string, StoredRecord>;
          ops?: StoredOp[];
        };
        const records: Record<string, StoredRecord> = {};
        for (const [key, value] of Object.entries(old.records)) {
          const [userId, rest] = key.split('|');
          if (!rest) continue;
          records[`u:${userId}|${rest}`] = { ...value, spaceId: `u:${userId}` };
        }
        const ops = (old.ops ?? []).map((op) => ({
          ...op,
          spaceId: op.spaceId ?? `u:${op.userId}`,
        }));
        console.log(`[store] v2 → v3：${Object.keys(records).length} 条记录迁入个人空间`);
        this.dirty = true;
        return {
          v: 3,
          seq: old.seq ?? 0,
          minSeq: old.minSeq ?? 0,
          users: old.users,
          tokens: old.tokens ?? {},
          groups: {},
          records,
          ops,
        };
      }

      if (parsed.v === 1) {
        console.warn('[store] 检测到 v1 数据（无账号概念），已忽略旧记录并升级到 v3');
      }
    } catch {
      /* 首次启动 */
    }
    return { v: 3, seq: 0, minSeq: 0, users: {}, tokens: {}, groups: {}, records: {}, ops: [] };
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

  get groupCount(): number {
    return Object.values(this.db.groups).filter((g) => !g.deleted).length;
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

  /**
   * 改密码：校验原密码 → 换新盐重算哈希 → 把该账号在其它设备上的 token 全部作废。
   * 只留当前这台，避免"改完密码别人还挂着"。
   */
  changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    keepToken: string,
  ): { ok: boolean; error?: string; code?: number; dropped?: number } {
    const user = this.db.users[userId];
    if (!user) return { ok: false, error: '账号不存在', code: 404 };
    if (!safeEqual(hashPassword(oldPassword, user.salt), user.hash)) {
      return { ok: false, error: '原密码不对', code: 400 };
    }
    if (newPassword.length < MIN_PASSWORD) {
      return { ok: false, error: `新密码至少 ${MIN_PASSWORD} 位`, code: 400 };
    }
    if (newPassword === oldPassword) {
      return { ok: false, error: '新密码和原密码一样，换个别的', code: 400 };
    }
    user.salt = crypto.randomBytes(16).toString('hex');
    user.hash = hashPassword(newPassword, user.salt);
    let dropped = 0;
    for (const [token, row] of Object.entries(this.db.tokens)) {
      if (row.userId === userId && token !== keepToken) {
        delete this.db.tokens[token];
        dropped += 1;
      }
    }
    this.scheduleSave();
    return { ok: true, dropped };
  }

  private issueToken(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    this.db.tokens[token] = {
      userId,
      createdAt: Date.now(),
      id: crypto.randomBytes(6).toString('hex'),
    };
    return token;
  }

  /** 握手时把设备信息记到 token 上（老 token 顺手补一个 id） */
  touchToken(token: string, info: { name: string; platform: string; clientId: string }): void {
    const row = this.db.tokens[token];
    if (!row) return;
    if (!row.id) row.id = crypto.randomBytes(6).toString('hex');
    row.name = info.name.slice(0, 40);
    row.platform = info.platform.slice(0, 24);
    row.clientId = info.clientId.slice(0, 40);
    row.lastSeenAt = Date.now();
    this.scheduleSave();
  }

  /** 在线设备列表：只给短 id，不下发 token */
  devicesOf(userId: string): Array<{
    id: string;
    name: string;
    platform: string;
    createdAt: number;
    lastSeenAt: number;
  }> {
    const out: Array<{
      id: string;
      name: string;
      platform: string;
      createdAt: number;
      lastSeenAt: number;
    }> = [];
    for (const row of Object.values(this.db.tokens)) {
      if (row.userId !== userId) continue;
      if (!row.id) {
        row.id = crypto.randomBytes(6).toString('hex');
        this.scheduleSave();
      }
      out.push({
        id: row.id,
        name: row.name || '未命名设备',
        platform: row.platform || '',
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt ?? row.createdAt,
      });
    }
    return out.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  /** 某个 token 对应的对外设备 id（列表里标「本机」用） */
  deviceIdOfToken(token: string): string | null {
    const row = this.db.tokens[token];
    if (!row) return null;
    return row.id ?? null;
  }

  /** 下线某台设备；keepToken 这台不能踢（就是当前设备） */
  revokeDevice(userId: string, deviceId: string, keepToken: string): boolean {
    for (const [token, row] of Object.entries(this.db.tokens)) {
      if (row.userId !== userId) continue;
      if (row.id !== deviceId) continue;
      if (token === keepToken) return false;
      delete this.db.tokens[token];
      this.scheduleSave();
      return true;
    }
    return false;
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

  userByName(username: string): UserRow | null {
    const lower = username.trim().toLowerCase();
    return Object.values(this.db.users).find((u) => u.username.toLowerCase() === lower) ?? null;
  }

  /* ----------------------------- 群组 ----------------------------- */

  private publicGroup(row: GroupRow): GroupPublic {
    return {
      id: row.id,
      name: row.name,
      ownerId: row.ownerId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      members: row.members
        .map((id) => {
          const user = this.db.users[id];
          return user ? { id: user.id, username: user.username } : null;
        })
        .filter((m): m is { id: string; username: string } => Boolean(m)),
    };
  }

  groupsOf(userId: string): GroupPublic[] {
    return Object.values(this.db.groups)
      .filter((g) => !g.deleted && g.members.includes(userId))
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((g) => this.publicGroup(g));
  }

  groupById(groupId: string): GroupPublic | null {
    const row = this.db.groups[groupId];
    return row && !row.deleted ? this.publicGroup(row) : null;
  }

  createGroup(ownerId: string, nameRaw: string): GroupResult {
    const name = nameRaw.trim().slice(0, 24) || '未命名群';
    const now = Date.now();
    const row: GroupRow = {
      id: `g_${crypto.randomBytes(8).toString('hex')}`,
      name,
      ownerId,
      members: [ownerId],
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    this.db.groups[row.id] = row;
    this.dirty = true;
    this.scheduleSave();
    return { ok: true, group: this.publicGroup(row) };
  }

  /** 按用户名拉人进群；已在群里的忽略，有查无此人的就整批拒绝 */
  invite(groupId: string, actorId: string, usernames: string[]): GroupResult {
    const row = this.db.groups[groupId];
    if (!row || row.deleted) return { ok: false, error: '群不存在', code: 404 };
    if (!row.members.includes(actorId)) return { ok: false, error: '你不在这个群里', code: 403 };

    const targets = usernames.map((u) => u.trim()).filter(Boolean);
    if (!targets.length) return { ok: false, error: '没有要邀请的人', code: 400 };

    const found: UserRow[] = [];
    const missing: string[] = [];
    for (const name of targets) {
      const user = this.userByName(name);
      if (!user) missing.push(name);
      else found.push(user);
    }
    if (missing.length) return { ok: false, error: `找不到用户：${missing.join('、')}`, code: 404 };

    const fresh = found.filter((u) => !row.members.includes(u.id));
    if (row.members.length + fresh.length > MAX_MEMBERS) {
      return { ok: false, error: `一个群最多 ${MAX_MEMBERS} 人`, code: 400 };
    }
    if (!fresh.length) return { ok: true, group: this.publicGroup(row) };

    row.members.push(...fresh.map((u) => u.id));
    row.updatedAt = Date.now();
    this.dirty = true;
    this.scheduleSave();
    return { ok: true, group: this.publicGroup(row) };
  }

  renameGroup(groupId: string, actorId: string, nameRaw: string): GroupResult {
    const row = this.db.groups[groupId];
    if (!row || row.deleted) return { ok: false, error: '群不存在', code: 404 };
    if (!row.members.includes(actorId)) return { ok: false, error: '你不在这个群里', code: 403 };
    const name = nameRaw.trim().slice(0, 24);
    if (!name) return { ok: false, error: '群名不能为空', code: 400 };
    row.name = name;
    row.updatedAt = Date.now();
    this.dirty = true;
    this.scheduleSave();
    return { ok: true, group: this.publicGroup(row) };
  }

  removeMember(groupId: string, actorId: string, targetId: string): GroupResult {
    const row = this.db.groups[groupId];
    if (!row || row.deleted) return { ok: false, error: '群不存在', code: 404 };
    if (row.ownerId !== actorId) return { ok: false, error: '只有群主可以移除成员', code: 403 };
    if (targetId === row.ownerId) return { ok: false, error: '群主不能移除自己，请直接退出', code: 400 };
    row.members = row.members.filter((id) => id !== targetId);
    row.updatedAt = Date.now();
    this.dirty = true;
    this.scheduleSave();
    return { ok: true, group: this.publicGroup(row) };
  }

  /** 退群；群主退出时把群主转给下一个成员，最后一个人退出则解散 */
  leaveGroup(
    groupId: string,
    userId: string,
  ): { ok: true; group: GroupPublic | null } | { ok: false; error: string; code: number } {
    const row = this.db.groups[groupId];
    if (!row || row.deleted) return { ok: false, error: '群不存在', code: 404 };
    if (!row.members.includes(userId)) return { ok: false, error: '你不在这个群里', code: 403 };

    row.members = row.members.filter((id) => id !== userId);
    if (!row.members.length) {
      row.deleted = true;
      row.updatedAt = Date.now();
      this.dirty = true;
      this.scheduleSave();
      return { ok: true, group: null };
    }
    if (row.ownerId === userId) row.ownerId = row.members[0];
    row.updatedAt = Date.now();
    this.dirty = true;
    this.scheduleSave();
    return { ok: true, group: this.publicGroup(row) };
  }

  /* ----------------------------- 空间 ----------------------------- */

  spacesOf(userId: string): Set<string> {
    const set = new Set<string>([`u:${userId}`]);
    for (const g of Object.values(this.db.groups)) {
      if (!g.deleted && g.members.includes(userId)) set.add(`g:${g.id}`);
    }
    return set;
  }

  canAccess(userId: string, spaceId: string): boolean {
    if (spaceId === `u:${userId}`) return true;
    if (!spaceId.startsWith('g:')) return false;
    const row = this.db.groups[spaceId.slice(2)];
    return Boolean(row && !row.deleted && row.members.includes(userId));
  }

  /** 某个空间的所有成员 id，用于广播 */
  membersOfSpace(spaceId: string): string[] {
    if (spaceId.startsWith('u:')) return [spaceId.slice(2)];
    if (!spaceId.startsWith('g:')) return [];
    const row = this.db.groups[spaceId.slice(2)];
    return row && !row.deleted ? [...row.members] : [];
  }

  /* ----------------------------- 数据 ----------------------------- */

  applyMany(ops: Op[], userId: string): StoredOp[] {
    const spaces = this.spacesOf(userId);
    const accepted: StoredOp[] = [];
    for (const op of ops) {
      const spaceId = op.spaceId || `u:${userId}`;
      if (!spaces.has(spaceId)) continue; // 无权写入的空间直接丢弃
      const stored = this.apply({ ...op, spaceId }, userId);
      if (stored) accepted.push(stored);
    }
    if (accepted.length) this.scheduleSave();
    return accepted;
  }

  private apply(op: Op, userId: string): StoredOp | null {
    if (!op?.id || !op?.entityId || !op?.hlc || !op?.entity) return null;
    const spaceId = op.spaceId || `u:${userId}`;
    if (this.seen.has(op.id)) {
      return this.db.ops.find((o) => o.id === op.id) ?? null;
    }

    const key = recordKey(spaceId, op.entity, op.entityId);
    const existing = this.db.records[key];
    if (existing && existing.hlc >= op.hlc) {
      this.seen.add(op.id);
      return null;
    }

    this.seen.add(op.id);
    this.db.seq += 1;
    const stored: StoredOp = { ...op, spaceId, seq: this.db.seq, userId };
    this.db.ops.push(stored);
    this.dirty = true;

    if (op.kind === 'del') {
      this.db.records[key] = {
        id: op.entityId,
        entity: op.entity,
        spaceId,
        hlc: op.hlc,
        deleted: true,
        updatedAt: Date.now(),
      };
    } else {
      this.db.records[key] = {
        ...(op.data ?? {}),
        id: op.entityId,
        entity: op.entity,
        spaceId,
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

  /** 只返回该用户可见空间的增量；since 过旧时返回 null 由调用方改发快照 */
  since(seq: number, userId: string): StoredOp[] | null {
    if (seq < this.db.minSeq) return null;
    const spaces = this.spacesOf(userId);
    return this.db.ops.filter((o) => o.seq > seq && spaces.has(o.spaceId));
  }

  allRecords(userId: string): StoredRecord[] {
    const spaces = this.spacesOf(userId);
    return Object.values(this.db.records).filter((r) => spaces.has(r.spaceId));
  }

  /** 按 id 取一条记录（带鉴权）：客户端本地缺这条时用它补取 */
  findRecord(userId: string, id: string): StoredRecord | null {
    for (const r of Object.values(this.db.records)) {
      if (r.id === id) return this.canAccess(userId, r.spaceId) ? r : null;
    }
    return null;
  }

  exportAll(userId: string, username: string) {
    return {
      version: 3,
      exportedAt: new Date().toISOString(),
      account: username,
      groups: this.groupsOf(userId),
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
