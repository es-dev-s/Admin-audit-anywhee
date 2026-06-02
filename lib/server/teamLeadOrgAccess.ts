import { supabase } from "@/lib/supabaseClient";

export type TeamLeadOrgAccessStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revoked";

export type TeamLeadGroupScope = {
  hasGroups: boolean;
  groupIds: string[];
  allowedOrgIds: Set<number>;
  allowedClientIds: Set<number>;
};

export async function getTeamLeadOrgAccessRow(
  teamLeadId: string,
  signalingOrgId: number
): Promise<{ status: TeamLeadOrgAccessStatus } | null> {
  const { data, error } = await supabase
    .from("team_lead_org_access")
    .select("status")
    .eq("team_lead_id", teamLeadId)
    .eq("signaling_org_id", signalingOrgId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.status) return null;
  return { status: data.status as TeamLeadOrgAccessStatus };
}

/** Merged admin-assigned group scope (clients + orgs from group_clients and optional group row). */
export async function getTeamLeadGroupScope(
  teamLeadId: string
): Promise<TeamLeadGroupScope> {
  const empty: TeamLeadGroupScope = {
    hasGroups: false,
    groupIds: [],
    allowedOrgIds: new Set(),
    allowedClientIds: new Set(),
  };

  const { data: memberRows, error: mErr } = await supabase
    .from("admin_audit_group_members")
    .select("group_id")
    .eq("team_lead_id", teamLeadId);

  if (mErr) {
    console.error("[teamLeadOrgAccess] group members:", mErr.message);
    return empty;
  }

  const groupIds = (memberRows ?? []).map((r) => r.group_id as string);
  if (groupIds.length === 0) return empty;

  const { data: clients, error: cErr } = await supabase
    .from("admin_audit_group_clients")
    .select("signal_client_id, signal_org_id")
    .in("group_id", groupIds);

  if (cErr) {
    console.error("[teamLeadOrgAccess] group clients:", cErr.message);
    return empty;
  }

  const { data: groups, error: gErr } = await supabase
    .from("admin_audit_groups")
    .select("signaling_org_id")
    .in("id", groupIds);

  if (gErr) {
    console.error("[teamLeadOrgAccess] groups:", gErr.message);
    return empty;
  }

  const allowedOrgIds = new Set<number>();
  const allowedClientIds = new Set<number>();

  for (const c of clients ?? []) {
    const cid = Number(c.signal_client_id);
    const oid = Number(c.signal_org_id);
    if (Number.isFinite(cid) && cid > 0) allowedClientIds.add(cid);
    if (Number.isFinite(oid) && oid > 0) allowedOrgIds.add(oid);
  }

  for (const g of groups ?? []) {
    const oid = Number(g.signaling_org_id);
    if (Number.isFinite(oid) && oid > 0) allowedOrgIds.add(oid);
  }

  return {
    hasGroups: true,
    groupIds,
    allowedOrgIds,
    allowedClientIds,
  };
}

export async function teamLeadHasAuditGroups(teamLeadId: string): Promise<boolean> {
  const scope = await getTeamLeadGroupScope(teamLeadId);
  return scope.hasGroups;
}

/** User-facing message when share/revoke/view is denied for a team lead. */
export async function teamLeadShareDeniedMessage(
  teamLeadId: string
): Promise<string> {
  if (await teamLeadHasAuditGroups(teamLeadId)) {
    return "This team or client is outside your assigned audit groups. Ask your admin to add it to your group.";
  }
  return "Super-admin approval is required for this team before you can share access";
}

/** View roster / org-level checks (team scope). */
export async function isTeamLeadOrgApproved(
  teamLeadId: string,
  signalingOrgId: number
): Promise<boolean> {
  return teamLeadCanGrantLiveAccess(
    teamLeadId,
    signalingOrgId,
    "team",
    null
  );
}

/** Whether a team lead may grant or revoke live access (share API, member request approve). */
export async function teamLeadCanGrantLiveAccess(
  teamLeadId: string,
  signalingOrgId: number,
  shareScope: "team" | "member",
  signalClientId: number | null
): Promise<boolean> {
  const scope = await getTeamLeadGroupScope(teamLeadId);

  if (scope.hasGroups) {
    if (shareScope === "member") {
      const cid = signalClientId != null ? Number(signalClientId) : NaN;
      if (!Number.isFinite(cid) || cid <= 0) return false;
      return scope.allowedClientIds.has(cid);
    }
    return scope.allowedOrgIds.has(signalingOrgId);
  }

  const row = await getTeamLeadOrgAccessRow(teamLeadId, signalingOrgId);
  return row?.status === "approved";
}
