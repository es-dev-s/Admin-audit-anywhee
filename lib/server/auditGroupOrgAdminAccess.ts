import { supabase } from "@/lib/supabaseClient";

export type OrgAdminGroupScope = {
  hasGroupScope: boolean;
  signalClientIds: number[];
  signalOrgIds: number[];
};

export async function getOrgAdminAuditGroupScope(
  signalingAdminId: number
): Promise<OrgAdminGroupScope> {
  const empty: OrgAdminGroupScope = {
    hasGroupScope: false,
    signalClientIds: [],
    signalOrgIds: [],
  };

  if (!Number.isFinite(signalingAdminId) || signalingAdminId <= 0) return empty;

  const { data: memberRows, error: mErr } = await supabase
    .from("admin_audit_group_org_admins")
    .select("group_id")
    .eq("signaling_admin_id", signalingAdminId);

  if (mErr) {
    console.error("[auditGroupOrgAdminAccess] members:", mErr.message);
    return empty;
  }

  const groupIds = (memberRows ?? []).map((r) => r.group_id as string);
  if (groupIds.length === 0) return empty;

  const { data: clients, error: cErr } = await supabase
    .from("admin_audit_group_clients")
    .select("signal_client_id, signal_org_id")
    .in("group_id", groupIds);

  if (cErr) {
    console.error("[auditGroupOrgAdminAccess] clients:", cErr.message);
    return { hasGroupScope: true, signalClientIds: [], signalOrgIds: [] };
  }

  const signalClientIds = [
    ...new Set(
      (clients ?? [])
        .map((c) => Number(c.signal_client_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];
  const signalOrgIds = [
    ...new Set(
      (clients ?? [])
        .map((c) => Number(c.signal_org_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];

  return { hasGroupScope: true, signalClientIds, signalOrgIds };
}

export async function orgAdminHasAuditGroupClientAccess(params: {
  signalingAdminId: number;
  signalClientId: number;
}): Promise<boolean> {
  const scope = await getOrgAdminAuditGroupScope(params.signalingAdminId);
  if (!scope.hasGroupScope) return true;
  return scope.signalClientIds.includes(params.signalClientId);
}
