import { create } from 'zustand';

type UIStore = {
  pageTitle: string;
  pageSubtitle: string;
  liveFeedWallFullscreen: boolean;
  setHeader: (title: string, subtitle?: string) => void;
  setLiveFeedWallFullscreen: (active: boolean) => void;
};

export const useUIStore = create<UIStore>((set) => ({
  pageTitle: '',
  pageSubtitle: '',
  liveFeedWallFullscreen: false,
  setHeader: (title, subtitle = '') => set({ pageTitle: title, pageSubtitle: subtitle }),
  setLiveFeedWallFullscreen: (active) => set({ liveFeedWallFullscreen: active }),
}));
