import { motion } from 'framer-motion';
import type { Memo } from '../lib/types';
import { formatTime } from '../lib/format';
import { BrandGlyph, IconFolder, IconMore } from './Icons';
import { useLongPress } from './ContextMenu';

interface Props {
  memo: Memo;
  index: number;
  side: 'them' | 'me';
  fresh?: boolean;
  folderLabel?: string | null;
  /** 群聊里显示对方用户名 */
  authorLabel?: string | null;
  onOpen: (memo: Memo) => void;
  onMenu: (x: number, y: number, memo: Memo) => void;
  onImage: (src: string) => void;
}

export function MemoBubble({
  memo,
  index,
  side,
  fresh,
  folderLabel,
  authorLabel,
  onOpen,
  onMenu,
  onImage,
}: Props) {
  const press = useLongPress((point) => onMenu(point.x, point.y, memo));

  return (
    <motion.div
      className={`row row--${side}`}
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 430,
        damping: 33,
        mass: 0.75,
        delay: Math.min(index, 14) * 0.022,
      }}
    >
      {side === 'them' && (
        <div className="avatar" aria-hidden>
          <BrandGlyph width={13} height={13} />
        </div>
      )}

      <div className="row__main">
        {side === 'them' && authorLabel ? <div className="row__author">{authorLabel}</div> : null}
      <div
        className={`bubble${fresh ? ' bubble--just' : ''}`}
        {...press}
        onClick={() => {
          if (press.longPressed.current) {
            press.longPressed.current = false;
            return;
          }
          if (window.getSelection()?.toString()) return;
          onOpen(memo);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(memo);
          }
        }}
      >
        {memo.text ? <div className="bubble__text">{memo.text}</div> : null}

        {memo.images.length > 0 && (
          <div className="bubble__images" data-count={Math.min(memo.images.length, 2)}>
            {memo.images.map((src, i) => (
              <img
                key={i}
                className="bubble__img"
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

        {folderLabel ? (
          <span className="bubble__tag">
            <IconFolder />
            {folderLabel}
          </span>
        ) : null}

        <button
          className="bubble__more"
          aria-label="更多操作"
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onMenu(rect.left, rect.top, memo);
          }}
        >
          <IconMore />
        </button>
        </div>
      </div>

      <span className="row__time">{formatTime(memo.createdAt)}</span>

      {side === 'me' && (
        <div className="avatar" aria-hidden>
          <BrandGlyph width={13} height={13} />
        </div>
      )}
    </motion.div>
  );
}
