import { useMemo, useState } from 'react';
import { liveFolders, liveMemos, useApp } from '../lib/store';
import type { Folder } from '../lib/types';
import { useUI } from '../lib/ui';
import { MenuHost, type MenuAction } from './ContextMenu';
import { FolderTile, NewFolderTile } from './FolderTile';
import { IconBack, IconEdit, IconFolder, IconPlus, IconTrash } from './Icons';
import { SyncBadge } from './Sidebar';
import { Topbar } from './Topbar';

export function FoldersView() {
  const folders = useApp((s) => s.folders);
  const memos = useApp((s) => s.memos);
  const setTab = useApp((s) => s.setTab);
  const setFolderFilter = useApp((s) => s.setFolderFilter);
  const openSheet = useUI((s) => s.open);
  const open = useUI((s) => s.open);

  const [menu, setMenu] = useState<{ x: number; y: number; folderId: string } | null>(null);

  const list = useMemo(() => liveFolders(folders), [folders]);
  const viewBucket = useApp((s) => s.viewBucket);
  const memoList = useMemo(
    () => liveMemos(memos).filter((m) => (m.spaceId ?? viewBucket) === viewBucket),
    [memos, viewBucket],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of memoList) {
      if (!m.folderId) continue;
      map[m.folderId] = (map[m.folderId] ?? 0) + 1;
    }
    return map;
  }, [memoList]);

  const openFolder = (folder: Folder) => {
    setFolderFilter(folder.id);
    setTab('space');
  };

  const actions: MenuAction[] = menu
    ? [
        {
          key: 'open',
          label: '打开',
          icon: <IconFolder />,
          onClick: () => {
            const f = folders[menu.folderId];
            if (f) openFolder(f);
          },
        },
        {
          key: 'rename',
          label: '重命名',
          icon: <IconEdit />,
          onClick: () => open({ kind: 'rename-folder', folderId: menu.folderId }),
        },
        {
          key: 'delete',
          label: '删除',
          icon: <IconTrash />,
          danger: true,
          onClick: () => {
            const f = folders[menu.folderId];
            useApp.getState().deleteFolder(menu.folderId);
            useApp.getState().notify(f ? `已删除「${f.name}」` : '已删除');
          },
        },
      ]
    : [];

  return (
    <>
      <Topbar
        title="文件夹"
        sub={
          <button
            className="back-link"
            onClick={() => {
              setTab('space');
              setFolderFilter(null);
            }}
          >
            <IconBack width={13} height={13} />
            返回空间
          </button>
        }
        actions={
          <>
            <span className="topbar__sub" style={{ marginTop: 0 }}>
              <SyncBadge />
            </span>
            <button className="text-btn" onClick={() => openSheet({ kind: 'new-folder' })}>
              <IconPlus />
              新建文件夹
            </button>
          </>
        }
      />

      <div className="scroll">
        <div className="column">
          <div className="folder-grid">
            {list.map((folder) => (
              <FolderTile
                key={folder.id}
                folder={folder}
                count={counts[folder.id] ?? 0}
                onClick={() => openFolder(folder)}
                onMenu={(x, y) => setMenu({ x, y, folderId: folder.id })}
              />
            ))}
            <NewFolderTile onClick={() => openSheet({ kind: 'new-folder' })} />
          </div>
        </div>
      </div>

      <MenuHost menu={menu} closeMenu={() => setMenu(null)} actions={actions} />
    </>
  );
}
