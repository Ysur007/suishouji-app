export type EntityKind = 'memo' | 'folder';
export type OpKind = 'put' | 'del';

export interface Memo {
  id: string;
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

export type SyncStatus = 'connecting' | 'online' | 'offline';

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

export type Tab = 'record' | 'space' | 'folders';

export const GLYPHS: GlyphKey[] = ['book', 'lines', 'spark', 'route', 'wave', 'check', 'code', 'camera'];
export const TONES: ToneKey[] = ['sand', 'clay', 'stone', 'moss', 'ink', 'plum'];
