import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, ok, err } from "@/lib/server/authHelpers";

/**
 * GET /api/audit-groups/my-scope
 *
 * Protected by user-auth middleware (x-user-id / x-user-role headers injected).
 * Returns the merged set of signal_client_ids and signal_org_ids that
 * the authenticated team_lead may access via admin-assigned groups.
 *
 * Called by the audit-dashboard context on login to scope the signaling roster.
 * If the team lead has no groups assigned they see nothing (empty arrays).
 */
export async function GET(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) return err("Unauthorized", 401);
  if (authUser.role !== "team_lead") return err("Forbidden", 403);

  try {
    // All group assignments for this team lead.
    const { data: assignments, error: aErr } = await supabase
      .from("admin_audit_group_members")
      .select("group_id")
      .eq("team_lead_id", authUser.id);

    if (aErr) throw aErr;

    const groupIds = (assignments ?? []).map((r) => r.group_id as string);

    if (groupIds.length === 0) {
      return ok({ signalClientIds: [], signalOrgIds: [], groups: [] });
    }

    // All clients in those groups.
    const { data: clients, error: cErr } = await supabase
      .from("admin_audit_group_clients")
      .select("signal_client_id, signal_org_id, group_id")
      .in("group_id", groupIds);

    if (cErr) throw cErr;

    // Group names for display.
    const { data: groups, error: gErr } = await supabase
      .from("admin_audit_groups")
      .select("id, name, description")
      .in("id", groupIds)
      .order("name");

    if (gErr) throw gErr;

    const signalClientIds = [
      ...new Set((clients ?? []).map((c) => Number(c.signal_client_id))),
    ];
    const signalOrgIds = [
      ...new Set((clients ?? []).map((c) => Number(c.signal_org_id))),
    ];

    // Build per-group client lists for UI display.
    const groupsWithClients = (groups ?? []).map((g) => ({
      id: g.id,
      name: g.name as string,
      description: g.description as string | null,
      signalClientIds: (clients ?? [])
        .filter((c) => c.group_id === g.id)
        .map((c) => Number(c.signal_client_id)),
    }));

    return ok({ signalClientIds, signalOrgIds, groups: groupsWithClients });
  } catch (e) {
    console.error("[audit-groups/my-scope/GET]", e);
    return err("Internal server error", 500);
  }
}
