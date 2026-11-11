import type { Memo } from '../lib/types';
import { useApp } from '../lib/store';
import { useUI } from '../lib/ui';
import type { MenuAction } from './ContextMenu';
import { IconCopy, IconEdit, IconFolder, IconPin, IconTrash } from './Icons';

export function memoActions(memo: Memo): MenuAction[] {
  const open = useUI.getState().open;

  return [
    {
      key: 'copy',
      label: '复制',
      icon: <IconCopy />,
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(memo.text);
          useApp.getState().notify('已复制到剪贴板');
        } catch {
          useApp.getState().notify('复制失败，请手动选择', 'error');
        }
      },
    },
    {
      key: 'edit',
      label: '编辑',
      icon: <IconEdit />,
      onClick: () => open({ kind: 'editor', memoId: memo.id }),
    },
    {
      key: 'pin',
      label: memo.pinned ? '取消置顶' : '置顶',
      icon: <IconPin />,
      onClick: () => {
        useApp.getState().togglePin(memo.id);
        useApp.getState().notify(memo.pinned ? '已取消置顶' : '已置顶');
      },
    },
    {
      key: 'folder',
      label: '归档',
      icon: <IconFolder />,
      onClick: () => open({ kind: 'editor', memoId: memo.id }),
    },
    {
      key: 'delete',
      label: '删除',
      icon: <IconTrash />,
      danger: true,
      onClick: () => {
        useApp.getState().deleteMemo(memo.id);
        useApp.getState().notify('已删除');
      },
    },
  ];
}
