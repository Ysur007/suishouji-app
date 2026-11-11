import { create } from 'zustand';
import { apiLogout, clearAuth, readAuth, writeAuth, type AuthState, type AuthUser } from './auth';
import { emitAuthChange, emitOp } from './bus';
import { debounce, idbDel, idbGet, idbSet } from './idb';
import { configureClock, nextHLC, observeHLC } from './hlc';
import type { Folder, GlyphKey, Memo, Op, Peer, SyncState, Tab, Toast, ToneKey } from './types';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Web';
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}

const LS = {
  client: 'ssj:client',
  name: 'ssj:device',
  tab: 'ssj:tab',
};

function bootIdentity() {
  let clientId = localStorage.getItem(LS.client);
  if (!clientId) {
    clientId = uid().slice(0, 8);
    localStorage.setItem(LS.client, clientId);
  }
  let deviceName = localStorage.getItem(LS.name);
  if (!deviceName) {
    deviceName = `${detectPlatform()} · ${detectBrowser()}`;
    localStorage.setItem(LS.name, deviceName);
  }
  return { clientId, deviceName, platform: detectPlatform() };
}

const identity = bootIdentity();
configureClock(identity.clientId);

/* ------------------------- 账号分区 ------------------------- */

export type Snapshot = { memos: Record<string, Memo>; folders: Record<string, Folder> };

export const bucketOf = (auth: AuthState | null) => (auth ? `u:${auth.user.id}` : 'guest');
export const stateKey = (bucket: string) => `state:${bucket}`;
export const seqKey = (bucket: string) => `ssj:seq:${bucket}`;
export const pendingKey = (bucket: string) => `pending:${bucket}`;

const emptySnapshot = (): Snapshot => ({ memos: {}, folders: {} });

/** 同一 id 取 hlc 更大的一方，用于「本地游客记录 ↔ 账号已有记录」的合并 */
function mergeSnapshots(a: Snapshot, b: Snapshot): Snapshot {
  const memos: Record<string, Memo> = { ...a.memos };
  const folders: Record<string, Folder> = { ...a.folders };
  for (const [id, m] of Object.entries(b.memos)) {
    if (!memos[id] || memos[id].hlc < m.hlc) memos[id] = m;
  }
  for (const [id, f] of Object.entries(b.folders)) {
    if (!folders[id] || folders[id].hlc < f.hlc) folders[id] = f;
  }
  return { memos, folders };
}

type Rec = Memo | Folder;

interface AppState {
  ready: boolean;
  auth: AuthState | null;
  user: AuthUser | null;
  clientId: string;
  deviceName: string;
  platform: string;
  memos: Record<string, Memo>;
  folders: Record<string, Folder>;
  tab: Tab;
  folderFilter: string | null;
  sync: SyncState;
  remoteHits: Record<string, number>;
  toast: Toast | null;

  hydrate: () => Promise<void>;
  signIn: (auth: AuthState) => Promise<void>;
  signOut: () => Promise<void>;
  expireSession: () => Promise<void>;

  addMemo: (input: { text: string; images?: string[]; folderId?: string | null }) => string;
  updateMemo: (id: string, patch: Partial<Pick<Memo, 'text' | 'folderId' | 'images' | 'pinned'>>) => void;
  deleteMemo: (id: string) => void;
  togglePin: (id: string) => void;

  addFolder: (input: { name: string; glyph: GlyphKey; tone: ToneKey }) => string;
  updateFolder: (id: string, patch: Partial<Pick<Folder, 'name' | 'glyph' | 'tone'>>) => void;
  deleteFolder: (id: string) => void;

  setTab: (tab: Tab) => void;
  setFolderFilter: (id: string | null) => void;
  applyOps: (ops: Op[]) => void;
  applySnapshot: (records: Array<{ id: string; entity?: string; hlc: string; deleted?: boolean } & Record<string, unknown>>) => void;
  setSync: (patch: Partial<SyncState>) => void;
  setPeers: (peers: Peer[]) => void;
  importData: (records: Array<Record<string, unknown>>) => number;
  notify: (text: string, tone?: 'default' | 'error') => void;
  dismissToast: () => void;
}

