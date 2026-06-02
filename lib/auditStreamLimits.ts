/** Browser-side limits for concurrent audit live streams (one tab / one WS session). */

const parsePositive = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
};

/** Max simultaneous member streams this audit tab will keep open. */
export const MAX_CONCURRENT_ACTIVE_STREAMS = parsePositive(
  process.env.NEXT_PUBLIC_MAX_CONCURRENT_STREAMS,
  24,
);

/** Max parallel `connect-to-client` negotiations (stagger the rest). */
export const MAX_PARALLEL_STREAM_CONNECTS = parsePositive(
  process.env.NEXT_PUBLIC_MAX_PARALLEL_STREAM_CONNECTS,
  4,
);

/** Delay between starting each connect in a batch (ms). */
export const STREAM_CONNECT_STAGGER_MS = parsePositive(
  process.env.NEXT_PUBLIC_STREAM_CONNECT_STAGGER_MS,
  400,
);

export function countActiveStreamInterests(interest: Map<string, number>): number {
  let n = 0;
  for (const v of interest.values()) {
    if (v > 0) n += 1;
  }
  return n;
}
