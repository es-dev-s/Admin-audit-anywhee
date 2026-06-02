"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Send, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useAuditSignaling } from "@/context/audit-signaling-context";
import {
  apiCreateMemberAccessRequest,
  apiListMemberAccessRequests,
  type MemberAccessRequestRow,
} from "@/lib/authClient";

export function MemberAccessRequestPanel() {
  const { orgs, clients } = useAuditSignaling();
  const [requests, setRequests] = useState<MemberAccessRequestRow[]>([]);
  const [shareScope, setShareScope] = useState<"team" | "member">("team");
  const [orgId, setOrgId] = useState("");
  const [clientId, setClientId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiListMemberAccessRequests();
      setRequests(res.requests ?? []);
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orgOptions = useMemo(
    () => orgs.map((o) => ({ id: String(o.id), name: o.name })),
    [orgs]
  );

  const clientsInOrg = useMemo(() => {
    const oid = Number(orgId);
    if (!Number.isFinite(oid) || oid <= 0) return [];
    return clients.filter((c) => c.orgId === oid);
  }, [clients, orgId]);

  useEffect(() => {
    if (orgOptions.length > 0 && !orgId) {
      setOrgId(orgOptions[0].id);
    }
  }, [orgOptions, orgId]);

  const selectedOrg = orgs.find((o) => String(o.id) === orgId);
  const pending = requests.filter((r) => r.status === "pending");

  const submit = async () => {
    setErr(null);
    setMsg(null);
    const signalingOrgId = Number(orgId);
    if (!Number.isFinite(signalingOrgId) || signalingOrgId <= 0) {
      setErr("Select a valid team / organization.");
      return;
    }
    const signalClientId =
      shareScope === "member" ? Number(clientId) : undefined;
    if (shareScope === "member") {
      if (!Number.isFinite(signalClientId) || signalClientId! <= 0) {
        setErr("Select a client for member-level access.");
        return;
      }
    }

    setBusy(true);
    try {
      await apiCreateMemberAccessRequest({
        shareScope,
        signalingOrgId,
        signalClientId: signalClientId ?? null,
        message: message.trim() || null,
        liveTeamName: selectedOrg?.name ?? null,
        liveMemberName:
          shareScope === "member"
            ? clientsInOrg.find((c) => String(c.id) === clientId)?.fullName ??
              null
            : null,
      });
      setMsg("Request sent to your team lead.");
      setMessage("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-5 py-4 shadow-[var(--shadow-xs)]">
      <p className="text-sm font-semibold text-[var(--color-text-primary)]">
        Request live access
      </p>
      <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
        Your team lead will approve or decline. You cannot view live streams until
        access is granted.
      </p>

      {pending.length > 0 ? (
        <div className="mt-3 space-y-2">
          {pending.map((r) => (
            <div
              key={r.id}
              className="flex items-start gap-2 rounded-lg border border-[var(--color-status-pending-border)] bg-[var(--color-status-pending-bg)] px-3 py-2 text-[12px]"
            >
              <Clock size={14} className="mt-0.5 shrink-0 text-[var(--color-status-pending-text)]" />
              <span className="text-[var(--color-status-pending-text)]">
                Pending:{" "}
                {r.shareScope === "team"
                  ? `Team ${r.liveTeamName ?? r.signalingOrgId}`
                  : `${r.liveMemberName ?? "Client"} · ${r.liveTeamName ?? "team"}`}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">
          Team / organization
          <select
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-[13px]"
            value={orgId}
            onChange={(e) => {
              setOrgId(e.target.value);
              setClientId("");
            }}
          >
            {orgOptions.length === 0 ? (
              <option value="">No teams visible — ask team lead for org ID</option>
            ) : (
              orgOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))
            )}
          </select>
        </label>

        {orgOptions.length === 0 ? (
          <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">
            Signaling org ID
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-[13px]"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              placeholder="e.g. 12"
            />
          </label>
        ) : null}

        <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">
          Access type
          <select
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-[13px]"
            value={shareScope}
            onChange={(e) =>
              setShareScope(e.target.value as "team" | "member")
            }
          >
            <option value="team">Whole team (all members)</option>
            <option value="member">Single client screen</option>
          </select>
        </label>

        {shareScope === "member" ? (
          <label className="block text-[12px] font-medium text-[var(--color-text-secondary)] sm:col-span-2">
            Client
            <select
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-[13px]"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Select client</option>
              {clientsInOrg.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.fullName || `Client ${c.id}`}
                </option>
              ))}
            </select>
            {clientsInOrg.length === 0 && orgId ? (
              <input
                type="number"
                min={1}
                className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-[13px]"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Client ID if not listed"
              />
            ) : null}
          </label>
        ) : null}

        <label className="block text-[12px] font-medium text-[var(--color-text-secondary)] sm:col-span-2">
          Note (optional)
          <textarea
            rows={2}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-[13px]"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Why you need this access"
          />
        </label>
      </div>

      {err ? <p className="mt-2 text-[12px] text-[var(--red)]">{err}</p> : null}
      {msg ? (
        <p className="mt-2 flex items-center gap-1 text-[12px] text-[var(--color-success)]">
          <CheckCircle2 size={14} /> {msg}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        <Send size={15} />
        {busy ? "Sending…" : "Send request"}
      </button>

      {requests.filter((r) => r.status !== "pending").length > 0 ? (
        <div className="mt-4 border-t border-[var(--color-border-subtle)] pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            Recent decisions
          </p>
          <ul className="mt-2 space-y-1.5">
            {requests
              .filter((r) => r.status !== "pending")
              .slice(0, 5)
              .map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)]"
                >
                  {r.status === "approved" ? (
                    <CheckCircle2 size={14} className="text-[var(--color-success)]" />
                  ) : (
                    <XCircle size={14} className="text-[var(--color-danger)]" />
                  )}
                  {r.status}: {r.liveTeamName ?? `Org ${r.signalingOrgId}`}
                  {r.declineReason ? ` — ${r.declineReason}` : ""}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
