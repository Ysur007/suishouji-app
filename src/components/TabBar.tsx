import { motion } from 'framer-motion';
import { IconRecord, IconSpace } from './Icons';
import { useApp } from '../lib/store';

export function TabBar() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const active = tab === 'record' ? 'record' : 'space';

  const tabs = [
    { key: 'record' as const, label: '记录', icon: <IconRecord /> },
    { key: 'space' as const, label: 'Space', icon: <IconSpace /> },
  ];

  return (
    <nav className="tabbar" aria-label="主导航">
      <div className="tabbar__inner">
        {tabs.map((t) => (
          <button
            key={t.key}
            className="tabbar__item"
            data-active={active === t.key}
            onClick={() => setTab(t.key)}
          >
            {active === t.key && (
              <motion.span
                layoutId="tab-pill"
                className="tabbar__pill"
                transition={{ type: 'spring', stiffness: 460, damping: 40 }}
              />
            )}
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
