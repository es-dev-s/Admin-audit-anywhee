"use client";

import { useCallback, useEffect, useState } from "react";
import { apiListMemberAccessRequests } from "@/lib/authClient";

/** Pending member access requests for team lead inbox badge. */
export function useMemberAccessPendingCount(enabled: boolean) {
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setPendingCount((prev) => (prev === 0 ? prev : 0));
      return;
    }
    try {
      const res = await apiListMemberAccessRequests({ status: "pending" });
      const next = res.pendingCount ?? 0;
      setPendingCount((prev) => (prev === next ? prev : next));
    } catch {
      setPendingCount((prev) => (prev === 0 ? prev : 0));
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void refresh(), 45_000);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  return { pendingCount, refresh };
}
