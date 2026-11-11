import { create } from 'zustand';

export type Sheet =
  | { kind: 'editor'; memoId: string }
  | { kind: 'new-folder' }
  | { kind: 'rename-folder'; folderId: string }
  | { kind: 'settings' }
  | { kind: 'lightbox'; src: string }
  | null;

interface UIState {
  sheet: Sheet;
  open: (sheet: NonNullable<Sheet>) => void;
  close: () => void;
}

export const useUI = create<UIState>((set) => ({
  sheet: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
}));
