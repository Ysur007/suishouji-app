import { onAuthChange, onOp } from './bus';
import { debounce, idbGet, idbSet } from './idb';
import { bucketOf, pendingKey, persistNow, seqKey, useApp } from './store';
import type { Op, Peer } from './types';

type ServerMessage =
  | { type: 'ready'; seq: number; minSeq: number; peers: Peer[]; serverTime: number }
  | { type: 'ops'; seq: number; ops: Op[] }
  | { type: 'sync'; seq: number; ops: Op[] }
  | { type: 'reset'; seq: number; records: Array<Record<string, unknown>> }
  | { type: 'ack'; seq: number; ids: string[] }
  | { type: 'presence'; peers: Peer[] }
  | { type: 'unauthorized'; reason: string }
  | { type: 'pong' };

const MAX_BACKOFF = 8000;

class SyncClient {
  private ws: WebSocket | null = null;
  private queue: Op[] = [];
  private inflight: Op[] = [];
  private since = 0;
  private retry = 0;
  private reconnectTimer: number | null = null;
  private flushTimer: number | null = null;
  private started = false;
  private bucket = 'guest';
  /** 已退出但仍停留在某个账号分区时，先攒在本机，登录同一账号再补传 */
  private offlineQueue = new Map<string, Op[]>();
  private offlineTimer: number | null = null;

  start() {
    if (this.started) return;
    this.started = true;

    // 未登录不产生任何云端写入；但如果还停在上一个账号的分区里，
    // 这些写入要攒到该分区的待发队列，下次登录同一账号补传
    onOp((op) => {
      const st = useApp.getState();
      if (st.auth) {
        this.enqueue(op);
        return;
      }
      if (st.viewBucket.startsWith('u:')) this.queueForBucket(st.viewBucket, op);
    });
    onAuthChange(() => {
      void this.restart();
    });

    void this.restart();

    window.addEventListener('online', () => this.hardReconnect());
    window.addEventListener('offline', () => {
      if (useApp.getState().auth) useApp.getState().setSync({ status: 'offline', peers: [] });
    });
    window.addEventListener('beforeunload', () => {
      this.savePending();
      void this.flushOffline();
    });
    window.addEventListener('pagehide', () => {
      void this.flushOffline();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.hardReconnect();
    });
  }

  /**
   * 切换账号（或退出）时重建连接与队列。
   *
   * 关键点：游客 → 账号 的切换不能丢队列，刚入队的「重放游客记录」必须跟着一起走；
   * 而账号 A → 账号 B 的切换绝不能把 A 的未发送操作推给 B，所以只在
   * 「原本是游客」或「账号没变」时继承内存队列。
   */
  async restart() {
    const auth = useApp.getState().auth;

    // 先把攒在内存里的「退出期间写入」落盘，否则下面读 pending 会漏掉它们
    await this.flushOffline();
    const prevBucket = this.bucket;
    const nextBucket = auth ? bucketOf(auth) : 'guest';

    // 旧账号的未发送操作落盘保存（退出后再次登录还能补发）
    if (prevBucket !== 'guest') this.savePending();

    const carried =
      prevBucket === 'guest' || prevBucket === nextBucket
        ? [...this.inflight, ...this.queue]
        : [];

    this.close();
    this.queue = [];
    this.inflight = [];

    if (!auth) {
      this.bucket = 'guest';
      this.since = 0;
      useApp.getState().setSync({ status: 'guest', peers: [], pending: 0 });
      return;
    }

    this.bucket = nextBucket;
    this.since = Number(localStorage.getItem(seqKey(nextBucket)) ?? 0) || 0;

    const saved = await idbGet<Op[]>(pendingKey(nextBucket));
    const seen = new Set<string>();
    const merged: Op[] = [];
    for (const op of [...(Array.isArray(saved) ? saved : []), ...carried]) {
      if (seen.has(op.id)) continue;
      seen.add(op.id);
      merged.push(op);
    }
    this.queue = merged;
    this.syncPendingCount();
    this.connect();
  }

  private queueForBucket(bucket: string, op: Op) {
    const list = this.offlineQueue.get(bucket) ?? [];
    list.push(op);
    this.offlineQueue.set(bucket, list);
    useApp.getState().setSync({ pending: list.length });
    if (this.offlineTimer) return;
    this.offlineTimer = window.setTimeout(() => {
      this.offlineTimer = null;
      void this.flushOffline();
    }, 260);
  }

