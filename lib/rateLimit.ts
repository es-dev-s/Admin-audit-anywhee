// lib/rateLimit.ts
// Simple in-memory rate limiter for auth endpoints.
// Keyed by IP address, sliding window of 15 minutes, max 10 requests.
//
// This is intentionally simple — for production at scale, replace with
// Redis-based rate limiting or rate-limiter-flexible.
//
// Note: In serverless/edge deployments, in-memory state is per-instance
// and resets on cold starts. This is a trade-off accepted for simplicity.

type RateLimitEntry = {
  timestamps: number[];
};

const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 10;

// Periodic cleanup to prevent memory leaks (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Check if a request from the given IP is rate limited.
 * Returns { limited: false } if allowed, or { limited: true, retryAfterMs }
 * if the limit has been exceeded.
 */
export function checkRateLimit(ip: string): {
  limited: boolean;
  retryAfterMs?: number;
} {
  const now = Date.now();
  let entry = store.get(ip);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(ip, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

  if (entry.timestamps.length >= MAX_REQUESTS) {
    // Calculate when the oldest request in the window will expire
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = WINDOW_MS - (now - oldestInWindow);
    return { limited: true, retryAfterMs };
  }

  // Allow the request and record the timestamp
  entry.timestamps.push(now);
  return { limited: false };
}
