export type LiveFeedLayoutPreset = {
  id: string;
  label: string;
  cols: number;
  rows: number;
  slots: number;
};

export const LIVE_FEED_LAYOUTS: LiveFeedLayoutPreset[] = [
  { id: "1", label: "1 screen", cols: 1, rows: 1, slots: 1 },
  { id: "2", label: "1×2 L+R", cols: 2, rows: 1, slots: 2 },
  { id: "4", label: "2×2", cols: 2, rows: 2, slots: 4 },
  { id: "6", label: "3×2", cols: 3, rows: 2, slots: 6 },
  { id: "9", label: "3×3", cols: 3, rows: 3, slots: 9 },
  { id: "12", label: "4×3", cols: 4, rows: 3, slots: 12 },
  { id: "16", label: "4×4", cols: 4, rows: 4, slots: 16 },
  { id: "20", label: "5×4", cols: 5, rows: 4, slots: 20 },
];

export function getLiveFeedLayout(id: string): LiveFeedLayoutPreset {
  return LIVE_FEED_LAYOUTS.find((l) => l.id === id) ?? LIVE_FEED_LAYOUTS[3];
}

export function resizeSlotAssignments(
  prev: (number | null)[],
  nextSlotCount: number,
): (number | null)[] {
  const next = prev.slice(0, nextSlotCount);
  while (next.length < nextSlotCount) next.push(null);
  return next;
}

/** Side-by-side dual monitor wall (one display per column). */
export function isSideBySideLiveFeedLayout(layout: LiveFeedLayoutPreset): boolean {
  return layout.id === "2" && layout.cols === 2 && layout.rows === 1;
}
