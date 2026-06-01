"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatedPage } from "@/components/ui/AnimatedPage";
import { useAuth } from "@/context/auth-context";
import { useAuditSignaling } from "@/context/audit-signaling-context";
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
type ClientSummary = { id: number; name: string; orgId: number; orgName: string };

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [teamSelectionByUser, setTeamSelectionByUser] = useState<Record<string, string>>({});
  const [clientSelectionByUser, setClientSelectionByUser] = useState<Record<string, string>>({});
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
        liveClients.map((c) => ({
          id: c.id,
          name: c.fullName || `Client ${c.id}`,
          orgId: c.orgId,
          orgName:
            orgs.find((o) => o.id === c.orgId)?.name ?? c.orgName ?? `Team ${c.orgId}`,
        }))
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

  const grantTeamAccess = async (row: AccessRow) => {
    const selected = teamSelectionByUser[row.userId];
    if (!selected) return;
    setBusyKey(`grant-team-${row.userId}`);
    try {
      await apiAccessShare({
        recipientMode: "audit_member",
        targetUserId: row.userId,
        shareScope: "team",
        signalingOrgId: Number(selected),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to grant team access");
    } finally {
      setBusyKey(null);
    }
  };

  const grantClientAccess = async (row: AccessRow) => {
    const selected = clientSelectionByUser[row.userId];
    const mapped = clients.find((c) => String(c.id) === selected);
    if (!mapped) return;
    setBusyKey(`grant-client-${row.userId}`);
    try {
      await apiAccessShare({
        recipientMode: "audit_member",
        targetUserId: row.userId,
        shareScope: "member",
        signalingOrgId: mapped.orgId,
        signalClientId: mapped.id,
        memberUserId: row.userId,
        liveTeamName: mapped.orgName,
        liveMemberName: mapped.name,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to grant client access");
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
              Review and manage team and client stream access for all audit members.
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              Teams loaded: {teams.length} · Live clients loaded: {clients.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search member, email, organization…"
              className="h-9 min-w-[280px] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-3 text-[12px] text-[var(--color-text-primary)] outline-none"
            />
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 text-[12px] font-medium text-[var(--color-text-secondary)]"
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
          <div className="grid grid-cols-[2fr_1fr_1.3fr_1.3fr_1.5fr] border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface-2)] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            <div>Member</div>
            <div>Directory Org</div>
            <div>Live Team Access</div>
            <div>Client Stream Access</div>
            <div>Grant / Revoke</div>
          </div>
          {loading ? (
            <div className="p-8 text-center text-[13px] text-[var(--color-text-muted)]">Loading access…</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[var(--color-text-muted)]">No members found.</div>
          ) : (
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {filteredRows.map((row) => (
                <div key={row.userId} className="grid grid-cols-[2fr_1fr_1.3fr_1.3fr_1.5fr] gap-3 px-4 py-4 text-[12px]">
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
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--color-status-pending-border)] bg-[var(--color-status-pending-bg)] px-2 py-0.5 text-[11px] text-[var(--color-status-pending-text)] disabled:opacity-50"
                            title={c ? "Click to revoke this client access" : "Client not currently resolvable"}
                          >
                            <ShieldX size={11} />
                            {c?.name ?? `Client ${cid}`}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      <CustomSelect
                        size="sm"
                        value={teamSelectionByUser[row.userId] ?? ""}
                        onValueChange={(v) =>
                          setTeamSelectionByUser((s) => ({ ...s, [row.userId]: v }))
                        }
                        options={[
                          { value: "", label: "Select team…" },
                          ...teams.map((t) => ({
                            value: String(t.id),
                            label: t.name,
                          })),
                        ]}
                        className="min-w-0 flex-1"
                      />
                      <button
                        type="button"
                        disabled={!teamSelectionByUser[row.userId] || busyKey === `grant-team-${row.userId}`}
                        onClick={() => void grantTeamAccess(row)}
                        className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-2 text-[11px] font-semibold text-white disabled:opacity-50"
                      >
                        <KeyRound size={11} />
                        Grant Team
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <CustomSelect
                        size="sm"
                        value={clientSelectionByUser[row.userId] ?? ""}
                        onValueChange={(v) =>
                          setClientSelectionByUser((s) => ({ ...s, [row.userId]: v }))
                        }
                        options={[
                          { value: "", label: "Select client…" },
                          ...clients.map((c) => ({
                            value: String(c.id),
                            label: `${c.name} - ${c.orgName}`,
                          })),
                        ]}
                        className="min-w-0 flex-1"
                      />
                      <button
                        type="button"
                        disabled={
                          !clientSelectionByUser[row.userId] || busyKey === `grant-client-${row.userId}`
                        }
                        onClick={() => void grantClientAccess(row)}
                        className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-2 text-[11px] font-semibold text-[var(--color-accent)] disabled:opacity-50"
                      >
                        <KeyRound size={11} />
                        Grant Client
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
