import { motion } from 'framer-motion';
import { IconChat, IconLayers, IconRecord } from './Icons';
import { navigate, useRoute } from '../lib/router';

/**
 * 移动端一级导航：和桌面左侧的 Rail 一一对应，只是换成横向。
 * 二级集合（视图、群、文件夹）走顶栏标题弹出的「导航」抽屉。
 */
export function TabBar() {
  const route = useRoute();

  const tabs = [
    { path: '/', label: '记录', icon: <IconRecord /> },
    { path: '/organize', label: '整理', icon: <IconLayers /> },
    { path: '/chat', label: '对话', icon: <IconChat /> },
  ];

  const active =
    route === '/' ? '/' : route.startsWith('/organize') ? '/organize' : route.startsWith('/chat') ? '/chat' : '/';

  return (
    <nav className="tabbar" aria-label="主导航">
      <div className="tabbar__inner">
        {tabs.map((t) => (
          <button
            key={t.path}
            className="tabbar__item"
            data-active={active === t.path}
            onClick={() => navigate(t.path)}
          >
            {active === t.path && (
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
