import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dayKey, dayLabel, greeting } from '../lib/format';
import { folderName, isMyMemo, memosInSpace, useApp } from '../lib/store';
import type { Memo } from '../lib/types';
import { useUI } from '../lib/ui';
import { Composer } from './Composer';
import { MenuHost, useMenu } from './ContextMenu';
import { IconArrowDown, IconFolder, IconUsers } from './Icons';
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
  const deleteMemo = useApp((s) => s.deleteMemo);
  const notify = useApp((s) => s.notify);
  const openSheet = useUI((s) => s.open);
  const shareTick = useUI((s) => s.shareTick);
  const openLightbox = useUI((s) => s.openLightbox);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const { menu, openMenu, closeMenu } = useMenu();

  // 「回到最新」按钮：离开底部才出现；多选：点气泡勾选而不是打开编辑器
  const [atBottom, setAtBottom] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 180;
      stick.current = near;
      setAtBottom(near);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [list.length]);

  // 分享成功 → 退出多选（否则底部一直挂着「已选 N 条」）
  useEffect(() => {
    if (!shareTick) return;
    setSelectMode(false);
    setPicked(new Set());
    setConfirmDelete(false);
  }, [shareTick]);

  // 切空间 / 切视图时退出多选：选中的东西已经不在眼前了
  useEffect(() => {
    setSelectMode(false);
    setPicked(new Set());
    setConfirmDelete(false);
  }, [activeSpace, viewBucket]);

  const activeMemo = menu ? memos[menu.memoId] : null;
  const actions =
    activeMemo && !activeMemo.deleted
      ? memoActions(activeMemo, { onMultiSelect: () => enterSelect(activeMemo.id) })
      : [];

  const pickedIds = useMemo(() => [...picked], [picked]);

  function enterSelect(id: string) {
    setSelectMode(true);
    setPicked(new Set([id]));
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmDelete(false);
  }

  function exitSelect() {
    setSelectMode(false);
    setPicked(new Set());
    setConfirmDelete(false);
  }

  const jumpLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const removePicked = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    const ids = pickedIds.filter((id) => memos[id] && !memos[id].deleted);
    ids.forEach((id) => deleteMemo(id));
    notify(ids.length ? `已删除 ${ids.length} 条` : '没有可删除的记录', ids.length ? 'default' : 'error');
    exitSelect();
  };

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
            <div className="stream" data-selecting={selectMode ? 'true' : undefined}>
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
                    selectable={selectMode}
                    picked={picked.has(item.memo.id)}
                    onPick={() => togglePick(item.memo.id)}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {selectMode ? (
        <div className="composer-wrap">
          <div className="composer-wrap__inner">
            <div className="selBar">
              <span className="selBar__count">
                已选 <b>{picked.size}</b> 条
              </span>
              <div className="selBar__actions">
                <button
                  className="btn btn--ghost"
                  disabled={picked.size === 0}
                  onClick={() => openSheet({ kind: 'share', memoIds: pickedIds })}
                >
                  分享
                </button>
                <button
                  className={confirmDelete ? 'btn btn--danger btn--solid' : 'btn btn--ghost'}
                  disabled={picked.size === 0}
                  onClick={removePicked}
                >
                  {confirmDelete ? `确认删除 ${picked.size} 条` : '删除'}
                </button>
                <button className="btn btn--ghost" onClick={exitSelect}>
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Composer
          overlay={
            list.length && !atBottom ? (
              <button className="jumpLatest" onClick={jumpLatest} title="跳到最新">
                <IconArrowDown width={14} height={14} />
                最新
              </button>
            ) : null
          }
        />
      )}

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
