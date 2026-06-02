"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { UserPlus, User } from "lucide-react";
import { AnimatedPage } from "@/components/ui/AnimatedPage";
import { useAuth } from "@/context/auth-context";
import {
  apiCreateAuditMember,
  apiListAuditMembers,
  apiListAuditOrganizations,
  apiPatchAuditMember,
} from "@/lib/authClient";
import { useSearchParams } from "next/navigation";
import { useUIStore } from "@/store/uiStore";
import { CustomSelect } from "@/components/ui/Select";

const EMAIL_DOMAIN = "@entegrasources.com.np";

type OrgRow = { id: string; name: string; created_at: string };
type MemberRow = {
  id: string;
  name: string;
  email: string;
  auditOrgId: string | null;
  auditOrgName: string | null;
};

const inputClass =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-3 text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/12 focus:shadow-[0_0_0_3px_var(--color-focus-ring)]";

export default function AuditMembersPage() {
  const { state } = useAuth();
  const searchParams = useSearchParams();
  const preselectOrgId = searchParams.get("orgId") || "";

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);



  const [mName, setMName] = useState("");
  const [mEmail, setMEmail] = useState("");
  const [mPass, setMPass] = useState("");
  const [mConfirm, setMConfirm] = useState("");
  const [mOrgId, setMOrgId] = useState(preselectOrgId);
  const [mBusy, setMBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  const [createMode, setCreateMode] = useState<"member" | null>(null);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [o, m] = await Promise.all([
        apiListAuditOrganizations(),
        apiListAuditMembers(),
      ]);
      setOrgs(o.organizations ?? []);
      setMembers(
        (m.members ?? []).map((x) => ({
          id: x.id,
          name: x.name,
          email: x.email,
          auditOrgId: x.auditOrgId,
          auditOrgName: x.auditOrgName,
        }))
      );
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  const canManageMembers =
    state.status === "authenticated" && state.user.role === "team_lead";

  useEffect(() => {
    if (!canManageMembers) return;
    void refresh();
  }, [canManageMembers, refresh]);

  useEffect(() => {
    useUIStore.getState().setHeader("Members", "Create and assign login accounts to existing Audit Organizations");
    return () => useUIStore.getState().setHeader("", "");
  }, []);

  if (state.status === "loading") {
    return (
      <AnimatedPage>
        <div className="flex min-h-[40dvh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]" />
        </div>
      </AnimatedPage>
    );
  }

  if (state.status !== "authenticated" || state.user.role !== "team_lead") {
    return (
      <AnimatedPage>
        <p className="p-8 text-[13px] text-[var(--color-text-muted)]">Only team leads can manage members.</p>
      </AnimatedPage>
    );
  }

  const createMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    setFormMsg(null);
    setMBusy(true);
    try {
      const r = await apiCreateAuditMember({
        name: mName.trim(),
        email: mEmail.trim().toLowerCase(),
        password: mPass,
        confirmPassword: mConfirm,
        auditOrgId: mOrgId || null,
      });
      setFormMsg(r.message);
      setMName(""); setMEmail(""); setMPass(""); setMConfirm(""); setMOrgId("");
      await refresh();
      setTimeout(() => setCreateMode(null), 1000);
    } catch (err: unknown) {
      setFormErr(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setMBusy(false);
    }
  };

  const assignOrg = async (memberId: string, auditOrgId: string) => {
    try {
      await apiPatchAuditMember(memberId, {
        auditOrgId: auditOrgId === "" ? null : auditOrgId,
      });
      await refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const orgSelectOptions = useMemo(
    () => [
      { value: "", label: "— Unassigned —" },
      ...orgs.map((o) => ({ value: o.id, label: o.name })),
    ],
    [orgs],
  );

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.auditOrgName ?? "").toLowerCase().includes(q)
    );
  }, [members, search]);

  return (
    <AnimatedPage>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
              Directory
            </p>
            <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)]">
              Audit Member Accounts
            </h1>
            <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
              {members.length} total members · {members.filter((m) => !!m.auditOrgId).length} assigned
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members"
              className="ui-input min-w-[240px]"
            />
            <button
              onClick={() => setCreateMode("member")}
              className="ui-btn ui-btn--primary"
            >
              <UserPlus size={14} /> Add Member
            </button>
          </div>
        </div>

        {loadError ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/20 bg-[var(--color-danger-muted)] p-3 text-[12px] text-[var(--color-danger)]">{loadError}</div>
        ) : null}

        {/* Create Member form */}
        {createMode === "member" && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 shadow-[var(--shadow-sm)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <UserPlus size={14} className="text-[var(--color-text-muted)]" /> Create Login Member
              </h3>
              <button
                type="button"
                onClick={() => setCreateMode(null)}
                className="rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-muted)] transition-colors duration-200 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
              >
                Cancel
              </button>
            </div>
            <form onSubmit={createMember} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[11px] font-semibold text-[var(--color-text-secondary)]">Full Name</label>
                <input required autoFocus value={mName} onChange={(e) => setMName(e.target.value)} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[11px] font-semibold text-[var(--color-text-secondary)]">Email <span className="text-[var(--color-text-muted)] font-normal ml-1">({EMAIL_DOMAIN})</span></label>
                <input required type="email" value={mEmail} onChange={(e) => setMEmail(e.target.value)} placeholder={`username${EMAIL_DOMAIN}`} className={inputClass} />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold text-[var(--color-text-secondary)]">Password</label>
                <input required type="password" minLength={8} value={mPass} onChange={(e) => setMPass(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold text-[var(--color-text-secondary)]">Confirm Password</label>
                <input required type="password" minLength={8} value={mConfirm} onChange={(e) => setMConfirm(e.target.value)} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label id="create-member-org-label" className="mb-1.5 block text-[11px] font-semibold text-[var(--color-text-secondary)]">
                  Assign to Organization (Optional)
                </label>
                <CustomSelect
                  id="create-member-org"
                  aria-labelledby="create-member-org-label"
                  value={mOrgId}
                  onValueChange={setMOrgId}
                  options={orgSelectOptions}
                  placeholder="— Unassigned —"
                />
              </div>

              {formErr ? <p className="sm:col-span-2 text-[12px] text-[var(--color-danger)] font-medium">{formErr}</p> : null}
              {formMsg ? <p className="sm:col-span-2 text-[12px] text-[var(--color-success)] font-medium">{formMsg}</p> : null}

              <div className="sm:col-span-2 pt-2 border-t border-[var(--color-border)] flex justify-end">
                <button type="submit" disabled={mBusy} className="h-8 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-5 text-[12px] font-semibold text-[var(--color-text-inverse)] transition-all duration-200 hover:bg-[var(--color-accent-hover)] disabled:opacity-50 active:enabled:scale-[0.98]">
                  {mBusy ? "Creating…" : "Create Member"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Flat View */}
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)]">
            {filteredMembers.length === 0 ? (
              <div className="py-16 px-6 text-center text-[12px] text-[var(--color-text-muted)] flex flex-col items-center justify-center">
                 <User size={24} className="mb-3 opacity-30" />
                 <span className="font-medium text-[var(--color-text-primary)] text-[14px]">No Members</span>
                 <p className="mt-1">Add team members to your directory.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {filteredMembers.map(m => (
                  <div key={m.id} className="ui-row-hover flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[var(--color-bg-surface-2)] to-[var(--color-bg-input)] border border-[var(--color-border-subtle)] shrink-0 shadow-[var(--shadow-xs)]">
                        <User size={18} className="text-[var(--color-text-secondary)]" strokeWidth={1.75} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[14px] font-semibold text-[var(--color-text-primary)] leading-tight flex items-center gap-2">
                          {m.name}
                          {m.auditOrgName ? (
                            <span className="rounded-full bg-[var(--color-border)]/50 px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)] tracking-wide">
                              {m.auditOrgName}
                            </span>
                          ) : (
                            <span className="rounded-full border border-dashed border-[var(--color-border-strong)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)] tracking-wide">
                              Unassigned
                            </span>
                          )}
                        </span>
                        <span className="text-[12px] text-[var(--color-text-muted)] font-mono mt-0.5">{m.email}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center sm:w-[200px]">
                      <CustomSelect
                        size="sm"
                        aria-label={`Assign organization for ${m.name}`}
                        value={m.auditOrgId ?? ""}
                        onValueChange={(v) => void assignOrg(m.id, v)}
                        options={orgSelectOptions}
                        placeholder="— Unassigned —"
                        className="w-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {orgs.length === 0 && members.length === 0 && (
            <div className="py-20 text-center flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/80">
              <UserPlus size={28} className="text-[var(--color-text-muted)] mb-3 opacity-30" />
              <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)] mb-1">No Members found</h3>
              <p className="text-[12px] text-[var(--color-text-muted)] max-w-sm mb-4">
                Start by creating login accounts for your team members.
              </p>
              <button
                onClick={() => setCreateMode("member")}
                className="h-8 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 text-[12px] font-semibold text-[var(--color-text-inverse)] transition-all duration-200 hover:bg-[var(--color-accent-hover)] active:scale-[0.98]"
              >
                Add Member
              </button>
            </div>
          )}
        </div>
      </div>
    </AnimatedPage>
  );
}
