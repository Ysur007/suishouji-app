import { create } from 'zustand';

export type Sheet =
  | { kind: 'editor'; memoId: string }
  | { kind: 'new-folder' }
  | { kind: 'rename-folder'; folderId: string }
  | { kind: 'new-group' }
  | { kind: 'spaces' }
  | { kind: 'ai' }
  | { kind: 'chats' }
  | { kind: 'password' }
  | { kind: 'device' }
  | { kind: 'devices' }
  | { kind: 'export' }
  | { kind: 'share'; memoIds: string[] }
  | { kind: 'group'; groupId: string }
  | null;

interface UIState {
  sheet: Sheet;
  /**
   * 分享成功的时间戳。
   * 分享浮层由全局挂载，拿不到记录页的「多选」状态；这里发一个信号，
   * 记录页收到就退出多选——否则选完分享完，底部还挂着一条「已选 3 条」。
   */
  shareTick: number;
  /** 图片预览是叠在页面之上的一层，不占 sheet 槽位，关掉后能回到原来的抽屉 */
  lightbox: string | null;
  open: (sheet: NonNullable<Sheet>) => void;
  close: () => void;
  markShared: () => void;
  openLightbox: (src: string) => void;
  closeLightbox: () => void;
}

export const useUI = create<UIState>((set) => ({
  sheet: null,
  shareTick: 0,
  lightbox: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
  markShared: () => set({ shareTick: Date.now() }),
  openLightbox: (src) => set({ lightbox: src }),
  closeLightbox: () => set({ lightbox: null }),
}));
