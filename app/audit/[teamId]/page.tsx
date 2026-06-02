"use client";

import {
  Info,
  WifiOff,
  X,
  MonitorPlay,
  Radio,
  User,
  UserPlus,
  BarChart3,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedPage } from "@/components/ui/AnimatedPage";
import { useAuditSignaling } from "@/context/audit-signaling-context";
import { isBrowserTabHttpPollEnabled } from "@/lib/browserTabPoll";
import { apiRequestTeamLeadOrgAccess } from "@/lib/authClient";
import { useAuth } from "@/context/auth-context";
import { LiveScreenPanel } from "@/components/members/LiveScreenPanel";
import { useSignalingStreamAuth } from "@/hooks/useSignalingStreamAuth";
import { ShareAccessModal } from "@/components/audit/ShareAccessModal";
import { useUIStore } from "@/store/uiStore";
import { MemberOrgLabel } from "@/components/audit/MemberOrgLabel";
import { memberOrgPlainText } from "@/lib/memberOrgDisplay";
import type { AuditLiveClient } from "@/lib/auditTypes";
import {
  type BrowserTabAnalyticsSnapshot,
  formatActiveDuration,
  formatSnapshotAgeRelative,
  pickFresherTabSnapshot,
  tabTitleAndHost,
  tabTotalDwellMs,
  topRecentBrowserTabs,
} from "@/lib/browserTabAnalyticsTypes";

type DirectoryMember = { id: string; name: string; email: string };

function matchDirectoryMember(
  client: AuditLiveClient,
  directory: DirectoryMember[]
): DirectoryMember | undefined {
  if (client.email) {
    const e = client.email.toLowerCase();
    const byEmail = directory.find((d) => d.email.toLowerCase() === e);
    if (byEmail) return byEmail;
  }
  const n = client.fullName.trim();
  return directory.find((d) => d.name.trim() === n);
}

/* ── Cinema-mode stream overlay ── */
function StreamSidePanel({
  orgId,
  clientId,
  onClose,
}: {
  orgId: number;
  clientId: number;
  onClose: () => void;
}) {
  const streamAuth = useSignalingStreamAuth(orgId, clientId);
  const { getClient, streams, acquireStream, releaseStream, orgs } =
    useAuditSignaling();
  const [displayIdx, setDisplayIdx] = useState(0);

  const client = getClient(clientId);
  const stream = streams.get(clientId);

  const orgName = useMemo(() => {
    if (!Number.isFinite(orgId)) return null;
    return orgs.find((o) => o.id === orgId)?.name ?? client?.orgName ?? null;
  }, [orgs, orgId, client?.orgName]);

  useEffect(() => {
    if (streamAuth.status !== "authorized") return;
    acquireStream(clientId);
    return () => releaseStream(clientId);
  }, [clientId, streamAuth.status, acquireStream, releaseStream]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  /* Loading state */
  if (streamAuth.status === "loading") {
    return (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[var(--z-cinema)] bg-[var(--color-scrim-strong)] backdrop-blur-md"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
          className="fixed inset-4 sm:inset-8 z-[calc(var(--z-cinema)+1)] flex items-center justify-center rounded-[var(--radius-2xl)] bg-[var(--color-bg-stream)] border border-[var(--color-border)]"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)] animate-spin" />
            <p className="text-[12px] text-white/40">Checking access…</p>
          </div>
        </motion.div>
      </>
    );
  }

  /* Denied state */
  if (streamAuth.status === "denied") {
    return (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[var(--z-cinema)] bg-[var(--color-scrim-strong)] backdrop-blur-md"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-4 sm:inset-8 z-[calc(var(--z-cinema)+1)] flex flex-col items-center justify-center gap-2 rounded-[var(--radius-2xl)] bg-[var(--color-bg-stream)] border border-[var(--color-border)] text-center p-8"
        >
          <p className="text-[13px] font-medium text-white/80">Access denied</p>
          <p className="text-[12px] text-white/40">{streamAuth.message}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 h-8 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
          >
            Close
          </button>
        </motion.div>
      </>
    );
  }

  if (!client) return null;

  const canStream = client.status === "sharing" || client.status === "online";
  const title = client.fullName;

  const onDisplayChange = (sourceId: string, idx: number) => {
    setDisplayIdx(idx);
    releaseStream(clientId);
    queueMicrotask(() => acquireStream(clientId, { preferredSourceId: sourceId }));
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[var(--z-cinema)] bg-[var(--color-scrim-strong)] backdrop-blur-md"
      />

      {/* Cinema panel — full viewport with padding */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
        className="fixed inset-3 sm:inset-6 lg:inset-8 z-[calc(var(--z-cinema)+1)] flex flex-col rounded-[var(--radius-2xl)] overflow-hidden bg-[var(--color-bg-stream)] border border-white/[0.08] shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] border border-white/[0.08] text-white/60 hover:bg-white/[0.12] hover:text-white transition-all backdrop-blur-sm"
        >
          <X size={16} />
        </button>

        {/* Stream */}
        <div className="flex-1 flex flex-col min-h-0">
          <LiveScreenPanel
            title={title}
            memberName={client.fullName}
            teamId={orgId}
            memberId={clientId}
            orgLabel={client.orgName ?? orgName}
            claimedOrgName={client.claimedOrgName}
            isStreaming={!!canStream}
            mediaStream={stream ?? null}
            fillContainer
            className="h-full w-full rounded-none"
            screenSources={client.screenSources ?? []}
            displayIndex={displayIdx}
            onDisplayChange={onDisplayChange}
          />
        </div>
      </motion.div>
    </>
  );
}

