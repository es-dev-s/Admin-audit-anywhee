"use client";

import { useRef } from "react";
import { useAuditSignaling } from "@/context/audit-signaling-context";
import type { AuditLiveClient } from "@/lib/auditTypes";

function fingerprint(clients: AuditLiveClient[]): string {
  return clients
    .map((c) => {
      const src = (c.screenSources ?? []).map((s) => s.id).join(",");
      return `${c.id}:${c.status}:${c.orgId}:${src}`;
    })
    .join("|");
}

/**
 * Returns a stable clients array reference when roster data relevant to the
 * live wall (id, status, org, displays) has not changed — avoids slot re-renders
 * on unrelated signaling ticks.
 */
export function useStableLiveFeedClients(): AuditLiveClient[] {
  const { clients } = useAuditSignaling();
  const cacheRef = useRef<{ fp: string; list: AuditLiveClient[] }>({
    fp: "",
    list: clients,
  });

  const fp = fingerprint(clients);
  if (fp !== cacheRef.current.fp) {
    cacheRef.current = { fp, list: clients };
  }
  return cacheRef.current.list;
}
