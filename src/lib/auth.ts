/** 账号相关的本地状态与 HTTP 调用。token 存在 localStorage，只用于本机。 */
import { apiUrl } from './endpoint';

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
  const res = await fetch(apiUrl(path), {
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

/** 改密码：成功后服务端会把它它设备上的 token 作废，只留当前这台 */
export async function apiChangePassword(token: string, oldPassword: string, newPassword: string) {
  const res = await fetch(apiUrl('/api/auth/password'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; dropped?: number; error?: string };
  if (!res.ok) throw new Error(data.error || '修改失败，请稍后再试');
  return { dropped: data.dropped ?? 0 };
}

export async function apiLogout(token: string) {
  try {
    await post('/api/auth/logout', {}, token);
  } catch {
    /* 网络失败也要允许本地退出 */
  }
}
