export type EntityKind = 'memo' | 'folder';
export type OpKind = 'put' | 'del';

export interface Memo {
  id: string;
  /** 创建者设备 id，写入后不再变更，用于决定气泡在左还是右 */
  authorId?: string;
  text: string;
  images: string[];
  folderId: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  hlc: string;
  deleted: boolean;
}

export interface Folder {
  id: string;
  name: string;
  glyph: GlyphKey;
  tone: ToneKey;
  createdAt: number;
  updatedAt: number;
  hlc: string;
  deleted: boolean;
}

export type GlyphKey = 'book' | 'lines' | 'spark' | 'route' | 'wave' | 'check' | 'code' | 'camera';

export type ToneKey = 'sand' | 'clay' | 'stone' | 'moss' | 'ink' | 'plum';

export interface Op {
  id: string;
  entityId: string;
  clientId: string;
  hlc: string;
  entity: EntityKind;
  kind: OpKind;
  data?: Record<string, unknown>;
}

export interface Peer {
  clientId: string;
  name: string;
  platform: string;
  connectedAt: number;
}

export type SyncStatus = 'connecting' | 'online' | 'offline' | 'guest';

export interface SyncState {
  status: SyncStatus;
  peers: Peer[];
  pending: number;
  lastAt: number;
}

export interface Toast {
  id: number;
  text: string;
  tone?: 'default' | 'error';
}

export type Tab = 'record' | 'timeline' | 'space' | 'folders';

export const GLYPHS: GlyphKey[] = ['book', 'lines', 'spark', 'route', 'wave', 'check', 'code', 'camera'];
export const TONES: ToneKey[] = ['sand', 'clay', 'stone', 'moss', 'ink', 'plum'];
