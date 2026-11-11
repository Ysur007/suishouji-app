import { useRef } from 'react';
import type { Folder } from '../lib/types';
import { FolderIcon } from './FolderIcon';

interface Props {
  folder: Pick<Folder, 'name' | 'glyph' | 'tone'>;
  count?: number;
  onClick?: () => void;
  onMenu?: (x: number, y: number) => void;
}

export function FolderTile({ folder, count, onClick, onMenu }: Props) {
  const ref = useRef<HTMLButtonElement>(null);

  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${px * 13}deg`);
    el.style.setProperty('--rx', `${-py * 11}deg`);
  };

  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--rx', '0deg');
  };

  return (
    <button
      ref={ref}
      className="folder-tile"
      onPointerMove={move}
      onPointerLeave={leave}
      onClick={onClick}
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <FolderIcon tone={folder.tone} glyph={folder.glyph} />
      <div>
        <div className="folder-tile__name">{folder.name}</div>
        {typeof count === 'number' && <div className="folder-tile__count">{count} Memo</div>}
      </div>
    </button>
  );
}

export function NewFolderTile({ onClick }: { onClick: () => void }) {
  return (
    <button className="folder-tile folder-tile--new" onClick={onClick}>
      <FolderIcon tone="stone" glyph="spark" />
      <div>
        <div className="folder-tile__name">新建文件夹</div>
        <div className="folder-tile__count">整理一下</div>
      </div>
    </button>
  );
}
