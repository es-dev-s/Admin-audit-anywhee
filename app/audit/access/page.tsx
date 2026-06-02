"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatedPage } from "@/components/ui/AnimatedPage";
import { useAuth } from "@/context/auth-context";
import { useAssignedGroups, useAuditSignaling } from "@/context/audit-signaling-context";
import {
  apiAccessMatrix,
  apiAccessRevoke,
  apiAccessShare,
  apiListAuditMembers,
} from "@/lib/authClient";
import { useUIStore } from "@/store/uiStore";
import { KeyRound, RefreshCw, ShieldCheck, ShieldX } from "lucide-react";
import { CustomSelect } from "@/components/ui/Select";

type AccessRow = {
  userId: string;
  memberName: string;
  memberEmail: string | null;
  auditOrgName: string | null;
  signalingOrgIds: string[];
  signalClientIds: string[];
  sharedExpiresAt: string | null;
  revokedAt: string | null;
};

type TeamSummary = { id: number; name: string };
type ClientSummary = {
  id: number;
  fullName: string;
  profileOrg: string;
  orgId: number;
  signalingOrg: string;
};

function fmtDate(v: string | null) {
  if (!v) return "Never";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(v));
  } catch {
    return v;
  }
}

function arrayUnique(v: string[]) {
  return [...new Set(v.filter(Boolean).map(String))];
}

