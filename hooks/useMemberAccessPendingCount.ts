"use client";

import { useCallback, useEffect, useState } from "react";
import { apiListMemberAccessRequests } from "@/lib/authClient";

/** Pending member access requests for team lead inbox badge. */
export function useMemberAccessPendingCount(enabled: boolean) {
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setPendingCount(0);
      return;
    }
    try {
      const res = await apiListMemberAccessRequests({ status: "pending" });
      setPendingCount(res.pendingCount ?? 0);
    } catch {
      setPendingCount(0);
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
