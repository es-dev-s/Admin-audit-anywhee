import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type RecentStream = {
  id: number;
  name: string;
  timestamp: number;
};

type RecentStore = {
  recentStreams: RecentStream[];
  addRecentStream: (id: number, name: string) => void;
  clearRecentStreams: () => void;
};

export const useRecentStore = create<RecentStore>()(
  persist(
    (set) => ({
      recentStreams: [],
      addRecentStream: (id, name) =>
        set((state) => {
          // Remove if it already exists to avoid duplicates
          const filtered = state.recentStreams.filter((s) => s.id !== id);
          // Prepend the new stream
          const updated = [{ id, name, timestamp: Date.now() }, ...filtered].slice(0, 8); // Keep max 8
          return { recentStreams: updated };
        }),
      clearRecentStreams: () => set({ recentStreams: [] }),
    }),
    {
      name: 'recent-streams-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
