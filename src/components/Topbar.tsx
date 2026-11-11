import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { IconChevron } from './Icons';

interface TopbarProps {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  /** 传了就说明标题可以点（用于切换空间） */
  onTitleClick?: () => void;
}

export function Topbar({ title, sub, actions, onTitleClick }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div style={{ minWidth: 0 }}>
          <motion.h1
            className={`topbar__title${onTitleClick ? ' topbar__title--btn' : ''}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            onClick={onTitleClick}
            role={onTitleClick ? 'button' : undefined}
            tabIndex={onTitleClick ? 0 : undefined}
            onKeyDown={(e) => {
              if (!onTitleClick) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTitleClick();
              }
            }}
          >
            {title}
            {onTitleClick ? <IconChevron className="topbar__title-chev" width={18} height={18} /> : null}
          </motion.h1>
          {sub ? <div className="topbar__sub">{sub}</div> : null}
        </div>
        {actions ? <div className="topbar__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
