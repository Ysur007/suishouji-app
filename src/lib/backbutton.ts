import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { navigate } from './router';
import { useApp } from './store';
import { useUI } from './ui';

/** 当前是否有浮层（抽屉、右键菜单、文件夹选择器）盖在页面上 */
function hasOverlay(): boolean {
  return Boolean(
    document.querySelector('.sheet') ||
      document.querySelector('.scrim') ||
      document.querySelector('.folder-pop') ||
      document.querySelector('.pop-scrim'),
  );
}

/**
 * Android 返回键。
 *
 * Capacitor 壳默认把返回键交给 Activity：WebView 能回退就回退，否则直接 finish（退回桌面）。
 * 而我们是个单页应用，tab / 空间切换都不写入 history，所以「首页按返回」= 直接退出。
 *
 * 这里接管返回键，按「最小可撤销的一层」逐级回退：
 *   浮层 → 独立路由页 → 群空间 → 非记录视图 → 首页（退到后台，不杀进程）
 */
export function initBackButton() {
  if (!Capacitor.isNativePlatform()) return;

  void CapApp.addListener('backButton', () => {
    try {
      // 1. 先关最上面那层浮层
      if (hasOverlay()) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        if (useUI.getState().sheet) useUI.getState().close();
        return;
      }

      // 2. /login、/account 这类独立页面回到应用
      if (location.pathname !== '/') {
        navigate('/');
        return;
      }

      const app = useApp.getState();

      // 3. 停在某个群时，先退回个人空间
      if (app.activeSpace !== app.viewBucket) {
        app.setActiveSpace(app.viewBucket);
        return;
      }

      // 4. 时间线 / 空间 / 文件夹 回到记录
      if (app.tab !== 'record') {
        app.setTab('record');
        return;
      }

      // 5. 已经在首页：退到后台，数据与连接都保留
      void CapApp.minimizeApp();
    } catch (err) {
      console.error('[backButton]', err);
    }
  });
}
