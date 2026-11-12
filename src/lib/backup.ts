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

/** 导出范围：某个空间 + 最近 N 天，都可以不传（= 全部） */
export interface ExportScope {
  spaceId?: string;
  days?: number;
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function scopeSuffix(scope?: ExportScope) {
  return [scope?.spaceId ? scope.spaceId.replace(':', '-') : '', scope?.days ? `last${scope.days}d` : '']
    .filter(Boolean)
    .join('-');
}

function scopeLabel(scope?: ExportScope) {
  return [scope?.spaceId ? '部分空间' : '', scope?.days ? `近 ${scope.days} 天` : '']
    .filter(Boolean)
    .join(' · ');
}

export function exportLocalBackup(
  memos: Record<string, Memo>,
  folders: Record<string, Folder>,
  notify: Notify,
  scope?: ExportScope,
) {
  const since = scope?.days ? Date.now() - scope.days * 86400_000 : 0;
  const memoList = Object.values(memos).filter((m) => {
    if (scope?.spaceId && (m.spaceId ?? '') !== scope.spaceId) return false;
    // 时间过滤只作用在记录上：文件夹是结构，裁掉会断树
    if (since && m.createdAt < since) return false;
    return true;
  });
  // 文件夹不分空间（Folder 本身就没有 spaceId），一律整份带上，否则导进去目录树是断的
  const folderList = Object.values(folders);

  const records = [...memoList, ...folderList].map((r) => ({
    ...r,
    entity: 'text' in r ? 'memo' : 'folder',
  }));

  downloadJson(`suishouji${scopeSuffix(scope) ? `-${scopeSuffix(scope)}` : ''}-${stamp()}.json`, {
    version: 1,
    exportedAt: new Date().toISOString(),
    scope: scope ?? null,
    records,
  });
  notify(
    records.length
      ? `已导出 ${records.length} 条${scopeLabel(scope) ? `（${scopeLabel(scope)}）` : ''}`
      : '这个范围里没有可导出的记录',
    records.length ? 'default' : 'error',
  );
}

export async function exportServerBackup(notify: Notify, scope?: ExportScope) {
  const token = readAuth()?.token;
  if (!token) {
    notify('登录后才能导出服务端数据', 'error');
    return;
  }
  const qs = new URLSearchParams();
  if (scope?.spaceId) qs.set('space', scope.spaceId);
  if (scope?.days) qs.set('days', String(scope.days));
  try {
    const res = await fetch(apiUrl(`/api/export${qs.toString() ? `?${qs}` : ''}`), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || '导出失败');
    }
    const data = (await res.json()) as { records?: unknown[] };
    downloadJson(`suishouji-server${scopeSuffix(scope) ? `-${scopeSuffix(scope)}` : ''}-${stamp()}.json`, data);
    notify(`已导出服务端数据（${data.records?.length ?? 0} 条）`);
  } catch (err) {
    notify((err as Error).message, 'error');
  }
}
