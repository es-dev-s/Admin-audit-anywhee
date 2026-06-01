import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, getAccessGrant, ok, err } from "@/lib/server/authHelpers";

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);

    if (authUser.role === "team_lead") {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, created_at")
        .order("name");

      if (error) {
        console.error("[teams] DB error:", error.message);
        return err("Internal server error", 500);
      }

      const { data: accessRows, error: aErr } = await supabase
        .from("team_lead_org_access")
        .select("signaling_org_id, status")
        .eq("team_lead_id", authUser.id);

      if (aErr) {
        console.error("[teams/access]", aErr.message);
        return err("Internal server error", 500);
      }

      const statusByOrg = new Map<string, string>();
      for (const r of accessRows ?? []) {
        statusByOrg.set(String(r.signaling_org_id), String(r.status));
      }

      const teams = (data ?? []).map((t) => ({
        ...t,
        accessStatus: statusByOrg.get(String(t.id)) ?? "none",
      }));

      return ok({ teams });
    }

    const grant = await getAccessGrant(authUser.id);
    if (!grant) {
      return ok({ teams: [] });
    }

    const orgIdCandidates = new Set<string>();
    for (const t of grant.team_ids) orgIdCandidates.add(String(t));
    for (const t of grant.signaling_org_ids) orgIdCandidates.add(String(t));
    if (grant.member_ids.length > 0) {
      const { data: rows, error: uErr } = await supabase
        .from("users")
        .select("org_id")
        .in("id", grant.member_ids);
      if (uErr) {
        console.error("[teams/am] org lookup:", uErr.message);
        return err("Internal server error", 500);
      }
      for (const r of rows ?? []) {
        if (r.org_id != null) orgIdCandidates.add(String(r.org_id));
      }
    }

    if (orgIdCandidates.size === 0) {
      return ok({ teams: [] });
    }

    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, created_at")
      .in("id", [...orgIdCandidates])
      .order("name");

    if (error) {
      console.error("[teams/am] DB error:", error.message);
      return err("Internal server error", 500);
    }

    return ok({ teams: data });
  } catch (e) {
    console.error("[teams] Unhandled:", e);
    return err("Internal server error", 500);
  }
}
