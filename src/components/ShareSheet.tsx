/**
 * 分享到群：单独一步选目标。
 *
 * 之前右键菜单里直接列出每个群（最多 4 个），群一多就是「满屏都是共享到…」，
 * 而且和复制 / 编辑这些动作混在一起，看不出它们是同一件事的不同选项。
 * 现在菜单里只有一条「分享到…」，点开这个面板再选——一次也能分享多条。
 */

import { useMemo } from 'react';
import { liveMemos, useApp } from '../lib/store';
import { useUI } from '../lib/ui';
import { IconPlus, IconUsers } from './Icons';

export function ShareBody({
  memoIds,
  onClose,
}: {
  memoIds: string[];
  onClose: () => void;
}) {
  const groups = useApp((s) => s.groups);
  const memos = useApp((s) => s.memos);
  const auth = useApp((s) => s.auth);
  const shareMany = useApp((s) => s.shareManyToGroup);
  const openSheet = useUI((s) => s.open);
  const markShared = useUI((s) => s.markShared);

  const list = useMemo(
    () => Object.values(groups).sort((a, b) => a.createdAt - b.createdAt),
    [groups],
  );

  /** 这个群里还有几条没分享过去（已分享的会跳过，重复点不会产生副本） */
  const pendingOf = (groupId: string) => {
    const shared = new Set(
      liveMemos(memos)
        .filter((m) => m.sharedFrom && m.spaceId === `g:${groupId}`)
        .map((m) => m.sharedFrom as string),
    );
    return memoIds.filter((id) => memos[id] && !shared.has(id)).length;
  };

  const total = memoIds.length;

  return (
    <>
      <div className="sheet__title">分享到群</div>
      <div className="sheet__desc">
        {total > 1
          ? `把选中的 ${total} 条各复制一份到群里，原记录仍留在你这边。`
          : '把这条记录复制一份到群里，原记录仍留在你这边。'}
      </div>

      <div className="sheet__body">
        {!auth ? (
          <div className="devices__empty">登录后才能分享到群。先在「我的」里登录。</div>
        ) : list.length === 0 ? (
          <div className="devices__empty">还没有群，先建一个再分享。</div>
        ) : (
          <div className="devices">
            {list.map((g) => {
              const pending = pendingOf(g.id);
              const allDone = pending === 0;
              return (
                <button
                  key={g.id}
                  className="devices__row shareRow"
                  disabled={allDone}
                  onClick={() => {
                    const n = shareMany(memoIds, g.id);
                    if (n > 0) markShared();
                    onClose();
                  }}
                >
                  <span className="shareRow__icon" aria-hidden>
                    <IconUsers width={15} height={15} />
                  </span>
                  <span className="shareRow__main">
                    <span className="shareRow__name">{g.name}</span>
                    <span className="shareRow__sub">
                      {g.members.length} 人
                      {allDone ? ' · 已经分享过了' : total > 1 ? ` · 将分享 ${pending} 条` : ''}
                    </span>
                  </span>
                  <span className="shareRow__go">{allDone ? '已分享' : '分享'}</span>
                </button>
              );
            })}
          </div>
        )}

        {auth ? (
          <button
            className="text-link shareNew"
            onClick={() => {
              onClose();
              openSheet({ kind: 'new-group' });
            }}
          >
            <IconPlus width={13} height={13} />
            新建一个群
          </button>
        ) : null}
      </div>

      <div className="sheet__actions sheet__actions--end">
        <button className="btn btn--ghost" onClick={onClose}>
          取消
        </button>
      </div>
    </>
  );
}
