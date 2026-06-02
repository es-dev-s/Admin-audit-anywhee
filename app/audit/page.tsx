"use client";

import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw,
  WifiOff,
  Users,
  ChevronRight,
  LayoutGrid,
  UserPlus,
  Radio,
  Activity,
  Search,
} from "lucide-react";
import { AnimatedPage } from "@/components/ui/AnimatedPage";
import { useAuditSignaling } from "@/context/audit-signaling-context";
import { useAuth } from "@/context/auth-context";
import { ShareAccessModal } from "@/components/audit/ShareAccessModal";
import { useUIStore } from "@/store/uiStore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/audit/StatusBadge";
import { MemberAccessRequestPanel } from "@/components/audit/MemberAccessRequestPanel";

type Filter = "all" | "active";

export default function AuditPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const { state: authState } = useAuth();
  const { orgs, clients, connectionStatus, teamLeadOrgAccess, assignedGroups } = useAuditSignaling();
  const [shareOrg, setShareOrg] = useState<{ id: number; name: string } | null>(null);

  const isTeamLead =
    authState.status === "authenticated" && authState.user.role === "team_lead";
  const isAuditMember =
    authState.status === "authenticated" &&
    authState.user.role === "audit_member";

  const orgStats = useMemo(() => {
    const byOrg = new Map<number, { total: number; online: number; sharing: number }>();
    for (const o of orgs) {
      byOrg.set(o.id, { total: 0, online: 0, sharing: 0 });
    }
    for (const c of clients) {
      let row = byOrg.get(c.orgId);
      if (!row) {
        row = { total: 0, online: 0, sharing: 0 };
        byOrg.set(c.orgId, row);
      }
      row.total += 1;
      if (c.status === "online" || c.status === "sharing") row.online += 1;
      if (c.status === "sharing") row.sharing += 1;
    }
    const list = orgs.map((o) => {
      const s = byOrg.get(o.id) ?? { total: 0, online: 0, sharing: 0 };
      return { org: o, ...s };
    });
    for (const [orgId, s] of byOrg) {
      if (!orgs.some((o) => o.id === orgId)) {
        list.push({
          org: {
            id: orgId,
            name: clients.find((c) => c.orgId === orgId)?.orgName || `Org ${orgId}`,
          },
          ...s,
        });
      }
    }
    return list.sort((a, b) => a.org.name.localeCompare(b.org.name));
  }, [orgs, clients]);

  const filtered = useMemo(() => {
    const base =
      filter === "all"
        ? orgStats
        : orgStats.filter((x) => x.online > 0 || x.sharing > 0);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((x) => x.org.name.toLowerCase().includes(q));
  }, [orgStats, filter, query]);

  const statTotals = useMemo(() => {
    let members = 0;
    let online = 0;
    let live = 0;
    for (const x of orgStats) {
      members += x.total;
      online += x.online;
      live += x.sharing;
    }
    return {
      teams: orgStats.length,
      members,
      online,
      live,
    };
  }, [orgStats]);

  useEffect(() => {
    /* Title lives in page hero; keep topbar minimal on this route */
    useUIStore.getState().setHeader("", "");
    return () => useUIStore.getState().setHeader("", "");
  }, []);

  const showErrorEmpty =
    filtered.length === 0 &&
    (connectionStatus.includes("Missing") || connectionStatus.includes("credentials"));

  // Build a map of clientId → client for group member display.
  const clientById = useMemo(() => {
    const m = new Map<number, (typeof clients)[0]>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  return (
    <AnimatedPage>
      <div className="flex w-full flex-col">

        {isAuditMember ? <MemberAccessRequestPanel /> : null}

        {/* ── Assigned groups banner (team lead only) ── */}
        {isTeamLead && assignedGroups.length > 0 && (
          <div className="mb-8 rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 shadow-[var(--shadow-sm)]">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]">
                Your assigned groups
              </span>
              <span className="rounded-full bg-[var(--color-accent-subtle)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-accent)]">
                {assignedGroups.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-4">
              {assignedGroups.map((g) => (
                <div
                  key={g.id}
                  className="min-w-[180px] rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-4"
                >
                  <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{g.name}</p>
                  {g.description && (
                    <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">{g.description}</p>
                  )}
                  <p className="mt-2 text-[11px] font-medium text-[var(--color-text-secondary)]">
                    {g.signalClientIds.length} client{g.signalClientIds.length !== 1 ? "s" : ""}
                  </p>
                  {g.signalClientIds.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {g.signalClientIds.slice(0, 5).map((cid) => {
                        const c = clientById.get(cid);
                        if (!c) return null;
                        const org = (c.claimedOrgName || c.orgName || "").trim();
                        return (
                          <li key={cid} className="flex items-center gap-1.5 text-[11px]">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{
                                background:
                                  c.status === "sharing"
                                    ? "var(--color-success)"
                                    : c.status === "online"
                                      ? "var(--color-warning)"
                                      : "var(--color-text-muted)",
                              }}
                            />
                            <span className="font-medium text-[var(--color-text-primary)]">{c.fullName}</span>
                            {org && (
                              <span className="text-[var(--color-text-tertiary)]">· {org}</span>
                            )}
                            <span className={`ml-auto text-[9px] font-bold uppercase ${c.status === "sharing" ? "text-[var(--color-success)]" : c.status === "online" ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)]"}`}>
                              {c.status}
                            </span>
                          </li>
                        );
                      })}
                      {g.signalClientIds.length > 5 && (
                        <li className="text-[11px] text-[var(--color-text-tertiary)]">
                          +{g.signalClientIds.length - 5} more
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-8">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
              Audit Workspace
            </p>
            <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text-primary)]">
              Organizations
            </h1>
            <p className="mt-1.5 text-[13px] text-[var(--color-text-secondary)]">
              {statTotals.teams} team{statTotals.teams === 1 ? "" : "s"} · {statTotals.online} online
              {statTotals.live > 0 ? ` · ${statTotals.live} live` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[260px]">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search organizations"
                className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] pl-9 pr-3 text-[12px] text-[var(--color-text-primary)] outline-none"
              />
            </div>
            <div className="inline-flex h-8 min-h-[32px] items-center rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-0.5 shadow-[var(--shadow-xs)]">
              {(["all", "active"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`relative flex h-full min-w-[88px] items-center justify-center rounded-full px-3 text-[13px] font-medium transition-all duration-200 ${
                    filter === f
                      ? "text-[var(--color-accent)]"
                      : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                  }`}
                >
                  {filter === f ? (
                    <motion.span
                      layoutId="dash-filter-pill"
                      className="absolute inset-0 z-0 rounded-full border border-[var(--color-accent-border)] bg-[var(--color-accent-subtle)] shadow-[var(--shadow-xs)]"
                      transition={{ duration: 0.2 }}
                    />
                  ) : null}
                  <span className="relative z-10 capitalize">{f} teams</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="ui-icon-btn grid h-8 w-8 place-items-center rounded-[var(--input-radius)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-tertiary)] transition-all duration-200 hover:bg-white hover:text-[var(--color-text-secondary)] hover:shadow-[var(--shadow-xs)]"
              onClick={() => window.location.reload()}
              aria-label="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
          {(
            [
              {
                label: "Total teams",
                value: statTotals.teams,
                sub: "Registered organizations",
                icon: LayoutGrid,
                tone: "text-[var(--color-accent)]",
                bg: "bg-[var(--color-accent-subtle)]",
              },
              {
                label: "Total members",
                value: statTotals.members,
                sub: "Roster size",
                icon: Users,
                tone: "text-[var(--color-status-online)]",
                bg: "bg-[var(--color-status-online-bg)]",
              },
              {
                label: "Online now",
                value: statTotals.online,
                sub: "Active or sharing",
                icon: Activity,
                tone: "text-[var(--color-status-done)]",
                bg: "bg-[var(--color-status-done-bg)]",
              },
              {
                label: "Live streams",
                value: statTotals.live,
                sub: "Currently sharing",
                icon: Radio,
                tone: "text-[var(--color-status-live)]",
                bg: "bg-[var(--color-status-live-bg)]",
              },
            ] as const
          ).map((card) => (
            <div
              key={card.label}
              className="group rounded-[var(--card-radius)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ${card.bg} ring-1 ring-black/[0.03]`}
                >
                  <card.icon className={`h-[18px] w-[18px] ${card.tone}`} strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                    {card.label}
                  </p>
                  <p className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums tracking-tight text-[var(--color-text-primary)]">
                    {card.value}
                  </p>
                  <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">{card.sub}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-[var(--card-radius)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface-2)]/80">
                  <th
                    scope="col"
                    className="px-6 py-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]"
                  >
                    Live organization
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]"
                  >
                    Total
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]"
                  >
                    Online
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]"
                  >
                    Live
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ org, total, online, sharing }) => {
                  const hasOnline = online > 0;
                  const hasSharing = sharing > 0;
                  const tlAccessStatus =
                    isTeamLead && teamLeadOrgAccess?.loaded
                      ? teamLeadOrgAccess.statusForOrg(org.id)
                      : null;
                  const canShareOrg =
                    !isTeamLead ||
                    (teamLeadOrgAccess?.loaded === true &&
                      teamLeadOrgAccess.approvedOrgIds.has(org.id));

                  return (
                    <motion.tr
                      key={org.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="cursor-pointer border-b border-[var(--color-border-subtle)] transition-colors duration-200 hover:bg-[var(--color-bg-surface-2)]/90 last:border-b-0"
                      onClick={() => router.push(`/audit/${org.id}`)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/audit/${org.id}`);
                        }
                      }}
                    >
                      <td className="min-h-[64px] px-6 py-4 align-middle">
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)] shadow-[var(--shadow-xs)]">
                            <span className="text-[12px] font-semibold">
                              {org.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold leading-none text-[var(--color-text-primary)]">
                              {org.name}
                            </p>
                            {tlAccessStatus != null && tlAccessStatus !== "none" ? (
                              <p className="mt-1.5">
                                <span
                                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-tight ${
                                    tlAccessStatus === "approved"
                                      ? "border-[var(--color-status-done-border)] bg-[var(--color-status-done-bg)] text-[var(--color-status-done-text)]"
                                      : tlAccessStatus === "pending"
                                        ? "border-[var(--color-status-pending-border)] bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-text)]"
                                        : "border-[var(--color-status-error-border)] bg-[var(--color-status-error-bg)] text-[var(--color-status-error-text)]"
                                  }`}
                                >
                                  {tlAccessStatus === "pending"
                                    ? "Pending"
                                    : tlAccessStatus === "approved"
                                      ? "Approved"
                                      : tlAccessStatus === "rejected"
                                        ? "Rejected"
                                        : "Revoked"}
                                </span>
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-middle">
                        <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                          <Users size={14} className="text-[var(--color-text-tertiary)]" />
                          <span className="font-mono text-[13px] font-medium tabular-nums">{total}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-2">
                          <StatusBadge status={hasOnline ? "online" : "offline"} size="sm" />
                          <span
                            className={`font-mono text-[13px] font-medium tabular-nums ${hasOnline ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]"}`}
                          >
                            {online}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-2">
                          <StatusBadge status={hasSharing ? "live" : "offline"} size="sm" />
                          <span
                            className={`font-mono text-[13px] font-medium tabular-nums ${hasSharing ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]"}`}
                          >
                            {sharing}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right align-middle">
                        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          {isTeamLead ? (
                            <button
                              type="button"
                              disabled={!canShareOrg}
                              title={
                                !canShareOrg
                                  ? assignedGroups.length > 0
                                    ? "This team is outside your assigned audit groups"
                                    : "Super-admin must approve access first"
                                  : "Share access"
                              }
                              onClick={() => setShareOrg({ id: org.id, name: org.name })}
                              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-2.5 text-[11px] font-medium text-[var(--color-text-secondary)] transition-all duration-200 hover:bg-[var(--color-bg-surface-2)] hover:text-[var(--color-text-primary)] disabled:pointer-events-none disabled:opacity-30"
                            >
                              <UserPlus size={15} strokeWidth={2} aria-hidden />
                              Share
                            </button>
                          ) : null}
                          <Link
                            href={`/audit/${org.id}`}
                            title="View team"
                            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-2.5 text-[11px] font-medium text-[var(--color-text-secondary)] transition-all duration-200 hover:bg-[var(--color-accent-subtle)] hover:text-[var(--color-accent)]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ChevronRight size={16} strokeWidth={2} aria-hidden />
                            Open
                          </Link>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && !showErrorEmpty && (
            <div className="py-16 text-center">
              <LayoutGrid
                size={24}
                className="mx-auto mb-3 text-[var(--color-text-tertiary)] opacity-40"
              />
              <p className="text-sm text-[var(--color-text-tertiary)]">No teams match this filter.</p>
            </div>
          )}

          {showErrorEmpty && (
            <div className="flex flex-col items-center py-20 text-center">
              <WifiOff size={28} className="mb-3 text-[var(--color-text-tertiary)] opacity-40" />
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">No Teams Detected</p>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                Configure signaling credentials to load your roster.
              </p>
            </div>
          )}
        </div>

        {shareOrg ? (
          <ShareAccessModal
            open
            onClose={() => setShareOrg(null)}
            shareScope="team"
            signalingOrgId={shareOrg.id}
            orgName={shareOrg.name}
          />
        ) : null}
      </div>
    </AnimatedPage>
  );
}
