"use client";

import { useAuditSignaling } from "@/context/audit-signaling-context";
import { LiveFeedWall } from "@/components/audit/LiveFeedWall";
import { useUIStore } from "@/store/uiStore";
import { useEffect } from "react";

export default function LiveFeedPage() {
  const { clients } = useAuditSignaling();

  useEffect(() => {
    useUIStore.getState().setHeader(
      "Live Feed",
      "Assign members per camera · Full screen for distraction-free monitoring",
    );
    return () => {
      useUIStore.getState().setHeader("", "");
    };
  }, []);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <LiveFeedWall clients={clients} />
    </div>
  );
}
