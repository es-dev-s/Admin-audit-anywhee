"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type BrowserTabAnalyticsSnapshot,
  pickFresherTabSnapshot,
} from "@/lib/browserTabAnalyticsTypes";
import { isBrowserTabHttpPollEnabled } from "@/lib/browserTabPoll";

const POLL_MS = 2000;

/**
 * Merges live WebSocket snapshot with HTTP (DB) snapshot from `/api/audit/browser-tab-snapshot`
 * so the UI stays fresh when WS pushes are delayed or missed, and uses DB `received_at` for age.
 */
export function useBrowserTabSnapshotMerge(
  orgId: number,
  clientId: number,
  wsSnapshot: BrowserTabAnalyticsSnapshot | undefined,
  options: {
    enabled: boolean;
    signalingSessionToken: string | null;
    live: boolean;
  },
): BrowserTabAnalyticsSnapshot | undefined {
  const { enabled, signalingSessionToken, live } = options;
  const [httpSnapshot, setHttpSnapshot] = useState<
    BrowserTabAnalyticsSnapshot | undefined
  >(undefined);

  useEffect(() => {
    if (!isBrowserTabHttpPollEnabled() || !enabled || !live || !signalingSessionToken) {
      setHttpSnapshot(undefined);
      return;
    }
    if (!Number.isFinite(orgId) || orgId <= 0 || !Number.isFinite(clientId) || clientId <= 0) {
      setHttpSnapshot(undefined);
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const r = await fetch(
          `/api/audit/browser-tab-snapshot?signalOrgId=${orgId}&signalClientId=${clientId}`,
          {
            credentials: "include",
            headers: { "x-signaling-session": signalingSessionToken },
          },
        );
        const j = (await r.json().catch(() => null)) as {
          snapshot?: BrowserTabAnalyticsSnapshot | null;
        } | null;
        if (cancelled || !r.ok || !j?.snapshot) {
          if (!cancelled && (!r.ok || !j?.snapshot)) setHttpSnapshot(undefined);
          return;
        }
        setHttpSnapshot(j.snapshot);
      } catch {
        if (!cancelled) setHttpSnapshot(undefined);
      }
    };

    void run();
    const t = setInterval(() => void run(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [orgId, clientId, enabled, live, signalingSessionToken]);

  return useMemo(
    () => pickFresherTabSnapshot(wsSnapshot, httpSnapshot),
    [wsSnapshot, httpSnapshot],
  );
}

