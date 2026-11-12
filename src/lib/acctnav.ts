/**
 * 「我的」页的分区导航状态。
 *
 * 桌面端这页和记录 / 整理 / 对话一样有二级面板：左面板列目录，右边是内容。
 *
 * 这里只做「点击跳转 + 记住点了哪一项」，不做滚动联动：
 * 内容是两个并排的列，同一屏里往往同时露出五六个分区，
 * 「当前在哪一段」没有唯一答案，硬算只会让高亮来回跳。
 */

import { create } from 'zustand';

export interface AcctSection {
  id: string;
  label: string;
}

/** 顺序 = 窄屏自上而下的阅读顺序，宽屏下也是这个先后（左右两列同时滚动） */
export const ACCT_SECTIONS: AcctSection[] = [
  { id: 'acct-stats', label: '概览' },
  { id: 'acct-groups', label: '共享空间' },
  { id: 'acct-data', label: '数据与备份' },
  { id: 'acct-device', label: '本机与服务' },
  { id: 'acct-recent', label: '最近记录' },
  { id: 'acct-ai', label: 'AI 引擎' },
  { id: 'acct-about', label: '关于' },
];

interface AcctNav {
  active: string;
  /** 点击面板时的请求：nonce 保证同一段连点两次也会重新滚 */
  request: { id: string; nonce: number } | null;
  setActive: (id: string) => void;
  goTo: (id: string) => void;
}

export const useAcctNav = create<AcctNav>((set) => ({
  active: ACCT_SECTIONS[0].id,
  request: null,
  setActive: (id) => set({ active: id }),
  goTo: (id) =>
    set((s) => ({ active: id, request: { id, nonce: (s.request?.nonce ?? 0) + 1 } })),
}));
