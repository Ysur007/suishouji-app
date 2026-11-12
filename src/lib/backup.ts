/**
 * 备份相关的两个动作：
 *   - 导出本机（离线也能用，整份 JSON）
 *   - 导出服务端（需要登录，账号下所有记录与群）
 *
 * 放这里而不是页面里，是因为「我的」页有两条入口：桌面走左侧面板的操作区，
 * 窄屏没有面板，走内容区的行。同一个动作不该写两遍。
 */

import { readAuth } from './auth';
import { apiUrl } from './endpoint';
import { downloadJson } from './format';
import type { Folder, Memo } from './types';

type Notify = (text: string, tone?: 'default' | 'error') => void;

export function exportLocalBackup(
  memos: Record<string, Memo>,
  folders: Record<string, Folder>,
  notify: Notify,
) {
  const records = [...Object.values(memos), ...Object.values(folders)].map((r) => ({
    ...r,
    entity: 'text' in r ? 'memo' : 'folder',
  }));
  downloadJson(`suishouji-${new Date().toISOString().slice(0, 10)}.json`, {
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
  });
  notify('本机备份已导出');
}

export async function exportServerBackup(notify: Notify) {
  const token = readAuth()?.token;
  if (!token) {
    notify('登录后才能导出服务端数据', 'error');
    return;
  }
  try {
    const res = await fetch(apiUrl('/api/export'), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('导出失败');
    const data = await res.json();
    downloadJson(`suishouji-server-${new Date().toISOString().slice(0, 10)}.json`, data);
    notify('已导出服务端完整数据');
  } catch (err) {
    notify((err as Error).message, 'error');
  }
}
