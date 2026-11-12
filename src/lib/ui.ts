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
  | { kind: 'group'; groupId: string }
  | null;

interface UIState {
  sheet: Sheet;
  /** 图片预览是叠在页面之上的一层，不占 sheet 槽位，关掉后能回到原来的抽屉 */
  lightbox: string | null;
  open: (sheet: NonNullable<Sheet>) => void;
  close: () => void;
  openLightbox: (src: string) => void;
  closeLightbox: () => void;
}

export const useUI = create<UIState>((set) => ({
  sheet: null,
  lightbox: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
  openLightbox: (src) => set({ lightbox: src }),
  closeLightbox: () => set({ lightbox: null }),
}));
