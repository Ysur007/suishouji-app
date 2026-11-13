import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { navigate } from './router';
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
 * 规则：
 *   浮层（图片预览 / 抽屉 / 菜单）→ 关掉那一层
 *   记录页多选态 → 先退出多选，不退出页面
 *   二级路由（/login）→ 回应用
 *   一级页面（记录 / 整理 / 对话 / 我的、任何空间）→ 直接退到后台
 * 一级页面之间是平级的，不应该「先回记录页再退桌面」。
 */
export function initBackButton() {
  if (!Capacitor.isNativePlatform()) return;

  void CapApp.addListener('backButton', () => {
    try {
      // 1. 图片预览是叠在最上面的一层，先关它并回到原来的页面
      if (useUI.getState().lightbox) {
        useUI.getState().closeLightbox();
        return;
      }

      // 2. 再关抽屉 / 右键菜单 / 文件夹选择器
      if (hasOverlay()) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        if (useUI.getState().sheet) useUI.getState().close();
        return;
      }

      // 3. 多选态：返回键先退出多选。用底部那条「已选 N 条」判定，
      //    不把选择状态提升到全局 store，退出由 RecordView 自己处理。
      if (document.querySelector('.selBar')) {
        window.dispatchEvent(new Event('ssj:exit-select'));
        return;
      }

      // 4. /login 是独立页，回到应用首页
      //    （/account 现在是一级页面，和记录 / 整理 / 对话平级，不再单独回退）
      if (location.pathname === '/login') {
        navigate('/');
        return;
      }

      // 5. 已经在一级页面（记录 / 时间线 / 空间 / 文件夹 / 任意群）：直接退到后台
      void CapApp.minimizeApp();
    } catch (err) {
      console.error('[backButton]', err);
    }
  });
}