async function writeState() {
  const { auth, memos, folders } = useApp.getState();
  await idbSet(stateKey(bucketOf(auth)), { memos, folders, savedAt: Date.now() });
}

const persist = debounce(() => {
  void writeState();
}, 240);

/** 立即写盘并等待完成：同步游标必须在这之后才能前进 */
export async function persistNow(): Promise<void> {
  await writeState();
}

function makeOp(entity: 'memo' | 'folder', entityId: string, kind: 'put' | 'del', hlc: string, data?: unknown): Op {
  return {
    id: uid(),
    entityId,
    clientId: useApp.getState().clientId,
    hlc,
    entity,
    kind,
    data: data as Record<string, unknown> | undefined,
  };
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  auth: null,
  user: null,
  clientId: identity.clientId,
  deviceName: identity.deviceName,
  platform: identity.platform,
  memos: {},
  folders: {},
  tab: (localStorage.getItem(LS.tab) as Tab) || 'record',
  folderFilter: null,
  sync: { status: 'guest', peers: [], pending: 0, lastAt: 0 },
  remoteHits: {},
  toast: null,

  async hydrate() {
    const auth = readAuth();
    let snap = await idbGet<Snapshot>(stateKey(bucketOf(auth)));

    // 旧版本没有账号概念，把匿名数据迁到游客分区
    if (!snap && !auth) {
      const legacy = await idbGet<Snapshot & { savedAt?: number }>('state');
      if (legacy?.memos) {
        snap = { memos: legacy.memos, folders: legacy.folders ?? {} };
        await idbSet(stateKey('guest'), snap);
        await idbDel('state');
      }
    }

    set({
      auth,
      user: auth?.user ?? null,
      memos: snap?.memos ?? {},
      folders: snap?.folders ?? {},
      ready: true,
      sync: { status: auth ? 'connecting' : 'guest', peers: [], pending: 0, lastAt: 0 },
    });
  },

  /** 登录 / 注册成功后：合并游客记录 → 写入账号分区 → 清空游客分区 → 重放游客记录到云端 */
  async signIn(auth) {
    const s = get();
    const guest: Snapshot = s.auth ? emptySnapshot() : { memos: s.memos, folders: s.folders };
    const target = (await idbGet<Snapshot>(stateKey(bucketOf(auth)))) ?? emptySnapshot();
    const merged = mergeSnapshots(target, guest);

    writeAuth(auth);
    set({
      auth,
      user: auth.user,
      memos: merged.memos,
      folders: merged.folders,
      folderFilter: null,
      remoteHits: {},
      sync: { status: 'connecting', peers: [], pending: 0, lastAt: 0 },
    });
    await idbSet(stateKey(bucketOf(auth)), merged);
    await idbSet(stateKey('guest'), emptySnapshot());

    // 游客期间写的记录：按原 hlc 重放到账号，冲突交给服务端 LWW 判定
    for (const m of Object.values(guest.memos)) emitOp(makeOp('memo', m.id, 'put', m.hlc, m));
    for (const f of Object.values(guest.folders)) emitOp(makeOp('folder', f.id, 'put', f.hlc, f));

    emitAuthChange();
    if (Object.keys(guest.memos).length) {
      get().notify(`已登录，${Object.keys(guest.memos).length} 条本地记录已并入账号`);
    }
  },

  async signOut() {
    const s = get();
    await persistNow();
    const token = s.auth?.token;
    if (token) void apiLogout(token);
    clearAuth();
    set({
      auth: null,
      user: null,
      memos: {},
      folders: {},
      folderFilter: null,
      remoteHits: {},
      sync: { status: 'guest', peers: [], pending: 0, lastAt: 0 },
    });
    // 退出后本地从空白开始，账号内容留在服务端与该账号分区里
    await idbSet(stateKey('guest'), emptySnapshot());
    emitAuthChange();
    get().notify('已退出登录，之后的记录只保存在本机');
  },

  /** token 失效：保留本地回退到游客，不做任何云端写入 */
  async expireSession() {
    await persistNow();
    clearAuth();
    set({
      auth: null,
      user: null,
      memos: {},
      folders: {},
      folderFilter: null,
      remoteHits: {},
      sync: { status: 'guest', peers: [], pending: 0, lastAt: 0 },
    });
    await idbSet(stateKey('guest'), emptySnapshot());
    emitAuthChange();
    get().notify('登录已失效，已切回本地模式', 'error');
  },

  addMemo({ text, images = [], folderId = null }) {
    const now = Date.now();
    const id = uid();
    const hlc = nextHLC();
    const memo: Memo = {
      id,
      authorId: get().clientId,
      text: text.trim(),
      images,
      folderId,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      hlc,
      deleted: false,
    };
    emitOp(makeOp('memo', id, 'put', hlc, memo));
    set((s) => ({ memos: { ...s.memos, [id]: memo } }));
    persist();
    return id;
  },

  updateMemo(id, patch) {
    const cur = get().memos[id];
    if (!cur) return;
    const hlc = nextHLC();
    const next: Memo = { ...cur, ...patch, updatedAt: Date.now(), hlc };
    emitOp(makeOp('memo', id, 'put', hlc, next));
    set((s) => ({ memos: { ...s.memos, [id]: next } }));
    persist();
  },

  deleteMemo(id) {
    const cur = get().memos[id];
    if (!cur) return;
    const hlc = nextHLC();
    emitOp(makeOp('memo', id, 'del', hlc));
    set((s) => ({ memos: { ...s.memos, [id]: { ...cur, deleted: true, hlc, updatedAt: Date.now() } } }));
    persist();
  },

  togglePin(id) {
    const cur = get().memos[id];
    if (!cur) return;
    get().updateMemo(id, { pinned: !cur.pinned });
  },

  addFolder({ name, glyph, tone }) {
    const now = Date.now();
    const id = uid();
    const hlc = nextHLC();
    const folder: Folder = {
      id,
      name: name.trim() || '未命名文件夹',
      glyph,
      tone,
      createdAt: now,
      updatedAt: now,
      hlc,
      deleted: false,
    };
    emitOp(makeOp('folder', id, 'put', hlc, folder));
    set((s) => ({ folders: { ...s.folders, [id]: folder } }));
    persist();
    return id;
  },

  updateFolder(id, patch) {
    const cur = get().folders[id];
    if (!cur) return;
    const hlc = nextHLC();
    const next: Folder = { ...cur, ...patch, updatedAt: Date.now(), hlc };
    emitOp(makeOp('folder', id, 'put', hlc, next));
    set((s) => ({ folders: { ...s.folders, [id]: next } }));
    persist();
  },

  deleteFolder(id) {
    const cur = get().folders[id];
    if (!cur) return;

    const now = Date.now();
    const folderHlc = nextHLC();
    const ops: Op[] = [makeOp('folder', id, 'del', folderHlc)];

    const memos = { ...get().memos };
    for (const m of Object.values(memos)) {
      if (m.folderId !== id || m.deleted) continue;
      const hlc = nextHLC();
      const next: Memo = { ...m, folderId: null, updatedAt: now, hlc };
      ops.push(makeOp('memo', m.id, 'put', hlc, next));
      memos[m.id] = next;
    }

    for (const op of ops) emitOp(op);
    set((s) => ({
      folders: { ...s.folders, [id]: { ...cur, deleted: true, hlc: folderHlc, updatedAt: now } },
      memos,
      folderFilter: s.folderFilter === id ? null : s.folderFilter,
    }));
    persist();
  },

  setTab(tab) {
    localStorage.setItem(LS.tab, tab);
    set({ tab });
  },

  setFolderFilter(folderFilter) {
    set({ folderFilter });
  },

  applyOps(ops) {
    if (!ops.length) return;
    const s = get();
    const memos = { ...s.memos };
    const folders = { ...s.folders };
    const remoteHits: Record<string, number> = {};
    const now = Date.now();
    for (const [k, v] of Object.entries(s.remoteHits)) {
      if (now - v < 8000) remoteHits[k] = v;
    }

    let changed = false;
    for (const op of ops) {
      observeHLC(op.hlc);
      const bucket: Record<string, Rec> = op.entity === 'memo' ? memos : folders;
      const cur = bucket[op.entityId];
      if (cur && cur.hlc >= op.hlc) continue;

      if (op.kind === 'del') {
        if (!cur) continue;
        bucket[op.entityId] = { ...cur, deleted: true, hlc: op.hlc } as Rec;
      } else {
        if (!op.data) continue;
        bucket[op.entityId] = op.data as unknown as Rec;
        if (op.clientId !== s.clientId) remoteHits[op.entityId] = now;
      }
      changed = true;
    }

    if (!changed && Object.keys(remoteHits).length === Object.keys(s.remoteHits).length) return;
    set({ memos, folders, remoteHits });
    if (changed) persist();
  },

  applySnapshot(records) {
    const s = get();
    const memos = { ...s.memos };
    const folders = { ...s.folders };
    for (const rec of records) {
      const bucket: Record<string, Rec> = rec.entity === 'folder' ? folders : memos;
      const cur = bucket[rec.id];
      if (cur && cur.hlc >= rec.hlc) continue;
      if (rec.deleted) {
        if (cur) bucket[rec.id] = { ...cur, deleted: true, hlc: rec.hlc } as Rec;
      } else {
        bucket[rec.id] = rec as unknown as Rec;
      }
    }
    set({ memos, folders });
    persist();
  },

  setSync(patch) {
    set((s) => ({ sync: { ...s.sync, ...patch } }));
  },

  setPeers(peers) {
    set((s) => ({ sync: { ...s.sync, peers } }));
  },

  /** 从备份文件恢复：重新盖上新的 HLC 再广播，等同于「以备份为准重放一次」 */
  importData(records) {
    const memos = { ...get().memos };
    const folders = { ...get().folders };
    let count = 0;

    for (const raw of records) {
      if (!raw || typeof raw !== 'object') continue;
      const id = String(raw.id ?? '');
      if (!id) continue;
      const entity = raw.entity === 'folder' ? 'folder' : 'memo';
      const hlc = nextHLC();
      const now = Date.now();
      if (entity === 'folder') {
        const folder: Folder = {
          id,
          name: String(raw.name ?? '未命名文件夹'),
          glyph: (raw.glyph as GlyphKey) ?? 'book',
          tone: (raw.tone as ToneKey) ?? 'sand',
          createdAt: Number(raw.createdAt ?? now),
          updatedAt: now,
          hlc,
          deleted: false,
        };
        folders[id] = folder;
        emitOp(makeOp('folder', id, 'put', hlc, folder));
      } else {
        const memo: Memo = {
          id,
          authorId: String(raw.authorId ?? raw.hlc?.toString().split('-')[2] ?? get().clientId),
          text: String(raw.text ?? ''),
          images: Array.isArray(raw.images) ? (raw.images as string[]) : [],
          folderId: (raw.folderId as string | null) ?? null,
          pinned: Boolean(raw.pinned),
          createdAt: Number(raw.createdAt ?? now),
          updatedAt: now,
          hlc,
          deleted: false,
        };
        memos[id] = memo;
        emitOp(makeOp('memo', id, 'put', hlc, memo));
      }
      count += 1;
    }

    set({ memos, folders });
    persist();
    return count;
  },

  notify(text, tone = 'default') {
    const id = Date.now();
    set({ toast: { id, text, tone } });
    window.setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 2400);
  },

  dismissToast() {
    set({ toast: null });
  },
}));

/* -------------------------- 选择器工具 -------------------------- */

export function liveMemos(memos: Record<string, Memo>): Memo[] {
  return Object.values(memos)
    .filter((m) => !m.deleted)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function liveFolders(folders: Record<string, Folder>): Folder[] {
  return Object.values(folders)
    .filter((f) => !f.deleted)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** 记录的作者设备；老数据没有 authorId 时从 hlc 尾部回退解析 */
export function memoAuthor(memo: Memo): string {
  return memo.authorId ?? memo.hlc.split('-')[2] ?? '';
}

export function folderName(folders: Record<string, Folder>, id: string | null | undefined): string | null {
  if (!id) return null;
  const f = folders[id];
  return f && !f.deleted ? f.name : null;
}

export { LS };
