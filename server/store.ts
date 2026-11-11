import fs from 'node:fs';
import path from 'node:path';
import type { Op, StoredOp, StoredRecord } from './types.js';

interface DB {
  v: 1;
  seq: number;
  minSeq: number;
  records: Record<string, StoredRecord>;
  ops: StoredOp[];
}

const MAX_OPS = 6000;
const TRIM_TO = 3000;

/**
 * 一个极简的「操作日志 + 快照」存储。
 *
 * 全部数据落在一个 JSON 文件里：先写临时文件再 rename，保证进程被杀也不会写出半个文件。
 * 对于个人笔记这个量级（万条以内），比引入数据库更省心，也方便直接备份 / 迁移。
 */
export class Store {
  private db: DB;
  private file: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  /** 已见过的 Op id，用于幂等（防止弱网重发写入两次） */
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
      const parsed = JSON.parse(raw) as DB;
      if (parsed && parsed.v === 1 && parsed.records) {
        parsed.ops ??= [];
        parsed.minSeq ??= parsed.seq;
        return parsed;
      }
    } catch {
      /* 首次启动没有文件，走默认值 */
    }
    return { v: 1, seq: 0, minSeq: 0, records: {}, ops: [] };
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

  /** 应用一批 Op，返回真正生效（含新 seq）的那些 */
  applyMany(ops: Op[]): StoredOp[] {
    const accepted: StoredOp[] = [];
    for (const op of ops) {
      const stored = this.apply(op);
      if (stored) accepted.push(stored);
    }
    if (accepted.length) this.scheduleSave();
    return accepted;
  }

  private apply(op: Op): StoredOp | null {
    if (!op?.id || !op?.entityId || !op?.hlc || !op?.entity) return null;
    if (this.seen.has(op.id)) {
      // 重复投递：找回归档里的 seq，让客户端可以推进游标
      const prev = this.db.ops.find((o) => o.id === op.id);
      return prev ?? null;
    }

    const key = `${op.entity}:${op.entityId}`;
    const existing = this.db.records[key];
    if (existing && existing.hlc >= op.hlc) {
      // 已有更新的版本，丢弃旧写入（但记住这个 op，避免重复处理）
      this.seen.add(op.id);
      return null;
    }

    this.seen.add(op.id);
    this.db.seq += 1;
    const stored: StoredOp = { ...op, seq: this.db.seq };
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

  /** 增量拉取；since 过旧时返回 null，调用方改发全量快照 */
  since(seq: number): StoredOp[] | null {
    if (seq < this.db.minSeq) return null;
    return this.db.ops.filter((o) => o.seq > seq);
  }

  allRecords(): StoredRecord[] {
    return Object.values(this.db.records);
  }

  exportAll() {
    return {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      records: this.allRecords(),
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
