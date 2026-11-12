/**
 * 导出备份：先选范围，再选来源。
 *
 * 整包 JSON 适合「迁移」，但真实需求常常更窄：把这个群导给同事、导出最近一个月。
 * 所以把「导出」从一步下载改成两步选择——默认仍是「全部 · 本机」，不想选的人两下就走。
 *
 * 范围只影响记录，文件夹始终整份带上：目录树被裁断的话，导进去是一堆散落的记录。
 */

import { useMemo, useState } from 'react';
import {
  exportLocalBackup,
  exportServerBackup,
  type ExportScope,
} from '../lib/backup';
import { useApp } from '../lib/store';
import { IconCheck } from './Icons';

type ScopeKey = 'all' | 'recent' | string;

export function ExportBody({ onClose }: { onClose: () => void }) {
  const memos = useApp((s) => s.memos);
  const folders = useApp((s) => s.folders);
  const groups = useApp((s) => s.groups);
  const auth = useApp((s) => s.auth);
  const user = useApp((s) => s.user);
  const notify = useApp((s) => s.notify);

  const [scopeKey, setScopeKey] = useState<ScopeKey>('all');
  const [source, setSource] = useState<'local' | 'server'>('local');
  const [busy, setBusy] = useState(false);

  const spaces = useMemo(() => {
    // store 里的 groups 已经是未删除的，直接按创建时间排
    return Object.values(groups)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((g) => {
        const space = `g:${g.id}`;
        return {
          key: space,
          label: g.name,
          count: Object.values(memos).filter((m) => !m.deleted && m.spaceId === space).length,
        };
      });
  }, [groups, memos]);

  const scope: ExportScope =
    scopeKey === 'recent'
      ? { days: 30 }
      : scopeKey === 'all'
        ? {}
        : { spaceId: scopeKey };

  const total = useMemo(
    () => Object.values(memos).filter((m) => !m.deleted).length,
    [memos],
  );

  const preview = useMemo(() => {
    const since = scope.days ? Date.now() - scope.days * 86400_000 : 0;
    return Object.values(memos).filter((m) => {
      if (m.deleted) return false;
      if (scope.spaceId && m.spaceId !== scope.spaceId) return false;
      if (since && m.createdAt < since) return false;
      return true;
    }).length;
  }, [memos, scope.spaceId, scope.days]);

  const run = async () => {
    setBusy(true);
    try {
      if (source === 'server') await exportServerBackup(notify, scope);
      else exportLocalBackup(memos, folders, notify, scope);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const option = (
    key: ScopeKey,
    label: string,
    sub: string,
    disabled = false,
  ) => (
    <button
      key={key}
      className="optRow"
      data-active={scopeKey === key}
      disabled={disabled}
      onClick={() => setScopeKey(key)}
    >
      <span className="optRow__main">
        <span className="optRow__label">{label}</span>
        <span className="optRow__sub">{sub}</span>
      </span>
      <span className="optRow__mark">{scopeKey === key ? <IconCheck width={14} height={14} /> : null}</span>
    </button>
  );

  return (
    <>
      <div className="sheet__title">导出备份</div>
      <div className="sheet__desc">
        导出成一个 JSON 文件。选范围只影响记录，文件夹总是整份带上。
      </div>

      <div className="sheet__body">
        <div className="optGroup">
          <div className="optGroup__label">范围</div>
          {option('all', '全部记录', `本机共 ${total} 条`)}
          {option('recent', '最近 30 天', '适合交接、月度归档')}
          {spaces.map((g) =>
            option(g.key, g.label, `${g.count} 条 · 只含这个群的记录`),
          )}
        </div>

        <div className="optGroup">
          <div className="optGroup__label">来源</div>
          {[
            { key: 'local' as const, label: '本机缓存', sub: '不用联网，导出这台设备上的数据' },
            {
              key: 'server' as const,
              label: '服务端',
              sub: auth ? `账号 ${user?.username ?? ''} 下的完整数据` : '登录后可用',
            },
          ].map((item) => (
            <button
              key={item.key}
              className="optRow"
              data-active={source === item.key}
              disabled={item.key === 'server' && !auth}
              onClick={() => setSource(item.key)}
            >
              <span className="optRow__main">
                <span className="optRow__label">{item.label}</span>
                <span className="optRow__sub">{item.sub}</span>
              </span>
              <span className="optRow__mark">
                {source === item.key ? <IconCheck width={14} height={14} /> : null}
              </span>
            </button>
          ))}
        </div>

        <div className="optNote">
          {scopeKey === 'all' ? '全部记录' : scopeKey === 'recent' ? '最近 30 天' : '所选群'}
          {' · '}
          {source === 'server' ? '服务端' : '本机'}
          {source === 'local' ? ` · 预计 ${preview} 条记录` : ''}
        </div>
      </div>

      <div className="sheet__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          取消
        </button>
        <button className="btn btn--primary" disabled={busy} onClick={() => void run()}>
          {busy ? '导出中…' : '导出'}
        </button>
      </div>
    </>
  );
}
