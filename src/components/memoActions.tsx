import type { Memo } from '../lib/types';
import { useApp } from '../lib/store';
import { useUI } from '../lib/ui';
import type { MenuAction } from './ContextMenu';
import { IconCopy, IconEdit, IconFolder, IconPin, IconSelect, IconShare, IconTrash } from './Icons';

/**
 * 一条记录的右键动作。
 *
 * 「分享」只有一条入口：点开后再选目标群。之前是每个群占一行（最多四个），
 * 群一多菜单就被「共享到…」灌满，看起来像重复项，其实是同一件事的不同选项。
 */
export function memoActions(memo: Memo, handlers?: { onMultiSelect?: () => void }): MenuAction[] {
  const open = useUI.getState().open;
  const state = useApp.getState();
  const groups = Object.values(state.groups);
  const inPersonal = (memo.spaceId ?? state.viewBucket) === state.viewBucket;
  const canShare = inPersonal && groups.length > 0;

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
      key: 'select',
      label: '多选',
      icon: <IconSelect />,
      onClick: () => handlers?.onMultiSelect?.(),
    },
    ...(canShare
      ? [
          {
            key: 'share',
            label: '分享到…',
            icon: <IconShare />,
            onClick: () => open({ kind: 'share', memoIds: [memo.id] }),
          } satisfies MenuAction,
        ]
      : []),
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
