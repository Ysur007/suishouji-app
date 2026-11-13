import { navigate } from './router';
import { useApp } from './store';

/**
 * 回记录页。
 *
 * tab 是独立于 URL 的状态：记录页顶部那个「文件夹」按钮只调 setTab，不写 history，
 * 所以进了文件夹、再从文件夹点进空间之后，pathname 仍然是 `/`。
 * 这时 navigate('/') 会被 router 当成原地跳转直接 return（见 router.ts），
 * 底部 TabBar / 桌面 Rail 点了没反应 —— 也就是「进了文件夹回不到记录页」。
 *
 * 先把 tab 拨回 record，再让路由落位，两种情况都覆盖。
 */
export function goRecord() {
  useApp.getState().setTab('record');
  navigate('/');
}