export default function AccessMatrixPage() {
  const { state } = useAuth();
  const { orgs, clients: liveClients } = useAuditSignaling();
  const assignedGroups = useAssignedGroups();
  const hasGroupScope = assignedGroups.length > 0;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [memberSelectionByUser, setMemberSelectionByUser] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const canManage =
    state.status === "authenticated" && state.user.role === "team_lead";

  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    try {
      const [matrix, membersRes] = await Promise.all([
        apiAccessMatrix({ includeRevoked: false }),
        apiListAuditMembers(),
      ]);

      const teamList = orgs.map((t) => ({
        id: t.id,
        name: t.name,
      }));
      setTeams(teamList);

      setClients(
        liveClients.map((c) => {
          const profileOrg = (c.claimedOrgName || "").trim();
          const signalingOrg =
            (orgs.find((o) => o.id === c.orgId)?.name ?? c.orgName ?? "").trim() ||
            (Number.isFinite(c.orgId) ? `Team ${c.orgId}` : "");
          return {
            id: c.id,
            fullName: c.fullName?.trim() || `Client ${c.id}`,
            profileOrg,
            orgId: c.orgId,
            signalingOrg,
          };
        }),
      );

      const memberMap = new Map(
        (membersRes.members ?? []).map((m) => [
          m.id,
          {
            memberName: m.name,
            memberEmail: m.email,
            auditOrgName: m.auditOrgName,
          },
        ])
      );

      const grantByUser = new Map<string, AccessRow>();
      for (const g of matrix.rows) {
        grantByUser.set(g.userId, {
          userId: g.userId,
          memberName: g.memberName,
          memberEmail: g.memberEmail,
          auditOrgName: g.auditOrgName,
          signalingOrgIds: arrayUnique(g.signalingOrgIds),
          signalClientIds: arrayUnique(g.signalClientIds),
          sharedExpiresAt: g.sharedExpiresAt,
          revokedAt: g.revokedAt,
        });
      }

      const fullRows: AccessRow[] = (membersRes.members ?? []).map((m) => {
        const g = grantByUser.get(m.id);
        return (
          g ?? {
            userId: m.id,
            memberName: memberMap.get(m.id)?.memberName ?? m.name,
            memberEmail: memberMap.get(m.id)?.memberEmail ?? m.email,
            auditOrgName: memberMap.get(m.id)?.auditOrgName ?? m.auditOrgName,
            signalingOrgIds: [],
            signalClientIds: [],
            sharedExpiresAt: null,
            revokedAt: null,
          }
        );
      });

      setRows(fullRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load access matrix");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canManage, liveClients, orgs]);

  useEffect(() => {
    useUIStore.getState().setHeader(
      "Access",
      "Grant, revoke, and review member access across live teams and client streams"
    );
    return () => useUIStore.getState().setHeader("", "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.memberName.toLowerCase().includes(q) ||
        (r.memberEmail ?? "").toLowerCase().includes(q) ||
        (r.auditOrgName ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const revokeTeamAccess = async (row: AccessRow, signalingOrgId: string) => {
    setBusyKey(`revoke-team-${row.userId}-${signalingOrgId}`);
    try {
      await apiAccessRevoke({
        recipientMode: "audit_member",
        targetUserId: row.userId,
        shareScope: "team",
        signalingOrgId: Number(signalingOrgId),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke team access");
    } finally {
      setBusyKey(null);
    }
  };

  const revokeClientAccess = async (row: AccessRow, signalClientId: string) => {
    const mapped = clients.find((c) => String(c.id) === signalClientId);
    const fallbackOrgId = row.signalingOrgIds[0]
      ? Number(row.signalingOrgIds[0])
      : NaN;
    const orgIdForRevoke =
      mapped?.orgId ??
      (Number.isFinite(fallbackOrgId) && fallbackOrgId > 0
        ? fallbackOrgId
        : null);
    if (!orgIdForRevoke) return;
    setBusyKey(`revoke-client-${row.userId}-${signalClientId}`);
    try {
      await apiAccessRevoke({
        recipientMode: "audit_member",
        targetUserId: row.userId,
        shareScope: "member",
        signalingOrgId: orgIdForRevoke,
        signalClientId: Number(signalClientId),
        memberUserId: row.userId,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke client access");
    } finally {
      setBusyKey(null);
    }
  };

  const memberSelectOptions = useMemo(
    () => [
      { value: "", label: "Select member…" },
      ...clients.map((c) => ({
        value: String(c.id),
        label: c.fullName,
        sublabel: c.profileOrg || c.signalingOrg || undefined,
        sublabelKind: c.profileOrg ? ("profile" as const) : ("org" as const),
      })),
    ],
    [clients],
  );

  const grantMemberAccess = async (row: AccessRow) => {
    const selected = memberSelectionByUser[row.userId];
    const mapped = clients.find((c) => String(c.id) === selected);
    if (!mapped) return;
    setBusyKey(`grant-member-${row.userId}`);
    try {
      await apiAccessShare({
        recipientMode: "audit_member",
        targetUserId: row.userId,
        shareScope: "member",
        signalingOrgId: mapped.orgId,
        signalClientId: mapped.id,
        memberUserId: row.userId,
        liveTeamName: mapped.signalingOrg,
        liveMemberName: mapped.fullName,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to grant member access");
    } finally {
      setBusyKey(null);
    }
  };

  if (!canManage) {
    return (
      <AnimatedPage>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-8 text-[13px] text-[var(--color-text-secondary)]">
          Only team leads can manage access.
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-5">
          <div className="min-w-[260px]">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              Access Matrix
            </p>
            <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)]">
              Member Access Control
            </h1>
            <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
              {hasGroupScope
                ? "Grant access only within your assigned audit groups — organizations and clients outside that scope are hidden."
                : "Review and manage organization and client stream access for audit members."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search member, email, organization…"
              className="ui-input min-w-[280px]"
            />
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="ui-btn"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-muted)] p-3 text-[12px] text-[var(--color-danger)]">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
          <div className="hidden border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface-2)] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] lg:grid lg:grid-cols-[2fr_1fr_1.2fr_1.2fr_1.4fr] lg:gap-3">
            <div>Audit member</div>
            <div>Directory org</div>
            <div>Team access</div>
            <div>Stream access</div>
            <div>Grant / revoke</div>
          </div>
          {loading ? (
            <div className="p-8 text-center text-[13px] text-[var(--color-text-muted)]">Loading access…</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[var(--color-text-muted)]">No members found.</div>
          ) : (
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {filteredRows.map((row) => (
                <div
                  key={row.userId}
                  className="flex flex-col gap-4 px-4 py-4 text-[12px] lg:grid lg:grid-cols-[2fr_1fr_1.2fr_1.2fr_1.4fr] lg:items-start lg:gap-3"
                >
                  <div>
                    <p className="font-semibold text-[var(--color-text-primary)]">{row.memberName}</p>
                    <p className="text-[var(--color-text-muted)]">{row.memberEmail ?? "—"}</p>
                    <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                      Expires: {fmtDate(row.sharedExpiresAt)}
                    </p>
                  </div>
                  <div className="flex items-start">
                    <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
                      {row.auditOrgName ?? "Unassigned"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-start gap-1">
                    <p className="mb-1 w-full text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] lg:hidden">
                      Team access
                    </p>
                    {row.signalingOrgIds.length === 0 ? (
                      <span className="text-[var(--color-text-muted)]">No team access</span>
                    ) : (
                      row.signalingOrgIds.map((sid) => {
                        const team = teams.find((t) => String(t.id) === sid);
                        return (
                          <button
                            key={`${row.userId}-team-${sid}`}
                            type="button"
                            disabled={busyKey === `revoke-team-${row.userId}-${sid}`}
                            onClick={() => void revokeTeamAccess(row, sid)}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--color-status-online-border)] bg-[var(--color-status-online-bg)] px-2 py-0.5 text-[11px] text-[var(--color-status-online-text)]"
                            title="Click to revoke this team access"
                          >
                            <ShieldCheck size={11} />
                            {team?.name ?? `Team ${sid}`}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="flex flex-wrap items-start gap-1">
                    <p className="mb-1 w-full text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] lg:hidden">
                      Stream access
                    </p>
                    {row.signalClientIds.length === 0 ? (
                      <span className="text-[var(--color-text-muted)]">No stream access</span>
                    ) : (
                      row.signalClientIds.map((cid) => {
                        const c = clients.find((x) => String(x.id) === cid);
                        return (
                          <button
                            key={`${row.userId}-client-${cid}`}
                            type="button"
                            disabled={!c || busyKey === `revoke-client-${row.userId}-${cid}`}
                            onClick={() => void revokeClientAccess(row, cid)}
                            className="inline-flex max-w-full flex-col items-start gap-0.5 rounded-lg border border-[var(--color-status-pending-border)] bg-[var(--color-status-pending-bg)] px-2 py-1 text-left text-[11px] text-[var(--color-status-pending-text)] disabled:opacity-50"
                            title={c ? "Click to revoke stream access" : "Member not currently in roster"}
                          >
                            <span className="inline-flex items-center gap-1 font-semibold">
                              <ShieldX size={11} className="shrink-0" />
                              {c?.fullName ?? `Client ${cid}`}
                            </span>
                            {c?.profileOrg || c?.signalingOrg ? (
                              <span className="flex items-center gap-1 pl-4 text-[10px] opacity-90">
                                {c.profileOrg ? (
                                  <span className="rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide bg-black/10">
                                    Profile
                                  </span>
                                ) : null}
                                <span className="truncate">{c.profileOrg || c.signalingOrg}</span>
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] lg:hidden">
                      Grant / revoke
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                      <CustomSelect
                        size="sm"
                        value={memberSelectionByUser[row.userId] ?? ""}
                        onValueChange={(v) =>
                          setMemberSelectionByUser((s) => ({ ...s, [row.userId]: v }))
                        }
                        options={memberSelectOptions}
                        placeholder="Select member…"
                        aria-label={`Select live member for ${row.memberName}`}
                        className="min-w-0 w-full flex-1 sm:min-w-[200px]"
                        triggerClassName="!h-auto min-h-9 py-1.5"
                      />
                      <button
                        type="button"
                        disabled={
                          !memberSelectionByUser[row.userId] ||
                          busyKey === `grant-member-${row.userId}`
                        }
                        onClick={() => void grantMemberAccess(row)}
                        className="ui-btn ui-btn--primary ui-btn--sm shrink-0 sm:min-w-[108px]"
                      >
                        <KeyRound size={11} />
                        Grant access
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AnimatedPage>
  );
}
