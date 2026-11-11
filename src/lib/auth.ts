/** 账号相关的本地状态与 HTTP 调用。token 存在 localStorage，只用于本机。 */

export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthState {
  token: string;
  user: AuthUser;
}

const KEY = 'ssj:auth';

export function readAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthState;
    if (!parsed?.token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAuth(auth: AuthState) {
  localStorage.setItem(KEY, JSON.stringify(auth));
}

export function clearAuth() {
  localStorage.removeItem(KEY);
}

async function post(path: string, body: unknown, token?: string): Promise<AuthState> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<AuthState> & { error?: string };
  if (!res.ok) throw new Error(data.error || '请求失败，请稍后再试');
  if (!data.token || !data.user) throw new Error('服务端返回异常');
  return { token: data.token, user: data.user };
}

export function apiRegister(username: string, password: string) {
  return post('/api/auth/register', { username, password });
}

export function apiLogin(username: string, password: string) {
  return post('/api/auth/login', { username, password });
}

export async function apiLogout(token: string) {
  try {
    await post('/api/auth/logout', {}, token);
  } catch {
    /* 网络失败也要允许本地退出 */
  }
}
