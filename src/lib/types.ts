export type EntityKind = 'memo' | 'folder';
export type OpKind = 'put' | 'del';

export interface Memo {
  id: string;
  /** 创建者设备 id，用于「来自哪台设备」的展示 */
  authorId?: string;
  /** 创建者账号 id：气泡在左还是右按它判断，同一账号多台设备一致 */
  ownerId?: string;
  /** 创建者用户名快照，群聊里显示在气泡上方 */
  ownerName?: string;
  /** 归属空间：个人 `u:<userId>` 或群 `g:<groupId>` */
  spaceId?: string;
  /** 由哪条记录共享而来（群里的副本指向原记录） */
  sharedFrom?: string;
  /**
   * 整理页里「待办」的勾选状态：动作项文本 → 完成时间。
   * 存在记录上而不是 localStorage，是为了换设备 / 换浏览器时勾选还在（跟着 op 同步）。
   */
  todoDone?: Record<string, number>;
  text: string;
  images: string[];
  folderId: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  hlc: string;
  deleted: boolean;
}

export interface GroupMember {
  id: string;
  username: string;
}

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  members: GroupMember[];
  createdAt: number;
  updatedAt: number;
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
  /** 记录归属空间，缺省视为作者的个人空间 */
  spaceId?: string;
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
