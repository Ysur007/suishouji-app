import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface TopbarProps {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}

export function Topbar({ title, sub, actions }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div style={{ minWidth: 0 }}>
          <motion.h1
            className="topbar__title"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            {title}
          </motion.h1>
          {sub ? <div className="topbar__sub">{sub}</div> : null}
        </div>
        {actions ? <div className="topbar__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
