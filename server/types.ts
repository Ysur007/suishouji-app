/**
 * 同步协议的数据结构。
 *
 * 客户端与服务端共用同一套 Op（操作）模型：
 *  - 每一次写入都变成一条不可变的 Op；
 *  - 记录上带一个 HLC（混合逻辑时钟）字符串，用于「后写覆盖」的冲突消解；
 *  - 删除是墓碑（kind = "del"），因此多端离线删除也能正确收敛。
 */

export type EntityKind = 'memo' | 'folder';
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
  /** put 时为完整记录快照（含 id / hlc） */
  data?: Record<string, unknown>;
}

export interface StoredOp extends Op {
  /** 服务端单调递增序号，客户端用它做增量拉取 */
  seq: number;
}

export interface StoredRecord {
  id: string;
  entity: EntityKind;
  hlc: string;
  deleted?: boolean;
  [key: string]: unknown;
}

export interface Peer {
  clientId: string;
  name: string;
  platform: string;
  connectedAt: number;
}

export interface ClientMessage {
  type: 'hello' | 'ops' | 'ping';
  clientId?: string;
  name?: string;
  platform?: string;
  since?: number;
  ops?: Op[];
}

export type ServerMessage =
  | { type: 'ready'; seq: number; minSeq: number; peers: Peer[]; serverTime: number }
  | { type: 'ops'; seq: number; ops: StoredOp[] }
  | { type: 'sync'; seq: number; ops: StoredOp[] }
  | { type: 'reset'; seq: number; records: StoredRecord[] }
  | { type: 'ack'; seq: number; ids: string[] }
  | { type: 'presence'; peers: Peer[] }
  | { type: 'pong' };
