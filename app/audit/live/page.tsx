"use client";

import { LiveFeedWall } from "@/components/audit/LiveFeedWall";
import { useStableLiveFeedClients } from "@/hooks/useStableLiveFeedClients";
import { useUIStore } from "@/store/uiStore";
import { useEffect } from "react";

export default function LiveFeedPage() {
  const clients = useStableLiveFeedClients();

  useEffect(() => {
    useUIStore.getState().setHeader("", "");
    return () => useUIStore.getState().setHeader("", "");
  }, []);

  return (
    <div className="lf-page flex min-h-0 w-full flex-1 flex-col">
      <LiveFeedWall clients={clients} />
    </div>
  );
}
