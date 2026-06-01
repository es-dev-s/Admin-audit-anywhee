"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CustomSelect } from "@/components/ui/Select";
import {
  apiAccessShare,
  apiAccessRevoke,
  apiListAuditMembers,
  apiListAuditOrganizations,
} from "@/lib/authClient";
import { resolveOrganizationIdFromTeams } from "@/lib/resolveSupabaseOrg";

const EMAIL_DOMAIN = "@entegrasources.com.np";

type RecipientTab = "organization" | "member" | "email";

export type ShareAccessModalProps = {
  open: boolean;
  onClose: () => void;
  shareScope: "team" | "member";
  signalingOrgId: number;
  orgName: string;
  signalClientId?: number;
  memberLabel?: string;
  organizationId?: string | null;
  memberUserId?: string | null;
  onSuccess?: () => void;
};

const tabBtn = (active: boolean) =>
  `rounded-lg border px-3 py-2 text-xs font-medium transition-colors duration-100 ${
    active
      ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm"
      : "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-gray-50 hover:text-[var(--text-primary)]"
  }`;

const inputClass =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/10";

export function ShareAccessModal({
  open, onClose, shareScope, signalingOrgId, orgName, signalClientId, memberLabel,
  organizationId: organizationIdProp, memberUserId, onSuccess,
}: ShareAccessModalProps) {
  const [tab, setTab] = useState<RecipientTab>("organization");
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [members, setMembers] = useState<Array<{ id: string; name: string; email: string; auditOrgName: string | null }>>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");

  useEffect(() => {
    if (!open) {
      setTab("organization"); setSelectedOrgId(""); setSelectedMemberId(""); setEmail("");
      setError(null); setDone(false); setDoneMsg(""); setLoading(false); setLoadErr(null);
      return;
    }
    let cancelled = false;
    setLoadErr(null);
    Promise.all([apiListAuditOrganizations(), apiListAuditMembers()])
      .then(([o, m]) => {
        if (cancelled) return;
        setOrgs(o.organizations ?? []);
        setMembers(m.members ?? []);
        if ((o.organizations?.length ?? 0) === 0 && (m.members?.length ?? 0) > 0) setTab("member");
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Failed to load directory");
      });
    return () => { cancelled = true; };
  }, [open]);

  const orgOptions = useMemo(
    () => [
      { value: "", label: "Select organization…" },
      ...orgs.map((o) => ({ value: o.id, label: o.name })),
    ],
    [orgs],
  );

  const memberOptions = useMemo(
    () => [
      { value: "", label: "Select member…" },
      ...members.map((m) => ({
        value: m.id,
        label: `${m.name} (${m.email})${m.auditOrgName ? ` · ${m.auditOrgName}` : ""}`,
      })),
    ],
    [members],
  );

  const performAccessAction = async (action: "share" | "revoke") => {
    setError(null);

    let organizationId = organizationIdProp ?? null;
    if (shareScope === "team" && !organizationId) {
      organizationId = await resolveOrganizationIdFromTeams(orgName, signalingOrgId);
    }

    setLoading(true);
    try {
      const runAccessAction =
        action === "share" ? apiAccessShare : apiAccessRevoke;
      if (tab === "organization") {
        if (!selectedOrgId) { setError("Select an audit organization."); setLoading(false); return; }
        const targetAuditOrgName = orgs.find((o) => o.id === selectedOrgId)?.name ?? null;
        const res = await runAccessAction({
          recipientMode: "audit_organization",
          shareScope,
          signalingOrgId,
          organizationId,
          signalClientId: shareScope === "member" ? signalClientId ?? undefined : undefined,
          memberUserId: memberUserId ?? undefined,
          auditOrganizationId: selectedOrgId,
          liveTeamName: orgName,
          liveMemberName: memberLabel ?? null,
          targetAuditOrgName,
        });
        setDoneMsg(
          res.recipientCount === 0
            ? (res.message ?? "No members in that organization yet.")
            : action === "share"
              ? `Shared with ${res.recipientCount} member(s).`
              : `Revoked access for ${res.recipientCount} member(s).`
        );
        setDone(true); onSuccess?.(); return;
      }
      if (tab === "member") {
        if (!selectedMemberId) { setError("Select an audit member."); setLoading(false); return; }
        const sel = members.find((m) => m.id === selectedMemberId);
        await runAccessAction({
          recipientMode: "audit_member",
          shareScope,
          signalingOrgId,
          organizationId,
          signalClientId: shareScope === "member" ? signalClientId ?? undefined : undefined,
          memberUserId: memberUserId ?? undefined,
          targetUserId: selectedMemberId,
          liveTeamName: orgName,
          liveMemberName: memberLabel ?? null,
          targetAuditOrgName: sel?.auditOrgName ?? null,
        });
        setDoneMsg(
          action === "share"
            ? "Access shared with the selected member."
            : "Access revoked from the selected member."
        );
        setDone(true); onSuccess?.(); return;
      }
      const normalized = email.trim().toLowerCase();
      if (!normalized || !normalized.endsWith(EMAIL_DOMAIN)) { setError(`Use a company email (${EMAIL_DOMAIN}).`); setLoading(false); return; }
      await runAccessAction({
        recipientMode: "email",
        email: normalized,
        shareScope,
        signalingOrgId,
        organizationId,
        signalClientId: shareScope === "member" ? signalClientId ?? undefined : undefined,
        memberUserId: memberUserId ?? undefined,
        liveTeamName: orgName,
        liveMemberName: memberLabel ?? null,
      });
      setDoneMsg(
        action === "share"
          ? "Access shared for that email."
          : "Access revoked for that email."
      );
      setDone(true); onSuccess?.();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : action === "share"
            ? "Share failed"
            : "Revoke failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const titleId = "share-access-title";

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-lg)] bg-[var(--color-accent)] text-white">
            <UserPlus size={16} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">
              Share access
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
              {shareScope === "team" ? `Live team: ${orgName}` : `Live member: ${memberLabel ?? `Client ${signalClientId ?? ""}`}`}
            </p>
          </div>
        </div>

        {loadErr ? <p className="text-[12px] text-[var(--color-warning)]">{loadErr}</p> : null}

        {done ? (
          <>
            <p className="text-[12px] font-medium text-[var(--color-success)]">
              {doneMsg} They can refresh to load the new scope.
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="h-8 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 text-[12px] font-semibold text-white hover:bg-[var(--color-accent-hover)]">
                Done
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void performAccessAction("share");
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <p className="mb-2 text-[11px] font-semibold text-[var(--color-text-secondary)]">Share with</p>
              <div className="flex flex-wrap gap-1.5">
                {([["organization", "Organization"], ["member", "Member"], ["email", "Email"]] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setTab(key)} className={tabBtn(tab === key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {tab === "organization" && (
              <div className="flex flex-col gap-1.5">
                <label id="share-org-label" htmlFor="share-org-select" className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  Organization
                </label>
                <CustomSelect
                  id="share-org-select"
                  aria-labelledby="share-org-label"
                  value={selectedOrgId}
                  onValueChange={setSelectedOrgId}
                  options={orgOptions}
                  placeholder="Select organization…"
                  disabled={orgs.length === 0}
                />
                {orgs.length === 0 && <p className="text-[11px] text-[var(--text-tertiary)]">No organizations yet.</p>}
              </div>
            )}

            {tab === "member" && (
              <div className="flex flex-col gap-1.5">
                <label id="share-member-label" htmlFor="share-member-select" className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  Member
                </label>
                <CustomSelect
                  id="share-member-select"
                  aria-labelledby="share-member-label"
                  value={selectedMemberId}
                  onValueChange={setSelectedMemberId}
                  options={memberOptions}
                  placeholder="Select member…"
                  disabled={members.length === 0}
                />
                {members.length === 0 && <p className="text-[11px] text-[var(--text-tertiary)]">No audit members yet.</p>}
              </div>
            )}

            {tab === "email" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="share-email" className="text-[11px] font-semibold text-[var(--color-text-secondary)]">Email</label>
                <input id="share-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`name${EMAIL_DOMAIN}`} className={inputClass} />
              </div>
            )}

            {error && <p className="text-[12px] font-medium text-[var(--color-danger)]">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="h-8 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void performAccessAction("revoke")}
                className="h-8 rounded-[var(--radius-md)] border border-[var(--color-danger)]/35 bg-[var(--color-danger-muted)] px-4 text-[12px] font-semibold text-[var(--color-danger)] hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Working…" : "Revoke"}
              </button>
              <button type="submit" disabled={loading} className="h-8 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 text-[12px] font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
                {loading ? "Sharing…" : "Share"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
