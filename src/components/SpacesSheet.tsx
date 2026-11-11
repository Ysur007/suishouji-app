import { useMemo } from 'react';
import { liveMemos, useApp } from '../lib/store';
import { useUI } from '../lib/ui';
import { IconCheck, IconPlus, IconUser, IconUsers } from './Icons';

/** 空间切换：移动端没有侧栏，从顶栏标题点进来 */
export function SpacesBody({ onClose }: { onClose: () => void }) {
  const groups = useApp((s) => s.groups);
  const memos = useApp((s) => s.memos);
  const activeSpace = useApp((s) => s.activeSpace);
  const viewBucket = useApp((s) => s.viewBucket);
  const user = useApp((s) => s.user);
  const setActiveSpace = useApp((s) => s.setActiveSpace);
  const open = useUI((s) => s.open);

  const list = useMemo(
    () => Object.values(groups).sort((a, b) => a.createdAt - b.createdAt),
    [groups],
  );

  const countOf = (space: string) =>
    liveMemos(memos).filter((m) => (m.spaceId ?? viewBucket) === space).length;

  const go = (space: string) => {
    setActiveSpace(space);
    onClose();
  };

  return (
    <>
      <div className="sheet__title">切换空间</div>
      <div className="sheet__desc">个人记录只有自己看得到；群里的人互相能看到对方发的内容。</div>

      <div className="sheet__body">
        <div className="space-list">
          <button
            className="space-item"
            data-active={activeSpace === viewBucket}
            onClick={() => go(viewBucket)}
          >
            <span className="space-item__icon">
              <IconUser width={16} height={16} />
            </span>
            <span className="space-item__name">我的记录</span>
            <span className="space-item__count">{countOf(viewBucket)}</span>
            {activeSpace === viewBucket ? <IconCheck width={15} height={15} /> : null}
          </button>

          {list.map((g) => {
            const key = `g:${g.id}`;
            return (
              <button
                key={g.id}
                className="space-item"
                data-active={activeSpace === key}
                onClick={() => go(key)}
              >
                <span className="space-item__icon">
                  <IconUsers width={16} height={16} />
                </span>
                <span className="space-item__name">{g.name}</span>
                <span className="space-item__count">
                  {g.members.length} 人 · {countOf(key)}
                </span>
                {activeSpace === key ? <IconCheck width={15} height={15} /> : null}
              </button>
            );
          })}

          {user ? (
            <button
              className="space-item space-item--add"
              onClick={() => {
                onClose();
                open({ kind: 'new-group' });
              }}
            >
              <span className="space-item__icon">
                <IconPlus width={16} height={16} />
              </span>
              <span className="space-item__name">新建群</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="sheet__actions">
        <button className="btn btn--primary" onClick={onClose}>
          完成
        </button>
      </div>
    </>
  );
}
