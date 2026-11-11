import { readAuth } from './auth';
import type { Group } from './types';

async function call<T>(path: string, body?: unknown): Promise<T> {
  const auth = readAuth();
  if (!auth) throw new Error('请先登录');
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${auth.token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

export function fetchGroups() {
  return call<{ groups: Group[] }>('/api/groups');
}

export function createGroup(name: string) {
  return call<{ group: Group; groups: Group[] }>('/api/groups', { name });
}

export function inviteMembers(groupId: string, usernames: string[]) {
  return call<{ group: Group; groups: Group[] }>('/api/groups/invite', { groupId, usernames });
}

export function renameGroup(groupId: string, name: string) {
  return call<{ group: Group; groups: Group[] }>('/api/groups/rename', { groupId, name });
}

export function removeMember(groupId: string, userId: string) {
  return call<{ group: Group; groups: Group[] }>('/api/groups/remove', { groupId, userId });
}

export function leaveGroup(groupId: string) {
  return call<{ groups: Group[] }>('/api/groups/leave', { groupId });
}
