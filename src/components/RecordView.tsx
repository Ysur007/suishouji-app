import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { dayKey, dayLabel, greeting } from '../lib/format';
import { folderName, isMyMemo, memosInSpace, useApp } from '../lib/store';
import type { Memo } from '../lib/types';
import { useUI } from '../lib/ui';
import { Composer } from './Composer';
import { MenuHost, useMenu } from './ContextMenu';
import { IconFolder, IconUsers } from './Icons';
import { MemoBubble } from './MemoBubble';
import { memoActions } from './memoActions';
import { SyncBadge } from './SyncBadge';
import { Topbar } from './Topbar';

type Item =
  | { type: 'day'; key: string; label: string }
  | { type: 'memo'; memo: Memo; index: number };

export function RecordView() {
  const memos = useApp((s) => s.memos);
  const folders = useApp((s) => s.folders);
  const remoteHits = useApp((s) => s.remoteHits);
  const clientId = useApp((s) => s.clientId);
  const user = useApp((s) => s.user);
  const activeSpace = useApp((s) => s.activeSpace);
  const viewBucket = useApp((s) => s.viewBucket);
  const groups = useApp((s) => s.groups);
  const setTab = useApp((s) => s.setTab);
  const openSheet = useUI((s) => s.open);
  const openLightbox = useUI((s) => s.openLightbox);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const { menu, openMenu, closeMenu } = useMenu();

  const group = activeSpace.startsWith('g:') ? groups[activeSpace.slice(2)] : null;
  const list = useMemo(
    () => memosInSpace(memos, activeSpace, viewBucket),
    [memos, activeSpace, viewBucket],
  );

  const items = useMemo(() => {
    const out: Item[] = [];
    let lastDay = '';
    let i = 0;
    for (const memo of list) {
      const key = dayKey(memo.createdAt);
      if (key !== lastDay) {
        out.push({ type: 'day', key, label: dayLabel(memo.createdAt) });
        lastDay = key;
      }
      out.push({ type: 'memo', memo, index: i });
      i += 1;
    }
    return out;
  }, [list]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 180;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [list.length]);

  const activeMemo = menu ? memos[menu.memoId] : null;
  const actions = activeMemo && !activeMemo.deleted ? memoActions(activeMemo) : [];

  return (
    <>
      <Topbar
        title={group ? group.name : '随手记'}
        onTitleClick={() => openSheet({ kind: 'spaces' })}
        sub={
          <>
            <span>{group ? `${group.members.length} 人共享` : greeting()}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{list.length} 条记录</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <SyncBadge />
          </>
        }
        actions={
          <>
            {group ? (
              <button
                className="icon-btn"
                aria-label="群信息"
                onClick={() => openSheet({ kind: 'group', groupId: group.id })}
              >
                <IconUsers />
              </button>
            ) : (
              <button className="icon-btn" aria-label="文件夹" onClick={() => setTab('folders')}>
                <IconFolder />
              </button>
            )}
          </>
        }
      />

      <div className="scroll" ref={scrollRef}>
        <div className="column">
          {list.length === 0 ? (
            <EmptyStream />
          ) : (
            <div className="stream">
              {items.map((item) =>
                item.type === 'day' ? (
                  <div className="day" key={`d-${item.key}`}>
                    <span className="day__text">{item.label}</span>
                  </div>
                ) : (
                  <MemoBubble
                    key={item.memo.id}
                    memo={item.memo}
                    index={item.index}
                    side={isMyMemo(item.memo, user?.id, clientId) ? 'me' : 'them'}
                    authorLabel={group && item.memo.ownerId !== user?.id ? item.memo.ownerName : null}
                    fresh={Boolean(remoteHits[item.memo.id])}
                    folderLabel={folderName(folders, item.memo.folderId)}
                    onOpen={(m) => openSheet({ kind: 'editor', memoId: m.id })}
                    onMenu={(x, y, m) => openMenu(x, y, m.id)}
                    onImage={(src) => openLightbox(src)}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </div>

      <Composer />
      <MenuHost menu={menu} closeMenu={closeMenu} actions={actions} />
    </>
  );
}

function EmptyStream() {
  return (
    <div className="empty">
      <div className="empty__art">
        <div className="empty__bubble empty__bubble--a" />
        <div className="empty__bubble empty__bubble--b" />
        <div className="empty__bubble empty__bubble--c" />
      </div>
      <div className="empty__title">像发消息一样，记下此刻</div>
      <div className="empty__desc">
        想到什么就打一句，Enter 发送。它会在你的所有设备上同时出现。
      </div>
    </div>
  );
}