  private async flushOffline() {
    if (!this.offlineQueue.size) return;
    const entries = [...this.offlineQueue.entries()];
    this.offlineQueue.clear();
    for (const [bucket, ops] of entries) {
      const saved = (await idbGet<Op[]>(pendingKey(bucket))) ?? [];
      const seen = new Set((Array.isArray(saved) ? saved : []).map((o) => o.id));
      const merged = (Array.isArray(saved) ? saved : []).concat(ops.filter((o) => !seen.has(o.id)));
      await idbSet(pendingKey(bucket), merged);
    }
  }

  private savePending() {
    if (this.bucket === 'guest') return;
    void idbSet(pendingKey(this.bucket), [...this.inflight, ...this.queue]);
  }

  private syncPendingCount() {
    useApp.getState().setSync({ pending: this.queue.length + this.inflight.length });
  }

  enqueue(op: Op) {
    this.queue.push(op);
    this.syncPendingCount();
    this.persistPending();
    if (this.flushTimer) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 60);
  }

  private persistPending = debounce(() => {
    this.savePending();
  }, 200);

  private flush() {
    if (!this.queue.length) return;
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const batch = this.queue.splice(0, this.queue.length);
    this.inflight.push(...batch);
    try {
      ws.send(JSON.stringify({ type: 'ops', ops: batch }));
    } catch {
      this.queue.unshift(...batch);
      this.inflight = this.inflight.filter((o) => !batch.includes(o));
    }
    this.syncPendingCount();
    this.persistPending();
  }

  private connect() {
    const auth = useApp.getState().auth;
    if (!auth) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    const { clientId, deviceName, platform, setSync } = useApp.getState();
    setSync({ status: 'connecting' });

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      ws.send(
        JSON.stringify({
          type: 'hello',
          clientId,
          name: deviceName,
          platform,
          since: this.since,
          token: auth.token,
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        this.handle(JSON.parse(event.data as string) as ServerMessage);
      } catch {
        /* 忽略畸形消息 */
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      if (this.inflight.length) {
        this.queue.unshift(...this.inflight);
        this.inflight = [];
      }
      if (!useApp.getState().auth) return;
      useApp.getState().setSync({ status: 'offline', peers: [], pending: this.queue.length });
      this.persistPending();
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
  }

  private close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      /* noop */
    }
  }

  private hardReconnect() {
    if (!useApp.getState().auth) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.flush();
      return;
    }
    this.retry = 0;
    this.connect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(600 * 2 ** this.retry, MAX_BACKOFF) + Math.random() * 240;
    this.retry += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private handle(msg: ServerMessage) {
    const app = useApp.getState();
    switch (msg.type) {
      case 'ready': {
        app.setSync({ status: 'online', peers: msg.peers, lastAt: Date.now() });
        this.flush();
        break;
      }
      case 'sync':
      case 'ops': {
        if (msg.ops.length) app.applyOps(msg.ops);
        void this.commit(msg.seq);
        app.setSync({ status: 'online', lastAt: Date.now() });
        if (msg.type === 'sync') this.flush();
        break;
      }
      case 'reset': {
        app.applySnapshot(msg.records as never);
        void this.commit(msg.seq);
        this.flush();
        break;
      }
      case 'ack': {
        const ids = new Set(msg.ids);
        this.inflight = this.inflight.filter((o) => !ids.has(o.id));
        this.syncPendingCount();
        this.persistPending();
        void this.commit(msg.seq);
        app.setSync({
          status: 'online',
          lastAt: Date.now(),
          pending: this.queue.length + this.inflight.length,
        });
        break;
      }
      case 'presence': {
        app.setPeers(msg.peers);
        break;
      }
      case 'unauthorized': {
        this.close();
        void app.expireSession();
        break;
      }
      default:
        break;
    }
  }

  /** 先把记录写进 IndexedDB，成功后再推进游标，避免刷新窗口期丢数据 */
  private async commit(seq: number) {
    try {
      await persistNow();
    } catch {
      /* 落盘失败也要继续，否则会卡住同步 */
    }
    this.advance(seq);
  }

  private advance(seq: number) {
    if (!Number.isFinite(seq) || seq <= this.since) return;
    this.since = seq;
    if (this.bucket !== 'guest') localStorage.setItem(seqKey(this.bucket), String(seq));
  }
}

export const sync = new SyncClient();
