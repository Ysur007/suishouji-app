import { create } from 'zustand';
import { emitOp } from './bus';
import { debounce, idbGet, idbSet } from './idb';
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
  seq: 'ssj:seq',
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

type Rec = Memo | Folder;

interface AppState {
  ready: boolean;
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

const persist = debounce(() => {
  const { memos, folders } = useApp.getState();
  void idbSet('state', { memos, folders, savedAt: Date.now() });
}, 240);

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
  clientId: identity.clientId,
  deviceName: identity.deviceName,
  platform: identity.platform,
  memos: {},
  folders: {},
  tab: (localStorage.getItem(LS.tab) as Tab) || 'record',
  folderFilter: null,
  sync: { status: 'connecting', peers: [], pending: 0, lastAt: 0 },
  remoteHits: {},
  toast: null,

  async hydrate() {
    const snap = await idbGet<{ memos?: Record<string, Memo>; folders?: Record<string, Folder> }>('state');
    if (snap?.memos) {
      set((s) => ({
        // 本地刚产生的记录优先，其余用 IndexedDB 里的旧数据补齐
        memos: { ...snap.memos, ...s.memos },
        folders: { ...(snap.folders ?? {}), ...s.folders },
        ready: true,
      }));
    } else {
      set({ ready: true });
    }
  },

  addMemo({ text, images = [], folderId = null }) {
    const now = Date.now();
    const id = uid();
    const hlc = nextHLC();
    const memo: Memo = {
      id,
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

    // 文件夹删除后，里面的记录回到「未分类」，而不是一起消失
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

export function folderName(folders: Record<string, Folder>, id: string | null | undefined): string | null {
  if (!id) return null;
  const f = folders[id];
  return f && !f.deleted ? f.name : null;
}

export { LS };
