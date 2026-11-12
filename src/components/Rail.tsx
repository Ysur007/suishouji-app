/**
 * 一级导航：只有三个去处 + 账号。
 *
 * 之前的侧栏把「工作区 / 共享 / 文件夹」三组东西平铺在一列里，层级是扁的；
 * 现在拆成两级——这里只回答「去哪」，具体有哪些群、哪些视图，交给右边的面板。
 */

import { BrandGlyph, IconChat, IconGear, IconLayers, IconRecord } from './Icons';
import { navigate, useRoute } from '../lib/router';
import { useApp } from '../lib/store';
import { useUI } from '../lib/ui';

const ITEMS = [
  { path: '/', label: '记录', icon: <IconRecord />, hint: '流水、时间线、空间' },
  { path: '/organize', label: '整理', icon: <IconLayers />, hint: '按主题归类、提炼' },
  { path: '/chat', label: '对话', icon: <IconChat />, hint: '就你的记录提问' },
];

export function Rail() {
  const route = useRoute();
  const user = useApp((s) => s.user);
  const lastUser = useApp((s) => s.lastUser);
  const openSheet = useUI((s) => s.open);

  const me = user ?? lastUser;

  return (
    <nav className="rail" aria-label="主导航">
      <button className="rail__brand" aria-label="随手记" onClick={() => navigate('/')}>
        <BrandGlyph width={17} height={17} />
      </button>

      <div className="rail__group">
        {ITEMS.map((item) => {
          const active = item.path === '/' ? route === '/' : route.startsWith(item.path);
          return (
            <button
              key={item.path}
              className="rail__item"
              data-active={active}
              data-tip={item.label}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(item.path)}
            >
              {item.icon}
            </button>
          );
        })}
      </div>

      <div className="rail__foot">
        <button
          className="rail__item rail__item--quiet"
          data-tip="设置"
          aria-label="设置"
          onClick={() => openSheet({ kind: 'settings' })}
        >
          <IconGear width={19} height={19} />
        </button>
        <button
          className="rail__avatar"
          data-tip={me ? `@${me.username}` : '登录'}
          aria-label={me ? '账号' : '登录'}
          onClick={() => navigate(user ? '/account' : '/login')}
        >
          {me ? me.username.slice(0, 1).toUpperCase() : '?'}
        </button>
      </div>
    </nav>
  );
}
