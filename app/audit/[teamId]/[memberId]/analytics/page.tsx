"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { AnimatedPage } from "@/components/ui/AnimatedPage";
import { ExtensionAnalyticsPanel } from "@/components/audit/ExtensionAnalyticsPanel";
import { useAuditSignaling } from "@/context/audit-signaling-context";
import { useBrowserTabSnapshotMerge } from "@/hooks/useBrowserTabSnapshotMerge";
import { useSignalingStreamAuth } from "@/hooks/useSignalingStreamAuth";
import { memberOrgPlainText } from "@/lib/memberOrgDisplay";
import { useUIStore } from "@/store/uiStore";

export default function MemberExtensionAnalyticsPage() {
  const params = useParams<{ teamId: string; memberId: string }>();
  const orgId = Number(params.teamId);
  const clientId = Number(params.memberId);

  const streamAuth = useSignalingStreamAuth(orgId, clientId);
  const {
    getClient,
    getBrowserTabAnalytics,
    connectionStatus,
    clients,
    signalingSessionToken,
  } = useAuditSignaling();

  const client = Number.isFinite(clientId) && clientId > 0 ? getClient(clientId) : undefined;
  const wsSnapshot =
    Number.isFinite(clientId) && clientId > 0 ? getBrowserTabAnalytics(clientId) : undefined;
  const snapshot = useBrowserTabSnapshotMerge(orgId, clientId, wsSnapshot, {
    enabled:
      Number.isFinite(orgId) &&
      orgId > 0 &&
      Number.isFinite(clientId) &&
      clientId > 0 &&
      streamAuth.status === "authorized",
    signalingSessionToken,
    live: connectionStatus === "Live",
  });

  const memberName = client?.fullName ?? `Client ${clientId}`;
  const orgName = client?.orgName ?? null;
  const claimedOrgName = client?.claimedOrgName ?? null;
  const headerSubtitle = memberOrgPlainText(memberName, orgName, orgId, claimedOrgName);
  const live = connectionStatus === "Live";

  const headerKey = `${orgId}::${clientId}::${headerSubtitle}`;
  useEffect(() => {
    if (!Number.isFinite(orgId) || orgId <= 0 || !Number.isFinite(clientId) || clientId <= 0) return;
    useUIStore.getState().setHeader("Browser analytics", headerSubtitle);
    return () => useUIStore.getState().setHeader("", "");
  }, [headerKey, orgId, clientId, headerSubtitle]);

  const backHref = useMemo(() => {
    if (Number.isFinite(orgId) && orgId > 0) return `/audit/${orgId}`;
    return "/audit";
  }, [orgId]);

  const teamClients = useMemo(
    () =>
      Number.isFinite(orgId) && orgId > 0 ? clients.filter((c) => c.orgId === orgId) : [],
    [clients, orgId],
  );

  if (!Number.isFinite(clientId) || clientId <= 0) {
    return (
      <AnimatedPage>
        <p className="text-[12px] text-[var(--color-text-muted)]">Invalid member.</p>
      </AnimatedPage>
    );
  }

  if (streamAuth.status === "loading") {
    return (
      <AnimatedPage>
        <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]" />
          <p className="text-[12px] text-[var(--color-text-muted)]">Checking access…</p>
        </div>
      </AnimatedPage>
    );
  }

  if (streamAuth.status === "denied") {
    return (
      <AnimatedPage>
        <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-2 text-center">
          <p className="text-[13px] font-medium text-[var(--color-text-secondary)]">Access denied</p>
          <p className="max-w-md text-[12px] text-[var(--color-text-muted)]">{streamAuth.message}</p>
          <Link
            href={backHref}
            className="mt-4 inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
          >
            <ChevronLeft size={14} /> Back
          </Link>
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
      <div className="mb-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        >
          <ChevronLeft size={14} /> Back to team
        </Link>
      </div>
      <ExtensionAnalyticsPanel
        orgId={orgId}
        clientId={clientId}
        teamClients={teamClients}
        signalingSessionToken={signalingSessionToken}
        memberName={memberName}
        orgName={orgName}
        claimedOrgName={claimedOrgName}
        snapshot={snapshot}
        signalingConnected={live}
        activityLogHref={`/audit/${orgId}/${clientId}/analytics/activity`}
      />
    </AnimatedPage>
  );
}
