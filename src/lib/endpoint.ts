/**
 * 服务端地址解析。
 *
 * - 浏览器 / Electron：同源，空字符串，一切走相对路径；
 * - Android / iOS 壳：页面来自 `https://localhost`，接口要指向真实服务器，
 *   地址由构建时的 VITE_API_BASE 写进 meta，也可以在运行时改（设置里填自己部署的地址）。
 */

const KEY = 'ssj:endpoint';

function normalize(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!/^https?:\/\//i.test(raw)) return '';
  return raw.replace(/\/+$/, '');
}

export function apiBase(): string {
  try {
    const saved = normalize(localStorage.getItem(KEY));
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  const meta = document.querySelector<HTMLMetaElement>('meta[name="ssj-api"]');
  return normalize(meta?.content);
}

export function setApiBase(value: string) {
  const next = normalize(value);
  if (next) localStorage.setItem(KEY, next);
  else localStorage.removeItem(KEY);
  location.reload();
}

export function apiUrl(path: string): string {
  const base = apiBase();
  return base ? `${base}${path}` : path;
}

export function wsUrl(): string {
  const base = apiBase();
  if (base) return `${base.replace(/^http/i, 'ws')}/ws`;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/** 壳里跑的时候给个默认值，方便账号页显示 */
export function defaultApiBase(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="ssj-api"]');
  return normalize(meta?.content);
}