/* ── Main page ── */
export default function TeamMembersPage() {
  const params = useParams<{ teamId: string }>();
  const router = useRouter();
  const orgId = Number(params.teamId);
  const {
    orgs,
    clients,
    teamLeadOrgAccess,
    getBrowserTabAnalytics,
    connectionStatus,
    signalingSessionToken,
  } = useAuditSignaling();
  const { state: authState } = useAuth();

  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [shareTeamOpen, setShareTeamOpen] = useState(false);
  const [shareMemberClient, setShareMemberClient] =
    useState<AuditLiveClient | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [directory, setDirectory] = useState<DirectoryMember[]>([]);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestErr, setRequestErr] = useState<string | null>(null);
  /** HTTP fallback when WebSocket does not populate `browser-tab-events-update` (same data as timeline API). */
  const [httpTabSnapshots, setHttpTabSnapshots] = useState<
    Map<number, BrowserTabAnalyticsSnapshot>
  >(() => new Map());

  const isTeamLead =
    authState.status === "authenticated" && authState.user.role === "team_lead";

  const tlAccessStatus =
    isTeamLead && teamLeadOrgAccess?.loaded
      ? teamLeadOrgAccess.statusForOrg(orgId)
      : "none";
  const canOperateTeam = !isTeamLead || tlAccessStatus === "approved";

  useEffect(() => {
    if (!isTeamLead || !Number.isFinite(orgId) || orgId <= 0 || !canOperateTeam) {
      setDirectory([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/teams/${orgId}/members`, { credentials: "include" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled || !ok || !Array.isArray(j.members)) return;
        setDirectory(
          j.members.map((m: { id: string; name: string; email: string }) => ({
            id: m.id,
            name: m.name,
            email: m.email,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setDirectory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isTeamLead, orgId, canOperateTeam]);

  const orgName = useMemo(() => {
    if (!Number.isFinite(orgId)) return null;
    return (
      orgs.find((o) => o.id === orgId)?.name ??
      clients.find((c) => c.orgId === orgId)?.orgName ??
      null
    );
  }, [orgId, orgs, clients]);

  const teamClients = useMemo(() => {
    if (!Number.isFinite(orgId)) return [];
    return clients.filter((c) => c.orgId === orgId);
  }, [clients, orgId]);

  const visibleClients = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return teamClients;
    return teamClients.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        (c.orgName ?? "").toLowerCase().includes(q) ||
        memberOrgPlainText(c.fullName, c.orgName, c.orgId, c.claimedOrgName).toLowerCase().includes(q) ||
        (c.claimedOrgName ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        String(c.id).includes(q)
    );
  }, [teamClients, memberSearch]);

  useEffect(() => {
    setHttpTabSnapshots(new Map());
  }, [orgId]);

  useEffect(() => {
    if (!isBrowserTabHttpPollEnabled()) {
      setHttpTabSnapshots(new Map());
      return;
    }
    if (!Number.isFinite(orgId) || orgId <= 0) return;
    if (!canOperateTeam) return;
    if (connectionStatus !== "Live" || !signalingSessionToken) return;

    let cancelled = false;
    const run = async () => {
      const token = signalingSessionToken;
      const list = teamClients;
      if (!token || list.length === 0) return;

      const entries = await Promise.all(
        list.map(async (c) => {
          try {
            const r = await fetch(
              `/api/audit/browser-tab-snapshot?signalOrgId=${orgId}&signalClientId=${c.id}`,
              {
                credentials: "include",
                headers: { "x-signaling-session": token },
              }
            );
            const j = (await r.json().catch(() => null)) as {
              snapshot?: BrowserTabAnalyticsSnapshot | null;
            } | null;
            if (!r.ok || !j?.snapshot) return null;
            return [c.id, j.snapshot] as const;
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;
      setHttpTabSnapshots((prev) => {
        const next = new Map(prev);
        for (const e of entries) {
          if (e) next.set(e[0], e[1]);
        }
        return next;
      });
    };

    void run();
    const timer = setInterval(() => void run(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [orgId, canOperateTeam, connectionStatus, signalingSessionToken, teamClients]);

  const displayName = orgName || `Team ${orgId}`;

  const headerSubtitle = canOperateTeam
    ? `${visibleClients.length}/${teamClients.length} members visible in this organization`
    : "Member roster is hidden until a super-admin approves your access.";

  /* One stable-length dep array (React 19 / Fast Refresh can error if dep count changes across renders). */
  const headerSyncKey = `${orgId}::${displayName}::${headerSubtitle}`;

  useEffect(() => {
    if (!Number.isFinite(orgId) || orgId <= 0) return;
    useUIStore.getState().setHeader(displayName, headerSubtitle);
    return () => useUIStore.getState().setHeader("", "");
  }, [headerSyncKey]);

  if (!Number.isFinite(orgId) || orgId <= 0) {
    router.replace("/audit");
    return null;
  }

  const onRequestAccess = async () => {
    if (!Number.isFinite(orgId) || orgId <= 0) return;
    setRequestErr(null);
    setRequestBusy(true);
    try {
      await apiRequestTeamLeadOrgAccess(orgId, {
        signalingOrgLabel: displayName,
      });
      teamLeadOrgAccess?.refresh();
    } catch (e: unknown) {
      setRequestErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRequestBusy(false);
    }
  };

  return (
    <AnimatedPage>
      <div className="flex flex-col">
        {isTeamLead && canOperateTeam ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-5">
            <div className="min-w-[260px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                Team Workspace
              </p>
              <h2 className="text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                {displayName}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative min-w-[260px]">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
                />
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search members in this team"
                  className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] pl-9 pr-3 text-[12px] text-[var(--color-text-primary)] outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setShareTeamOpen(true)}
                className="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-gray-100 hover:text-[var(--text-primary)]"
              >
                <UserPlus size={14} className="opacity-70" />
                Share team
              </button>
            </div>
          </div>
        ) : null}

        {/* Access request banner */}
        {isTeamLead && teamLeadOrgAccess?.loaded && !canOperateTeam ? (
          <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
              Super-admin approval required
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              {tlAccessStatus === "pending"
                ? "Your request is pending. Access will be granted once approved."
                : tlAccessStatus === "rejected"
                  ? "Your request was rejected. You can submit a new request below."
                  : tlAccessStatus === "revoked"
                    ? "Access was revoked. Submit a new request if needed."
                    : "Request access so a super-admin can approve viewing this team’s data."}
            </p>
            {requestErr ? (
              <p className="mt-2 text-sm text-[var(--red)]">{requestErr}</p>
            ) : null}
            {tlAccessStatus === "none" ||
            tlAccessStatus === "rejected" ||
            tlAccessStatus === "revoked" ? (
              <button
                type="button"
                disabled={requestBusy}
                onClick={() => void onRequestAccess()}
                className="mt-4 inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {requestBusy ? "Sending…" : "Request access"}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Members table */}
        {visibleClients.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
            <Info size={28} className="text-[var(--color-text-muted)] mb-3 opacity-30" />
            {isTeamLead && teamLeadOrgAccess?.loaded && !canOperateTeam ? (
              <>
                <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                  No visible members
                </p>
                <p className="mt-1 max-w-md text-[12px] text-[var(--color-text-muted)]">
                  Live clients are hidden until access is approved.
                </p>
              </>
            ) : (
              <>
                <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                  No Members Online
                </p>
                <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
                  Waiting for clients to connect.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] overflow-hidden">
            {/* Table header */}
            <div
              className={`grid items-start border-b border-[var(--color-border)] px-5 py-2.5 ${
                isTeamLead
                  ? "grid-cols-[1fr_100px_120px_200px]"
                  : "grid-cols-[1fr_100px_120px_170px]"
              }`}
            >
              <div>
                <div className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                  Member
                </div>
                <p className="mt-1 text-[10px] font-medium normal-case tracking-normal text-[var(--color-text-muted)]">
                  3 recent tabs · dwell totals (refreshed every few seconds)
                </p>
              </div>
              <div className="pt-0.5 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Status
              </div>
              <div className="pt-0.5 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Device
              </div>
              <div className="pt-0.5 text-right text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Action
              </div>
            </div>

            {/* Table rows */}
            <div className="flex flex-col">
              {visibleClients.map((client) => {
                const isOnline =
                  client.status === "online" || client.status === "sharing";
                const isSharing = client.status === "sharing";
                const wsSnap = getBrowserTabAnalytics(client.id);
                const httpSnap = httpTabSnapshots.get(client.id);
                const tabSnapshot = pickFresherTabSnapshot(wsSnap, httpSnap);
                const recentTabs = topRecentBrowserTabs(tabSnapshot, 3);
                const snapshotAge = formatSnapshotAgeRelative(tabSnapshot?.updatedAtMs);
                const tabEmptyHint =
                  recentTabs.length > 0
                    ? null
                    : connectionStatus !== "Live"
                      ? "Connect to signaling (Live) for tab snapshots."
                      : !signalingSessionToken
                        ? "Waiting for signaling session…"
                        : "No tab snapshot yet.";

                return (
                  <div
                    key={client.id}
                    className={`group grid items-start border-b border-[var(--color-border-subtle)] px-5 py-3 transition-colors last:border-0 hover:bg-[var(--color-bg-hover)] ${
                      isTeamLead
                        ? "grid-cols-[1fr_100px_120px_200px]"
                        : "grid-cols-[1fr_100px_120px_170px]"
                    }`}
                  >
                    {/* Member + recent tabs */}
                    <div className="flex min-w-0 gap-3 pr-2">
                      <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center">
                        <User size={13} className="text-[var(--color-text-muted)]" />
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
                        <MemberOrgLabel
                          fullName={client.fullName}
                          claimedOrgName={client.claimedOrgName}
                          orgName={client.orgName}
                          orgId={client.orgId}
                          size="md"
                          className="w-full"
                        />
                        <span className="text-[11px] text-[var(--color-text-muted)] truncate font-mono">
                          {client.email || `ID: ${client.id}`}
                        </span>
                        {recentTabs.length > 0 ? (
                          <div className="mt-2 border-l border-[var(--color-border)] pl-2">
                            {snapshotAge ? (
                              <p className="mb-1.5 text-[9px] text-[var(--color-text-tertiary)]">
                                Last snapshot · {snapshotAge}
                              </p>
                            ) : null}
                            <ul className="space-y-1">
                              {recentTabs.map((tab, ti) => {
                                const { title, host } = tabTitleAndHost(tab);
                                const totalMs = tabTotalDwellMs(tab);
                                return (
                                  <li
                                    key={
                                      tab.tabId != null && tab.tabId >= 0
                                        ? `tid-${client.id}-${tab.tabId}`
                                        : `t-${client.id}-${ti}-${tab.url.slice(0, 24)}`
                                    }
                                    className="text-[10px] leading-snug text-[var(--color-text-secondary)]"
                                  >
                                    <div className="flex min-w-0 items-start justify-between gap-2">
                                      <span className="min-w-0 flex-1 font-medium text-[var(--color-text-primary)] line-clamp-1">
                                        {tab.isActive ? (
                                          <span className="mr-1 text-[9px] font-semibold uppercase text-[var(--color-accent)]">
                                            Active
                                          </span>
                                        ) : null}
                                        {title}
                                      </span>
                                      <span
                                        className="shrink-0 font-mono tabular-nums text-[9px] text-[var(--color-text-tertiary)]"
                                        title={
                                          tab.totalActiveMs != null
                                            ? "Cumulative time reported by the extension for this tab."
                                            : "Active + idle dwell on this tab in the latest snapshot."
                                        }
                                      >
                                        {formatActiveDuration(totalMs)}
                                      </span>
                                    </div>
                                    {host && host.toLowerCase() !== title.toLowerCase() ? (
                                      <span className="mt-0.5 block truncate font-mono text-[9px] text-[var(--color-text-muted)]">
                                        {host}
                                      </span>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : (
                          <p className="mt-2 text-[10px] text-[var(--color-text-muted)] leading-snug">
                            {tabEmptyHint ?? "No tab snapshot yet"}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-2 pt-0.5">
                      {isSharing ? (
                        <>
                          <Radio size={11} className="text-[var(--color-accent)]" />
                          <span className="text-[11px] font-medium text-[var(--color-accent)]">
                            Streaming
                          </span>
                        </>
                      ) : isOnline ? (
                        <>
                          <div className="h-2 w-2 rounded-full bg-[var(--color-status-online)]" />
                          <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
                            Online
                          </span>
                        </>
                      ) : (
                        <>
                          <WifiOff size={11} className="text-[var(--color-text-muted)]" />
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            Offline
                          </span>
                        </>
                      )}
                    </div>

                    {/* Device */}
                    <div className="pt-0.5 text-[11px] text-[var(--color-text-muted)] truncate pr-4 font-mono">
                      {client.device ?? "—"}
                    </div>

                    {/* Actions — compact toolbar: secondary icons + primary observe */}
                    <div className="flex flex-nowrap items-center justify-end gap-2 pt-0.5">
                      <div
                        role="toolbar"
                        aria-label={`Actions for ${memberOrgPlainText(client.fullName, client.orgName, client.orgId, client.claimedOrgName)}`}
                        className="inline-flex shrink-0 items-stretch overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-xs)]"
                      >
                        <Link
                          href={`/audit/${orgId}/${client.id}/analytics`}
                          className="inline-flex h-8 w-8 items-center justify-center text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
                          title="Browser analytics"
                          aria-label="Open browser analytics"
                        >
                          <BarChart3 size={15} strokeWidth={2} />
                        </Link>
                        {isTeamLead && canOperateTeam ? (
                          <>
                            <span
                              className="w-px shrink-0 self-stretch bg-[var(--color-border)]"
                              aria-hidden
                            />
                            <button
                              type="button"
                              onClick={() => setShareMemberClient(client)}
                              className="inline-flex h-8 w-8 items-center justify-center text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
                              title="Share access"
                              aria-label="Share access with a member"
                            >
                              <UserPlus size={15} strokeWidth={2} />
                            </button>
                          </>
                        ) : null}
                      </div>
                      {(isOnline || isSharing) && (
                        <button
                          type="button"
                          onClick={() => setSelectedClient(client.id)}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                        >
                          <MonitorPlay size={14} strokeWidth={2} aria-hidden />
                          Observe
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Stream cinema overlay */}
      <AnimatePresence>
        {selectedClient && (
          <StreamSidePanel
            orgId={orgId}
            clientId={selectedClient}
            onClose={() => setSelectedClient(null)}
          />
        )}
      </AnimatePresence>

      {shareTeamOpen ? (
        <ShareAccessModal
          open
          onClose={() => setShareTeamOpen(false)}
          shareScope="team"
          signalingOrgId={orgId}
          orgName={displayName}
        />
      ) : null}

      {shareMemberClient ? (
        <ShareAccessModal
          open
          onClose={() => setShareMemberClient(null)}
          shareScope="member"
          signalingOrgId={orgId}
          orgName={displayName}
          signalClientId={shareMemberClient.id}
          memberLabel={memberOrgPlainText(
            shareMemberClient.fullName,
            shareMemberClient.orgName,
            shareMemberClient.orgId,
            shareMemberClient.claimedOrgName,
          )}
          memberUserId={
            matchDirectoryMember(shareMemberClient, directory)?.id ?? null
          }
        />
      ) : null}
    </AnimatedPage>
  );
}
