import { readAuth } from './auth';
import { apiUrl } from './endpoint';
import type { Group, Memo } from './types';

async function call<T>(path: string, body?: unknown): Promise<T> {
  const auth = readAuth();
  if (!auth) throw new Error('请先登录');
  const res = await fetch(apiUrl(path), {
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

export interface DeviceRow {
  id: string;
  name: string;
  platform: string;
  createdAt: number;
  lastSeenAt: number;
}

export function fetchDevices() {
  return call<{ devices: DeviceRow[]; current: string | null }>('/api/devices');
}

export function revokeDevice(id: string) {
  return call<{ ok: boolean }>('/api/devices/revoke', { id });
}

export function fetchGroups() {
  return call<{ groups: Group[] }>('/api/groups');
}

/** 单条记录：本机没有时从服务端补取（整理报告可能引用到尚未同步全的记录） */
export function fetchMemo(id: string) {
  return call<{ memo: Memo }>(`/api/memo?id=${encodeURIComponent(id)}`);
}

/** 全量记录（不含 op 日志），用来把本机缺失的记录一次补齐 */
export function fetchAllRecords() {
  return call<{ seq: number; records: Memo[] }>('/api/records');
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
