/**
 * 一级导航：四个去处（记录 / 整理 / 对话 / 我的）。
 *
 * 之前的侧栏把「工作区 / 共享 / 文件夹」三组东西平铺在一列里，层级是扁的；
 * 现在拆成两级——这里只回答「去哪」，具体有哪些群、哪些视图，交给右边的面板。
 *
 * 「我的」原本只是底栏那个头像按钮，藏在设置旁边；手机上已经有了同名 Tab，
 * 桌面这里也提到主队列里，两端的导航顺序才一致。
 */

import { BrandGlyph, IconChat, IconLayers, IconRecord, IconUser } from './Icons';
import { navigate, useRoute } from '../lib/router';
import { goRecord } from '../lib/nav';
import { useApp } from '../lib/store';

const ITEMS = [
  { path: '/', label: '记录', icon: <IconRecord /> },
  { path: '/organize', label: '整理', icon: <IconLayers /> },
  { path: '/chat', label: '对话', icon: <IconChat /> },
  { path: '/account', label: '我的', icon: <IconUser /> },
];

export function Rail() {
  const route = useRoute();
  const user = useApp((s) => s.user);
  const lastUser = useApp((s) => s.lastUser);

  const me = user ?? lastUser;

  return (
    <nav className="rail" aria-label="主导航">
      <button className="rail__brand" aria-label="随手记" onClick={() => goRecord()}>
        <BrandGlyph width={17} height={17} />
      </button>

      <div className="rail__group">
        {ITEMS.map((item) => {
          const active = item.path === '/' ? route === '/' : route.startsWith(item.path);
          // 「我的」的 tooltip 顺带显示当前账号，头像按钮撤掉后这处就成了身份标识
          const tip =
            item.path === '/account' ? (me ? `我的 · @${me.username}` : '我的 · 未登录') : item.label;
          return (
            <button
              key={item.path}
              className="rail__item"
              data-active={active}
              data-tip={tip}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => (item.path === '/' ? goRecord() : navigate(item.path))}
            >
              {item.icon}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
