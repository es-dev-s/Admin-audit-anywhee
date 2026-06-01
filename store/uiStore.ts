import { create } from 'zustand';

type UIStore = {
  pageTitle: string;
  pageSubtitle: string;
  setHeader: (title: string, subtitle?: string) => void;
};

export const useUIStore = create<UIStore>((set) => ({
  pageTitle: '',
  pageSubtitle: '',
  setHeader: (title, subtitle = '') => set({ pageTitle: title, pageSubtitle: subtitle }),
}));
