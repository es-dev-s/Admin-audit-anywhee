import { supabase } from "@/lib/supabaseClient";
import { getAccessGrant } from "@/lib/server/authHelpers";

function idMatches(ids: string[], value: number): boolean {
  const key = String(value);
  return ids.some((t) => String(t) === key);
}

export type AuditSignalingAccessResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * Server-side gate: can this user view a specific signaling org+client?
 *
 * For team_lead: checks admin_audit_group_members → admin_audit_group_clients
 *   (admin-assigned groups). Falls back to old team_lead_org_access if no
 *   groups are assigned yet (backward compat).
 *
 * For audit_member: checks access_grants (unchanged).
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

  // ── Team lead ────────────────────────────────────────────────────────────
  if (role === "team_lead") {
    // 1. Check admin-assigned groups first.
    // Fetch team lead's group ids first, then check if client is in any of them.
    const { data: memberRows, error: mErr } = await supabase
      .from("admin_audit_group_members")
      .select("group_id")
      .eq("team_lead_id", userId);

    if (mErr) {
      console.error("[auditSignalingAccess] member group lookup error", mErr.message);
      return { ok: false, status: 500, message: "Internal server error" };
    }

    const groupIds = (memberRows ?? []).map((r) => r.group_id as string);

    let groupRow: { signal_client_id: number } | null = null;

    if (groupIds.length > 0) {
      const { data, error } = await supabase
        .from("admin_audit_group_clients")
        .select("signal_client_id")
        .eq("signal_client_id", signalClientId)
        .in("group_id", groupIds)
        .maybeSingle();
      if (error) {
        console.error("[auditSignalingAccess] group client lookup error", error.message);
        return { ok: false, status: 500, message: "Internal server error" };
      }
      groupRow = data as { signal_client_id: number } | null;
    }

    if (groupRow) return { ok: true };

    // 2. Backward-compat: fall back to old team_lead_org_access approved status.
    const { data: accessRow } = await supabase
      .from("team_lead_org_access")
      .select("status")
      .eq("team_lead_id", userId)
      .eq("signaling_org_id", signalOrgId)
      .maybeSingle();

    if (accessRow?.status === "approved") return { ok: true };

    return {
      ok: false,
      status: 403,
      message:
        "This client is not in any group assigned to you. Ask your admin to grant access.",
    };
  }

  // ── Audit member ──────────────────────────────────────────────────────────
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

  if (teamWide) return { ok: true };

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
  if (allowedOrgs.has(String(signalOrgId))) return { ok: true };

  return { ok: false, status: 403, message: "Organization not in your access scope" };
}
