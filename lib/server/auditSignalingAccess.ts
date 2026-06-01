import { supabase } from "@/lib/supabaseClient";
import { getAccessGrant } from "@/lib/server/authHelpers";
import { isTeamLeadOrgApproved } from "@/lib/server/teamLeadOrgAccess";

function idMatches(ids: string[], value: number): boolean {
  const key = String(value);
  return ids.some((t) => String(t) === key);
}

export type AuditSignalingAccessResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * Same rules as `/api/audit/signaling-stream-auth`: who may view signaling data for org + client.
 */
export async function assertAuditSignalingClientAccess(params: {
  userId: string;
  role: string;
  signalOrgId: number;
  signalClientId: number;
}): Promise<AuditSignalingAccessResult> {
  const { userId, role, signalOrgId, signalClientId } = params;
  if (
    !Number.isFinite(signalOrgId) ||
    signalOrgId <= 0 ||
    !Number.isFinite(signalClientId) ||
    signalClientId <= 0
  ) {
    return { ok: false, status: 400, message: "Invalid org or client id" };
  }

  if (role === "team_lead") {
    const allowed = await isTeamLeadOrgApproved(userId, signalOrgId);
    if (!allowed) {
      return {
        ok: false,
        status: 403,
        message: "Super-admin approval is required before viewing this organization",
      };
    }
    return { ok: true };
  }

  if (role !== "audit_member") {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  const grant = await getAccessGrant(userId);
  if (!grant) return { ok: false, status: 403, message: "No access grant found" };

  if (grant.signal_client_ids.includes(String(signalClientId))) {
    return { ok: true };
  }

  const teamWide =
    idMatches(grant.team_ids, signalOrgId) || idMatches(grant.signaling_org_ids, signalOrgId);

  if (teamWide) {
    return { ok: true };
  }

  if (grant.member_ids.length === 0) {
    return { ok: false, status: 403, message: "Organization not in your access scope" };
  }

  const { data: rows, error } = await supabase
    .from("users")
    .select("org_id")
    .in("id", grant.member_ids);

  if (error) {
    console.error("[auditSignalingAccess] DB error:", error.message);
    return { ok: false, status: 500, message: "Internal server error" };
  }

  const allowedOrgs = new Set((rows ?? []).map((r) => String(r.org_id)));
  if (allowedOrgs.has(String(signalOrgId))) {
    return { ok: true };
  }

  return { ok: false, status: 403, message: "Organization not in your access scope" };
}
