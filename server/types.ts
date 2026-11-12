/**
 * 同步协议与账号体系的数据结构。
 *
 * 关键约束：所有记录、操作日志、在线设备都以 userId 为分区键，
 * 服务端任何读取路径都必须带上 userId，否则就会串号。
 */

export type EntityKind = 'memo' | 'folder';

/** 记录归属的空间：个人 `u:<userId>` 或群 `g:<groupId>` */
export type SpaceId = string;
export type OpKind = 'put' | 'del';

export interface Op {
  /** Op 自身 id，幂等去重用（每次编辑都不一样） */
  id: string;
  /** 被操作的记录 id */
  entityId: string;
  /** 产生该 Op 的设备 id */
  clientId: string;
  /** 混合逻辑时钟，字典序可比较 */
  hlc: string;
  entity: EntityKind;
  kind: OpKind;
  /** 记录归属空间，缺省视为作者的个人空间 */
  spaceId?: SpaceId;
  /** put 时为完整记录快照（含 id / hlc） */
  data?: Record<string, unknown>;
}

/** 落库的 Op 额外带归属用户与服务端序号 */
export interface StoredOp extends Op {
  seq: number;
  userId: string;
  spaceId: SpaceId;
}

export interface StoredRecord {
  id: string;
  entity: EntityKind;
  hlc: string;
  spaceId: SpaceId;
  deleted?: boolean;
  [key: string]: unknown;
}

export interface GroupMember {
  id: string;
  username: string;
}

export interface GroupRow {
  id: string;
  name: string;
  ownerId: string;
  members: string[];
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface GroupPublic {
  id: string;
  name: string;
  ownerId: string;
  members: GroupMember[];
  createdAt: number;
  updatedAt: number;
}

export interface UserRow {
  id: string;
  username: string;
  salt: string;
  hash: string;
  createdAt: number;
}

export interface PublicUser {
  id: string;
  username: string;
}

export interface TokenRow {
  userId: string;
  createdAt: number;
  /** 对外暴露的短 id（不下发 token 本身），用于「在线设备」列表与下线 */
  id?: string;
  /** 握手时上报的设备信息，老 token 可能没有 */
  name?: string;
  platform?: string;
  clientId?: string;
  lastSeenAt?: number;
}

export interface Peer {
  clientId: string;
  name: string;
  platform: string;
  connectedAt: number;
  userId: string;
}

export interface ClientMessage {
  type: 'hello' | 'ops' | 'ping' | 'resync';
  clientId?: string;
  name?: string;
  platform?: string;
  since?: number;
  token?: string;
  ops?: Op[];
}

export type ServerMessage =
  | { type: 'ready'; seq: number; minSeq: number; peers: Peer[]; serverTime: number }
  | { type: 'ops'; seq: number; ops: StoredOp[] }
  | { type: 'sync'; seq: number; ops: StoredOp[] }
  | { type: 'reset'; seq: number; records: StoredRecord[] }
  | { type: 'ack'; seq: number; ids: string[] }
  | { type: 'presence'; peers: Peer[] }
  | { type: 'groups'; groups: GroupPublic[] }
  | { type: 'unauthorized'; reason: string }
  | { type: 'pong' };
