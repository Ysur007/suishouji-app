import { create } from 'zustand';
import { apiLogout, clearAuth, readAuth, writeAuth, type AuthState, type AuthUser } from './auth';
import { emitAuthChange, emitOp } from './bus';
import { debounce, idbDel, idbGet, idbSet } from './idb';
import { configureClock, nextHLC, observeHLC } from './hlc';
import type { Folder, GlyphKey, Group, Memo, Op, Peer, SyncState, Tab, Toast, ToneKey } from './types';

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
  space: 'ssj:space',
  last: 'ssj:lastBucket',
  lastUser: 'ssj:lastUser',
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

function readLastUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LS.lastUser);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function saveLastUser(user: AuthUser) {
  localStorage.setItem(LS.lastUser, JSON.stringify(user));
}

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
  /** 当前内存数据所属的分区：未登录但保留着上一个账号的缓存时是 u:<id>，不是 guest */
  viewBucket: string;
  /** 退出后仍展示的那个账号，用于侧栏文案 */
  lastUser: AuthUser | null;
  clientId: string;
  deviceName: string;
  platform: string;
  memos: Record<string, Memo>;
  folders: Record<string, Folder>;
  groups: Record<string, Group>;
  /** 当前浏览的空间：个人 `u:<id>` 或群 `g:<id>` */
  activeSpace: string;
  tab: Tab;
  folderFilter: string | null;
  sync: SyncState;
  remoteHits: Record<string, number>;
  toast: Toast | null;

  hydrate: () => Promise<void>;
  signIn: (auth: AuthState) => Promise<void>;
  signOut: () => Promise<void>;
  expireSession: () => Promise<void>;
  clearCache: () => Promise<void>;

  addMemo: (input: { text: string; images?: string[]; folderId?: string | null }) => string;
  updateMemo: (id: string, patch: Partial<Pick<Memo, 'text' | 'folderId' | 'images' | 'pinned'>>) => void;
  deleteMemo: (id: string) => void;
  togglePin: (id: string) => void;

  addFolder: (input: { name: string; glyph: GlyphKey; tone: ToneKey }) => string;
  updateFolder: (id: string, patch: Partial<Pick<Folder, 'name' | 'glyph' | 'tone'>>) => void;
  deleteFolder: (id: string) => void;

  setGroups: (list: Group[]) => void;
  shareToGroup: (memoId: string, groupId: string) => void;
  setActiveSpace: (space: string) => void;
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
  const { viewBucket, memos, folders } = useApp.getState();
  await idbSet(stateKey(viewBucket), { memos, folders, savedAt: Date.now() });
}

const persist = debounce(() => {
  void writeState();
}, 240);

/** 立即写盘并等待完成：同步游标必须在这之后才能前进 */
export async function persistNow(): Promise<void> {
  await writeState();
}

