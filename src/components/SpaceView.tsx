import { useMemo, useState } from 'react';
import { formatDateTime } from '../lib/format';
import { folderName, liveFolders, liveMemos, useApp } from '../lib/store';
import type { Memo } from '../lib/types';
import { useUI } from '../lib/ui';
import { MenuHost, useMenu } from './ContextMenu';
import { IconFolder, IconGear, IconMore, IconPin, IconSearch } from './Icons';
import { memoActions } from './memoActions';
import { SyncBadge } from './Sidebar';
import { Topbar } from './Topbar';

export function SpaceView() {
  const memos = useApp((s) => s.memos);
  const folders = useApp((s) => s.folders);
  const folderFilter = useApp((s) => s.folderFilter);
  const setFolderFilter = useApp((s) => s.setFolderFilter);
  const setTab = useApp((s) => s.setTab);
  const openSheet = useUI((s) => s.open);

  const [query, setQuery] = useState('');
  const { menu, openMenu, closeMenu } = useMenu();

  const allMemos = useMemo(() => liveMemos(memos), [memos]);
  const folderList = useMemo(() => liveFolders(folders), [folders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allMemos
      .filter((m) => (folderFilter ? m.folderId === folderFilter : true))
      .filter((m) => (q ? m.text.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.createdAt - a.createdAt;
      });
  }, [allMemos, folderFilter, query]);

  const activeMemo = menu ? memos[menu.memoId] : null;
  const actions = activeMemo && !activeMemo.deleted ? memoActions(activeMemo) : [];

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of allMemos) {
      const key = m.folderId ?? '__none__';
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [allMemos]);

  return (
    <>
      <Topbar
        title="空间"
        sub={
          <>
            <span>{filtered.length} 条</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{folderList.length} 个文件夹</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <SyncBadge />
          </>
        }
        actions={
          <>
            <button className="text-btn" onClick={() => setTab('folders')}>
              <IconFolder />
              文件夹
            </button>
            <button
              className="icon-btn"
              aria-label="设置"
              onClick={() => openSheet({ kind: 'settings' })}
            >
              <IconGear />
            </button>
          </>
        }
      />

      <div className="scroll">
        <div className="column">
          <div className="space-tools">
            <label className="search">
              <IconSearch />
              <input
                value={query}
                placeholder="搜索记录…"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              className="chip"
              data-active={!folderFilter}
              onClick={() => setFolderFilter(null)}
            >
              全部
              <span className="chip__n">{allMemos.length}</span>
            </button>
            {folderList.map((f) => (
              <button
                key={f.id}
                className="chip"
                data-active={folderFilter === f.id}
                onClick={() => setFolderFilter(folderFilter === f.id ? null : f.id)}
              >
                <span
                  className="option__dot"
                  style={{ width: 9, height: 9, background: `var(--tone-${f.tone})` }}
                />
                {f.name}
                <span className="chip__n">{counts[f.id] ?? 0}</span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="empty">
              <div className="empty__title">{query ? '没有匹配的记录' : '这里还是空的'}</div>
              <div className="empty__desc">
                {query ? '换个关键词试试，或者去「记录」里翻一翻。' : '去「记录」里说一句，它会自动出现在这里。'}
              </div>
              <button
                className="btn btn--ghost"
                style={{ width: 'auto', padding: '0 18px', marginTop: 4 }}
                onClick={() => {
                  setTab('record');
                  requestAnimationFrame(() => window.dispatchEvent(new Event('ssj:focus-composer')));
                }}
              >
                去记录
              </button>
            </div>
          ) : (
            <div className="cards">
              {filtered.map((memo) => (
                <Card
                  key={memo.id}
                  memo={memo}
                  folderLabel={folderName(folders, memo.folderId)}
                  onOpen={() => openSheet({ kind: 'editor', memoId: memo.id })}
                  onMenu={(x, y) => openMenu(x, y, memo.id)}
                  onImage={(src) => openSheet({ kind: 'lightbox', src })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <MenuHost menu={menu} closeMenu={closeMenu} actions={actions} />
    </>
  );
}

function Card({
  memo,
  folderLabel,
  onOpen,
  onMenu,
  onImage,
}: {
  memo: Memo;
  folderLabel: string | null;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
  onImage: (src: string) => void;
}) {
  return (
    <div
      className="card"
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
    >
      <div className="card__top">
        <span className="card__time">{formatDateTime(memo.createdAt)}</span>
        {memo.pinned && <IconPin className="card__pin" />}
        <button
          className="icon-btn"
          style={{ width: 26, height: 26, marginLeft: 'auto' }}
          aria-label="更多"
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(r.left, r.bottom);
          }}
        >
          <IconMore />
        </button>
      </div>

      {folderLabel && (
        <span className="card__folder">
          <IconFolder />
          <span>{folderLabel}</span>
        </span>
      )}

      <div className="card__text">{memo.text || (memo.images.length ? '（图片）' : '')}</div>

      {memo.images.length > 0 && (
        <div className="card__imgs">
          {memo.images.slice(0, 3).map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              loading="lazy"
              onClick={(e) => {
                e.stopPropagation();
                onImage(src);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
