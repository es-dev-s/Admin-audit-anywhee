"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Activity, BarChart3 } from "lucide-react";
import Link from "next/link";
import { LiveScreenPanel } from "@/components/members/LiveScreenPanel";
import { ActivityLog } from "@/components/members/ActivityLog";
import { useAuditSignaling } from "@/context/audit-signaling-context";
import { useSignalingStreamAuth } from "@/hooks/useSignalingStreamAuth";
import { resolveClientEnrollmentOrg } from "@/lib/memberOrgDisplay";
import { auditStreamViewOpts } from "@/lib/auditStreamViewKey";
import { auditAnalyticsPath } from "@/lib/auditNav";
import { useAuditBackNav } from "@/hooks/useAuditBackNav";

function MemberLiveBody({
  orgId,
  clientId,
  from,
}: {
  orgId: number;
  clientId: number;
  from: string | null;
}) {
  const { backHref } = useAuditBackNav(orgId, from);
  const [displayIdx, setDisplayIdx] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);
  const streamAuth = useSignalingStreamAuth(orgId, clientId);
  const { getClient, getStream, acquireStream, releaseStream, orgs } = useAuditSignaling();

  const client = getClient(clientId);
  const sources = client?.screenSources ?? [];
  const streamOpts = useMemo(
    () =>
      auditStreamViewOpts(displayIdx, sources[displayIdx]?.id ?? null, false),
    [displayIdx, sources],
  );
  const stream = getStream(clientId, streamOpts);

  const orgName = useMemo(() => {
    if (!Number.isFinite(orgId)) return null;
    return orgs.find((o) => o.id === orgId)?.name ?? client?.orgName ?? null;
  }, [orgs, orgId, client?.orgName]);

  useEffect(() => {
    if (streamAuth.status !== "authorized") return;
    acquireStream(clientId, streamOpts);
    return () => releaseStream(clientId, streamOpts);
  }, [clientId, streamAuth.status, streamOpts, acquireStream, releaseStream]);

  const canStream = client?.status === "sharing" || client?.status === "online";
  const memberName = client?.fullName ?? `Client ${clientId}`;
  const title = client ? `${client.fullName}` : `Client ${clientId}`;
  const orgLabel = client
    ? resolveClientEnrollmentOrg({
        claimedOrgName: client.claimedOrgName,
        orgName: client.orgName,
        orgId,
      })
    : orgName ?? (Number.isFinite(orgId) ? `Team ${orgId}` : null);

  const onDisplayChange = (sourceId: string, idx: number) => {
    if (streamAuth.status !== "authorized") return;
    releaseStream(
      clientId,
      auditStreamViewOpts(displayIdx, sources[displayIdx]?.id ?? null, false),
    );
    setDisplayIdx(idx);
    queueMicrotask(() =>
      acquireStream(clientId, auditStreamViewOpts(idx, sourceId, false)),
    );
  };

  if (streamAuth.status === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--color-bg-base)]">
        <div className="h-6 w-6 rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)] animate-spin" />
        <p className="text-[12px] text-[var(--color-text-muted)]">Checking access…</p>
      </div>
    );
  }

  if (streamAuth.status === "denied") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center bg-[var(--color-bg-base)]">
        <p className="text-[13px] font-medium text-[var(--color-text-secondary)]">Access denied</p>
        <p className="text-[12px] text-[var(--color-text-muted)]">{streamAuth.message}</p>
        <Link
          href={backHref}
          className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-4 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
        >
          <ChevronLeft size={13} /> Back
        </Link>
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-black">
      {/* Floating back + analytics */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2">
        <Link
          href={backHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] px-3 text-[11px] font-medium text-white/50 hover:bg-white/[0.12] hover:text-white/80 transition-all backdrop-blur-sm"
        >
          <ChevronLeft size={13} /> Back
        </Link>
        <Link
          href={auditAnalyticsPath(orgId, clientId, from ?? undefined)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] px-3 text-[11px] font-medium text-white/50 hover:bg-white/[0.12] hover:text-white/80 transition-all backdrop-blur-sm"
        >
          <BarChart3 size={13} /> Analytics
        </Link>
      </div>

      {/* Activity drawer toggle */}
      <button
        type="button"
        onClick={() => setActivityOpen((v) => !v)}
        className="absolute top-4 right-4 z-20 grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] border border-white/[0.08] text-white/50 hover:bg-white/[0.12] hover:text-white/80 transition-all backdrop-blur-sm"
        aria-label="Toggle activity log"
      >
        <Activity size={14} />
      </button>

      {/* Main stream */}
      <div className="flex-1 flex min-h-0 min-w-0">
        <div className="flex-1 min-h-0 min-w-0">
          <LiveScreenPanel
            title={title}
            memberName={memberName}
            teamId={Number.isFinite(orgId) ? orgId : 0}
            memberId={clientId}
            orgLabel={client?.orgName ?? orgName}
            claimedOrgName={client?.claimedOrgName}
            isStreaming={!!canStream}
            mediaStream={stream ?? null}
            fillContainer
            className="h-full w-full rounded-none"
            screenSources={client?.screenSources ?? []}
            displayIndex={displayIdx}
            onDisplayChange={onDisplayChange}
          />
        </div>

        {/* Activity panel (slide-in) */}
        <AnimatePresence>
          {activityOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="shrink-0 overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-bg-surface)]"
            >
              <ActivityLog className="h-full w-full border-0 rounded-none bg-transparent" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function MemberScreenPage() {
  const { teamId, memberId } = useParams<{ teamId: string; memberId: string }>();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const orgId = Number(teamId);
  const clientId = Number(memberId);

  if (!Number.isFinite(clientId) || clientId <= 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg-base)]">
        <p className="text-[12px] text-[var(--color-text-muted)]">Invalid member.</p>
      </div>
    );
  }

  return (
    <MemberLiveBody key={`${clientId}-${from ?? ""}`} orgId={orgId} clientId={clientId} from={from} />
  );
}
