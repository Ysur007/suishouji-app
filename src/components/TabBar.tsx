import { motion } from 'framer-motion';
import { IconChat, IconLayers, IconRecord, IconUser } from './Icons';
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
    // 手机上左侧图标栏是隐藏的，没有这一项就找不到登录 / 账号 / 缓存的入口
    { path: '/account', label: '我的', icon: <IconUser /> },
  ];

  // 只有一级页面对应 Tab 高亮；/login 这类页面保留「我的」的高亮
  const active = tabs.find((t) =>
    t.path === '/' ? route === '/' : route.startsWith(t.path) || (t.path === '/account' && route.startsWith('/login')),
  )?.path;

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
