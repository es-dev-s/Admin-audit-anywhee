"use client";

import { useMemo, useState, useEffect } from "react";
import { RefreshCw, WifiOff, Search, Users } from "lucide-react";
import { AnimatedPage } from "@/components/ui/AnimatedPage";
import { useAuditSignaling } from "@/context/audit-signaling-context";
import { useAuth } from "@/context/auth-context";
import { useUIStore } from "@/store/uiStore";
import { MemberAccessRequestPanel } from "@/components/audit/MemberAccessRequestPanel";
import { AuditMemberCard } from "@/components/audit/AuditMemberCard";
import { isClientStreamable } from "@/lib/auditClientStatus";

export default function AuditPage() {
  const [query, setQuery] = useState("");
  const { state: authState } = useAuth();
  const { clients, connectionStatus, assignedGroups } = useAuditSignaling();

  const isTeamLead =
    authState.status === "authenticated" && authState.user.role === "team_lead";
  const isAuditMember =
    authState.status === "authenticated" && authState.user.role === "audit_member";

  const hasAssignedGroups = assignedGroups.length > 0;

  const clientById = useMemo(() => {
    const m = new Map<number, (typeof clients)[0]>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const groupSections = useMemo(() => {
    if (hasAssignedGroups) {
      return assignedGroups.map((g) => {
        const members = g.signalClientIds
          .map((id) => clientById.get(id))
          .filter((c): c is NonNullable<typeof c> => c != null)
          .filter((c) => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            const org = (c.claimedOrgName || c.orgName || "").toLowerCase();
            return c.fullName.toLowerCase().includes(q) || org.includes(q);
          });
        return { group: g, members };
      });
    }
    const q = query.trim().toLowerCase();
    const members = [...clients]
      .filter((c) => {
        if (!q) return true;
        const org = (c.claimedOrgName || c.orgName || "").toLowerCase();
        return c.fullName.toLowerCase().includes(q) || org.includes(q);
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    if (members.length === 0) return [];
    return [
      {
        group: {
          id: "scope",
          name: isAuditMember ? "Assigned members" : "Members",
          description: null as string | null,
          signalClientIds: members.map((c) => c.id),
        },
        members,
      },
    ];
  }, [hasAssignedGroups, assignedGroups, clientById, clients, query, isAuditMember]);

  const statTotals = useMemo(() => {
    let members = 0;
    let online = 0;
    let live = 0;
    for (const { members: list } of groupSections) {
      for (const c of list) {
        members += 1;
        if (isClientStreamable(c.status)) online += 1;
        if (c.status === "sharing") live += 1;
      }
    }
    return { groups: groupSections.length, members, online, live };
  }, [groupSections]);

  const primaryGroupName =
    groupSections.length === 1 ? groupSections[0].group.name : null;

  const assignedGroupNamesLine = hasAssignedGroups
    ? assignedGroups.map((g) => g.name).join(" · ")
    : null;

  useEffect(() => {
    const subtitle = primaryGroupName
      ? `${statTotals.members} audit member${statTotals.members === 1 ? "" : "s"} in this group`
      : hasAssignedGroups
        ? `${statTotals.members} audit member${statTotals.members === 1 ? "" : "s"} across ${statTotals.groups} groups`
        : `${statTotals.groups} group${statTotals.groups === 1 ? "" : "s"} · ${statTotals.members} members`;
    useUIStore.getState().setHeader("Dashboard", subtitle);
    return () => useUIStore.getState().setHeader("", "");
  }, [primaryGroupName, hasAssignedGroups, statTotals]);

  const showErrorEmpty =
    groupSections.every((s) => s.members.length === 0) &&
    (connectionStatus.includes("Missing") || connectionStatus.includes("credentials"));

  const noGroupsAssigned = isTeamLead && !hasAssignedGroups && clients.length === 0;

  return (
    <AnimatedPage>
      <div className="flex w-full flex-col gap-8">
        {isAuditMember ? <MemberAccessRequestPanel /> : null}

        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--color-border-subtle)] pb-8">
          <div className="min-w-0 flex-1">
            {primaryGroupName ? (
              <>
                <p className="audit-group-eyebrow mb-2 text-[11px] font-semibold uppercase tracking-[0.1em]">
                  Audit group
                </p>
                <h1 className="audit-group-hero-title text-[36px] font-semibold leading-[1.1]">
                  {primaryGroupName}
                </h1>
                <p className="mt-2 flex items-center gap-2 text-[14px] text-[var(--color-text-secondary)]">
                  <Users size={15} className="shrink-0 text-[var(--color-accent)]" strokeWidth={2} />
                  <span>
                    {statTotals.members} audit member{statTotals.members === 1 ? "" : "s"} in this
                    group
                    {statTotals.online > 0
                      ? ` · ${statTotals.online} online`
                      : ""}
                  </span>
                </p>
              </>
            ) : assignedGroupNamesLine ? (
              <>
                <p className="audit-group-eyebrow mb-2 text-[11px] font-semibold uppercase tracking-[0.1em]">
                  Assigned audit groups
                </p>
                <h1 className="audit-group-hero-title text-[30px] font-semibold leading-[1.15]">
                  {assignedGroupNamesLine}
                </h1>
                <p className="mt-2 flex items-center gap-2 text-[14px] text-[var(--color-text-secondary)]">
                  <Users size={15} className="shrink-0 text-[var(--color-accent)]" strokeWidth={2} />
                  <span>
                    {statTotals.members} audit member{statTotals.members === 1 ? "" : "s"} across{" "}
                    {assignedGroups.length} group{assignedGroups.length === 1 ? "" : "s"}
                    {statTotals.online > 0 ? ` · ${statTotals.online} online` : ""}
                  </span>
                </p>
              </>
            ) : (
              <>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]">
                  Audit workspace
                </p>
                <h1 className="text-[28px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                  Dashboard
                </h1>
                <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">
                  {statTotals.members} member{statTotals.members === 1 ? "" : "s"}
                  {statTotals.online > 0 ? ` · ${statTotals.online} online` : ""}
                </p>
              </>
            )}
          </div>

          <div className="ui-toolbar shrink-0">
            <label className="ui-search-field">
              <Search size={15} className="ui-search-field__icon" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members"
                className="ui-search-field__input"
                aria-label="Search members"
              />
            </label>
            <button
              type="button"
              className="ui-btn ui-btn--icon"
              onClick={() => window.location.reload()}
              aria-label="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </header>

        {noGroupsAssigned ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-6 py-14 text-center">
            <p className="text-[15px] font-semibold text-[var(--color-text-primary)]">
              No audit groups assigned
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-[var(--color-text-tertiary)]">
              Your administrator has not assigned any audit groups yet. You will only see members
              inside groups assigned to you.
            </p>
          </div>
        ) : null}

        {showErrorEmpty ? (
          <div className="flex flex-col items-center rounded-2xl border border-[var(--color-border-subtle)] py-16 text-center">
            <WifiOff size={28} className="mb-3 text-[var(--color-text-tertiary)] opacity-40" />
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Unable to load roster</p>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
              Configure signaling credentials to connect.
            </p>
          </div>
        ) : (
          groupSections.map(({ group, members }) => (
            <section
              key={group.id}
              className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 shadow-[var(--shadow-xs)] sm:p-6"
            >
              {groupSections.length > 1 || !primaryGroupName ? (
                <div className="mb-5 border-b border-[var(--color-border-subtle)] pb-4">
                  <h2 className="audit-group-section-title text-[24px]">
                    {group.name}
                  </h2>
                  {group.description ? (
                    <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">{group.description}</p>
                  ) : null}
                  <p className="mt-2 flex items-center gap-2 text-[13px] font-medium text-[var(--color-text-secondary)]">
                    <Users size={14} className="text-[var(--color-accent)]" strokeWidth={2} />
                    {members.length} audit member{members.length === 1 ? "" : "s"} in this group
                  </p>
                </div>
              ) : null}

              {members.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-[var(--color-text-tertiary)]">
                  No members match your search.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {members.map((c) => (
                    <AuditMemberCard key={c.id} client={c} />
                  ))}
                </div>
              )}
            </section>
          ))
        )}

      </div>
    </AnimatedPage>
  );
}