function makeOp(
  entity: 'memo' | 'folder',
  entityId: string,
  kind: 'put' | 'del',
  hlc: string,
  spaceId: string,
  data?: unknown,
): Op {
  return {
    id: uid(),
    entityId,
    clientId: useApp.getState().clientId,
    hlc,
    entity,
    kind,
    spaceId,
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
  groups: {},
  activeSpace: 'guest',
  tab: (localStorage.getItem(LS.tab) as Tab) || 'record',
  folderFilter: null,
  viewBucket: 'guest',
  lastUser: null,
  sync: { status: 'guest', peers: [], pending: 0, lastAt: 0 },
  remoteHits: {},
  toast: null,

  async hydrate() {
    const auth = readAuth();
    // 未登录时若本机还留着上次账号的缓存，就继续展示它，而不是切到一个空白工作区
    const cachedBucket = localStorage.getItem(LS.last);
    let bucket = auth ? bucketOf(auth) : cachedBucket || 'guest';
    let snap = await idbGet<Snapshot>(stateKey(bucket));

    if (!auth && bucket !== 'guest' && !snap) {
      // 分区数据被清掉了，退回游客分区
      bucket = 'guest';
      snap = await idbGet<Snapshot>(stateKey(bucket));
    }

    // 旧版本没有账号概念，把匿名数据迁到游客分区
    if (!snap && bucket === 'guest') {
      const legacy = await idbGet<Snapshot & { savedAt?: number }>('state');
      if (legacy?.memos) {
        snap = { memos: legacy.memos, folders: legacy.folders ?? {} };
        await idbSet(stateKey('guest'), snap);
        await idbDel('state');
      }
    }

    const lastUser = readLastUser();
    const savedSpace = localStorage.getItem(LS.space);
    const activeSpace =
      savedSpace && (savedSpace === bucket || savedSpace.startsWith('g:')) ? savedSpace : bucket;
    set({
      auth,
      user: auth?.user ?? null,
      viewBucket: bucket,
      activeSpace,
      lastUser: auth?.user ?? (bucket === 'guest' ? null : lastUser),
      memos: snap?.memos ?? {},
      folders: snap?.folders ?? {},
      ready: true,
      sync: { status: auth ? 'connecting' : 'guest', peers: [], pending: 0, lastAt: 0 },
    });
  },

  /**
   * 登录 / 注册成功后：
   * 只有「原本就在游客分区」时，才把当前内容并进账号；已经是另一个账号的分区时不合并，
   * 避免把 A 的记录带进 B。合并后清空游客分区，再把游客来源的记录重放上传。
   */
  async signIn(auth) {
    const s = get();
    const bucket = bucketOf(auth);
    const sameBucket = s.viewBucket === bucket;
    const mergeGuest = s.viewBucket === 'guest';
    const guest: Snapshot = mergeGuest ? { memos: s.memos, folders: s.folders } : emptySnapshot();

    const target = sameBucket
      ? { memos: s.memos, folders: s.folders }
      : ((await idbGet<Snapshot>(stateKey(bucket))) ?? emptySnapshot());
    const merged = mergeSnapshots(target, guest);

    writeAuth(auth);
    saveLastUser(auth.user);
    localStorage.setItem(LS.last, bucket);
    set({
      auth,
      user: auth.user,
      viewBucket: bucket,
      activeSpace: bucket,
      lastUser: auth.user,
      groups: {},
      memos: merged.memos,
      folders: merged.folders,
      folderFilter: null,
      remoteHits: {},
      sync: { status: 'connecting', peers: [], pending: 0, lastAt: 0 },
    });
    await idbSet(stateKey(bucket), merged);
    if (mergeGuest) await idbSet(stateKey('guest'), emptySnapshot());

    // 游客期间写的记录：按原 hlc 重放到账号，冲突交给服务端 LWW 判定
    for (const m of Object.values(guest.memos)) {
      emitOp(makeOp('memo', m.id, 'put', m.hlc, m.spaceId ?? 'guest', m));
    }
    for (const f of Object.values(guest.folders)) emitOp(makeOp('folder', f.id, 'put', f.hlc, 'guest', f));

    emitAuthChange();
    if (Object.keys(guest.memos).length) {
      get().notify(`已登录，${Object.keys(guest.memos).length} 条本地记录已并入账号`);
    }
  },

  /**
   * 退出登录：只断开同步，本机这份记录继续显示。
   * 退出后新写的记录仍然写进该账号的分区（pending 队列同样按分区落盘），
   * 下次登录同一账号会把它们补传；登录别的账号则完全看不到。
   */
  async signOut() {
    const s = get();
    await persistNow();
    const token = s.auth?.token;
    const bucket = s.viewBucket;
    if (token) void apiLogout(token);
    clearAuth();
    if (bucket !== 'guest') localStorage.setItem(LS.last, bucket);
    set({
      auth: null,
      user: null,
      lastUser: s.auth?.user ?? s.lastUser,
      activeSpace: s.viewBucket,
      groups: {},
      tab: 'record',
      sync: { status: 'guest', peers: [], pending: 0, lastAt: 0 },
    });
    localStorage.setItem(LS.space, s.viewBucket);
    emitAuthChange();
    void persistNow();
    get().notify('已退出登录，记录仍保留在本机');
  },

  /** token 失效：同样保留本机数据，只停同步 */
  async expireSession() {
    const s = get();
    await persistNow();
    clearAuth();
    set({
      auth: null,
      user: null,
      lastUser: s.auth?.user ?? s.lastUser,
      activeSpace: s.viewBucket,
      groups: {},
      tab: 'record',
      sync: { status: 'guest', peers: [], pending: 0, lastAt: 0 },
    });
    localStorage.setItem(LS.space, s.viewBucket);
    emitAuthChange();
    void persistNow();
    get().notify('登录已失效，记录仍留在本机', 'error');
  },

  /** 只清本机缓存，不动云端；仅在没有登录时提供 */
  async clearCache() {
    if (get().auth) return;
    const bucket = get().viewBucket;
    set({
      memos: {},
      folders: {},
      folderFilter: null,
      remoteHits: {},
      viewBucket: 'guest',
      activeSpace: 'guest',
      lastUser: null,
      groups: {},
    });
    await idbSet(stateKey(bucket), emptySnapshot());
    if (bucket !== 'guest') await idbDel(seqKey(bucket));
    localStorage.removeItem(LS.last);
    localStorage.removeItem(LS.lastUser);
    localStorage.removeItem(LS.space);
    get().notify('本机缓存已清除，云端记录不受影响');
  },

  addMemo({ text, images = [], folderId = null }) {
    const s = get();
    const now = Date.now();
    const id = uid();
    const hlc = nextHLC();
    const space = s.activeSpace;
    const memo: Memo = {
      id,
      authorId: s.clientId,
      ownerId: s.user?.id ?? `guest:${s.clientId}`,
      ownerName: s.user?.username ?? '未登录',
      spaceId: space,
      text: text.trim(),
      images,
      folderId,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      hlc,
      deleted: false,
    };
    emitOp(makeOp('memo', id, 'put', hlc, space, memo));
    set((s) => ({ memos: { ...s.memos, [id]: memo } }));
    persist();
    return id;
  },

  updateMemo(id, patch) {
    const cur = get().memos[id];
    if (!cur) return;
    const hlc = nextHLC();
    const next: Memo = { ...cur, ...patch, updatedAt: Date.now(), hlc };
    emitOp(makeOp('memo', id, 'put', hlc, next.spaceId ?? get().viewBucket, next));
    set((s) => ({ memos: { ...s.memos, [id]: next } }));
    persist();
  },

  deleteMemo(id) {
    const cur = get().memos[id];
    if (!cur) return;
    const hlc = nextHLC();
    emitOp(makeOp('memo', id, 'del', hlc, cur.spaceId ?? get().viewBucket));
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
    emitOp(makeOp('folder', id, 'put', hlc, get().viewBucket, folder));
    set((s) => ({ folders: { ...s.folders, [id]: folder } }));
    persist();
    return id;
  },

  updateFolder(id, patch) {
    const cur = get().folders[id];
    if (!cur) return;
    const hlc = nextHLC();
    const next: Folder = { ...cur, ...patch, updatedAt: Date.now(), hlc };
    emitOp(makeOp('folder', id, 'put', hlc, get().viewBucket, next));
    set((s) => ({ folders: { ...s.folders, [id]: next } }));
    persist();
  },

  deleteFolder(id) {
    const cur = get().folders[id];
    if (!cur) return;

    const now = Date.now();
    const folderHlc = nextHLC();
    const ops: Op[] = [makeOp('folder', id, 'del', folderHlc, get().viewBucket)];

    const memos = { ...get().memos };
    for (const m of Object.values(memos)) {
      if (m.folderId !== id || m.deleted) continue;
      const hlc = nextHLC();
      const next: Memo = { ...m, folderId: null, updatedAt: now, hlc };
      ops.push(makeOp('memo', m.id, 'put', hlc, m.spaceId ?? get().viewBucket, next));
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

  /** 把一条个人记录复制到群里（原记录不动，群里是一份带 sharedFrom 的副本） */
  shareToGroup(memoId, groupId) {
    const s = get();
    const memo = s.memos[memoId];
    const group = s.groups[groupId];
    if (!memo || memo.deleted || !group) return;
    if (!s.user) {
      s.notify('登录后才能共享到群', 'error');
      return;
    }
    const now = Date.now();
    const hlc = nextHLC();
    const id = uid();
    const copy: Memo = {
      ...memo,
      id,
      spaceId: `g:${groupId}`,
      folderId: null,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      hlc,
      ownerId: s.user.id,
      ownerName: s.user.username,
      authorId: s.clientId,
      sharedFrom: memo.id,
    };
    emitOp(makeOp('memo', id, 'put', hlc, copy.spaceId as string, copy));
    set((st) => ({ memos: { ...st.memos, [id]: copy } }));
    persist();
    get().notify(`已共享到「${group.name}」`);
  },

  setGroups(list) {
    const groups: Record<string, Group> = {};
    for (const g of list) groups[g.id] = g;
    const s = get();
    const active = s.activeSpace;
    // 当前停留的群没了（被移出 / 解散 / 自己退出），退回个人空间
    const fallback =
      active.startsWith('g:') && !groups[active.slice(2)] ? s.viewBucket : active;
    set({ groups, activeSpace: fallback });
    if (fallback !== active) localStorage.setItem(LS.space, fallback);
  },

  setActiveSpace(space) {
    localStorage.setItem(LS.space, space);
    set({ activeSpace: space, folderFilter: null, tab: 'record' });
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
        const record = { ...op.data } as Record<string, unknown>;
        if (!record.spaceId && op.spaceId) record.spaceId = op.spaceId;
        bucket[op.entityId] = record as unknown as Rec;
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
        emitOp(makeOp('folder', id, 'put', hlc, get().viewBucket, folder));
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
          spaceId: get().viewBucket,
          ownerId: get().user?.id,
          ownerName: get().user?.username,
        };
        memos[id] = memo;
        emitOp(makeOp('memo', id, 'put', hlc, memo.spaceId as string, memo));
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
/** 当前空间里的记录：老数据没有 spaceId 时归到所在分区 */
export function memosInSpace(memos: Record<string, Memo>, space: string, fallback: string): Memo[] {
  return liveMemos(memos).filter((m) => (m.spaceId ?? fallback) === space);
}

/**
 * 气泡在左还是右，只看账号：同一账号在手机和电脑上写的都在右侧。
 * 游客态没有账号，退回按设备判断；没有 ownerId 的老记录都算自己。
 */
export function isMyMemo(memo: Memo, userId: string | null | undefined, clientId: string): boolean {
  if (memo.ownerId) {
    return userId ? memo.ownerId === userId : memo.ownerId === `guest:${clientId}`;
  }
  // 没有 ownerId 的老记录：个人空间里的必然属于本分区（也就是我），群里的按设备兜底
  if (!memo.spaceId || memo.spaceId.startsWith('u:')) return true;
  return memo.authorId ? memo.authorId === clientId : true;
}

export function memoAuthor(memo: Memo): string {
  return memo.authorId ?? memo.hlc.split('-')[2] ?? '';
}

export function folderName(folders: Record<string, Folder>, id: string | null | undefined): string | null {
  if (!id) return null;
  const f = folders[id];
  return f && !f.deleted ? f.name : null;
}

export { LS };
