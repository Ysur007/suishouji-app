import { onOp } from './bus';
import { debounce, idbGet, idbSet } from './idb';
import { LS, persistNow, useApp } from './store';
import type { Op, Peer } from './types';

type ServerMessage =
  | { type: 'ready'; seq: number; minSeq: number; peers: Peer[]; serverTime: number }
  | { type: 'ops'; seq: number; ops: Op[] }
  | { type: 'sync'; seq: number; ops: Op[] }
  | { type: 'reset'; seq: number; records: Array<Record<string, unknown>> }
  | { type: 'ack'; seq: number; ids: string[] }
  | { type: 'presence'; peers: Peer[] }
  | { type: 'pong' };

const MAX_BACKOFF = 8000;

class SyncClient {
  private ws: WebSocket | null = null;
  private queue: Op[] = [];
  private inflight: Op[] = [];
  private since = Number(localStorage.getItem(LS.seq) ?? 0) || 0;
  private retry = 0;
  private reconnectTimer: number | null = null;
  private flushTimer: number | null = null;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    onOp((op) => this.enqueue(op));
    void this.restorePending().then(() => this.connect());
    window.addEventListener('online', () => this.hardReconnect());
    window.addEventListener('offline', () => {
      useApp.getState().setSync({ status: 'offline', peers: [] });
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.hardReconnect();
    });
  }

  private async restorePending() {
    const saved = await idbGet<Op[]>('pending');
    if (Array.isArray(saved) && saved.length) {
      this.queue = [...saved, ...this.queue];
      this.syncPendingCount();
    }
  }

  private persistPending = debounce(() => {
    void idbSet('pending', [...this.inflight, ...this.queue]);
  }, 200);

  private syncPendingCount() {
    useApp.getState().setSync({ pending: this.queue.length + this.inflight.length });
  }

  enqueue(op: Op) {
    this.queue.push(op);
    this.syncPendingCount();
    this.persistPending();
    if (this.flushTimer) return;
    // 60ms 合并窗口：连续操作（例如删文件夹时连带改一批记录）合并成一次发送
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 60);
  }

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
      // 未确认的写入放回队列，下次连上重发（服务端按 op.id 幂等）
      if (this.inflight.length) {
        this.queue.unshift(...this.inflight);
        this.inflight = [];
      }
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

  private hardReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.connect();
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
        app.setSync({ status: 'online', lastAt: Date.now(), pending: this.queue.length + this.inflight.length });
        break;
      }
      case 'presence': {
        app.setPeers(msg.peers);
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
    localStorage.setItem(LS.seq, String(seq));
  }
}

export const sync = new SyncClient();
