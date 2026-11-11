/**
 * 混合逻辑时钟（HLC）。
 *
 * 目的：多端各自有本地时间，单靠 Date.now() 无法给出稳定的先后顺序，
 * 而 HLC 保证「因果有序 + 字典序可比较」，服务端只做一次字符串比较就能判定谁更新。
 * 格式：`<毫秒时间戳 16 位>-<同毫秒计数器 4 位>-<设备 id>`
 */

let lastTs = 0;
let lastCounter = 0;
let device = 'local';

export function configureClock(clientId: string) {
  device = clientId;
}

export function nextHLC(): string {
  const now = Date.now();
  if (now > lastTs) {
    lastTs = now;
    lastCounter = 0;
  } else {
    // 同一毫秒，或系统时钟回拨：计数器自增，保证单调递增
    lastCounter += 1;
    if (lastCounter > 9999) {
      lastTs += 1;
      lastCounter = 0;
    }
  }
  return `${String(lastTs).padStart(16, '0')}-${String(lastCounter).padStart(4, '0')}-${device}`;
}

/** 观察到远端时钟后推进本地时钟，避免本机新写入反而排到旧位置 */
export function observeHLC(hlc: string) {
  const ts = Number(hlc.slice(0, 16));
  if (!Number.isFinite(ts)) return;
  if (ts > lastTs) {
    lastTs = ts;
    lastCounter = 0;
  }
}
