"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { AnimatedPage } from "@/components/ui/AnimatedPage";
import { useAssignedGroupsScope } from "@/context/audit-signaling-context";
import { useAuth } from "@/context/auth-context";
import {
  apiCreateAuditOrganization,
  apiListAuditOrganizations,
} from "@/lib/authClient";
import Link from "next/link";

type OrgRow = { id: string; name: string; created_at: string };

const inputClass =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-3 text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/12 focus:shadow-[0_0_0_3px_var(--color-focus-ring)]";

export default function AuditOrganizationsPage() {
  const router = useRouter();
  const { state } = useAuth();
  const { ready: scopeReady, hasGroupScope } = useAssignedGroupsScope();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [orgName, setOrgName] = useState("");
  const [orgBusy, setOrgBusy] = useState(false);
  const [createMode, setCreateMode] = useState<boolean>(false);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const o = await apiListAuditOrganizations();
      setOrgs(o.organizations ?? []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  const canManageMembers =
    state.status === "authenticated" && state.user.role === "team_lead";

  useEffect(() => {
    if (scopeReady && hasGroupScope) {
      router.replace("/audit");
    }
  }, [scopeReady, hasGroupScope, router]);

  useEffect(() => {
    if (!canManageMembers || !scopeReady || hasGroupScope) return;
    void refresh();
  }, [canManageMembers, scopeReady, hasGroupScope, refresh]);

  const createOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgBusy(true);
    try {
      await apiCreateAuditOrganization(orgName.trim());
      setCreateMode(false);
      setOrgName("");
      await refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create org");
    } finally {
      setOrgBusy(false);
    }
  };

  if (state.status === "loading") {
    return (
      <AnimatedPage>
        <div className="flex min-h-[40dvh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]" />
        </div>
      </AnimatedPage>
    );
  }
  if (!canManageMembers) {
    return (
      <AnimatedPage>
        <div className="flex flex-col items-center justify-center py-20 text-[var(--color-text-secondary)]">
          <Building2 size={32} className="mb-4 opacity-50" />
          <h2 className="text-[14px] font-semibold">Access Denied</h2>
          <p className="mt-2 text-[12px] opacity-70">
            Only Team Leads can manage audit organizations.
          </p>
        </div>
      </AnimatedPage>
    );
  }

  const filteredOrgs = orgs.filter((o) =>
    o.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <AnimatedPage>
      <div className="flex flex-col gap-6 max-w-[1000px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
              Directory
            </p>
            <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2">
              <Building2 className="text-[var(--color-accent)]" size={20} />
              Organizations
            </h1>
            <p className="mt-1 max-w-xl text-[13px] text-[var(--color-text-muted)]">
              {orgs.length} organizations available for member assignment and access grouping.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search organizations"
              className="ui-input min-w-[220px]"
            />
            <button
              type="button"
              onClick={() => setCreateMode(true)}
              className="ui-btn ui-btn--primary"
            >
              <Building2 size={14} /> Create Organization
            </button>
          </div>
        </div>

        {loadError ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/20 bg-[var(--color-danger-muted)] p-3 text-[12px] text-[var(--color-danger)]">{loadError}</div>
        ) : null}

        {/* Create Org form */}
        {createMode && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5 shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-subtle)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <Building2 size={16} className="text-[var(--color-text-muted)]" /> New Organization
              </h3>
              <button
                type="button"
                onClick={() => setCreateMode(false)}
                className="rounded-[var(--radius-md)] px-2 py-1 text-[12px] font-medium text-[var(--color-text-muted)] transition-colors duration-200 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
              >
                Cancel
              </button>
            </div>
            <form onSubmit={createOrg} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[250px]">
                <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]">Organization Name</label>
                <input autoFocus required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Audit Team Alpha" className={inputClass} />
              </div>
              <button type="submit" disabled={orgBusy || orgName.trim().length < 2} className="h-9 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-5 text-[12px] font-semibold text-[var(--color-text-inverse)] transition-all duration-200 hover:bg-[var(--color-accent-hover)] disabled:opacity-40 active:enabled:scale-[0.98]">
                {orgBusy ? "Saving..." : "Save Org"}
              </button>
            </form>
          </div>
        )}

        {/* View */}
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-border-subtle)]">
            {filteredOrgs.length === 0 ? (
              <div className="py-16 px-6 text-center text-[12px] text-[var(--color-text-muted)] flex flex-col items-center justify-center">
                 <Building2 size={24} className="mb-3 opacity-30" />
                 <span className="font-medium text-[var(--color-text-primary)] text-[14px]">No Organizations</span>
                 <p className="mt-1">Add an organization to structure your audit members.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {filteredOrgs.map(org => (
                  <div key={org.id} className="ui-row-hover flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-4">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] shrink-0 shadow-sm">
                        <Building2 size={18} className="text-[var(--color-text-secondary)]" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[14px] font-semibold text-[var(--color-text-primary)] leading-tight">{org.name}</span>
                        <span className="text-[12px] text-[var(--color-text-muted)] font-mono mt-0.5 uppercase tracking-wide">ID: {org.id.split('-')[0]}</span>
                      </div>
                    </div>
                    <Link
                      href={`/audit/members?orgId=${org.id}`}
                      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-all duration-200 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] active:scale-[0.98]"
                    >
                      Manage Members
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
}
