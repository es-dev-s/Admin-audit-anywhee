import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, getAccessGrant, ok, err } from "@/lib/server/authHelpers";
import { isTeamLeadOrgApproved } from "@/lib/server/teamLeadOrgAccess";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);

    const { id: teamId } = await params;
    const orgNum = Number(teamId);

    if (authUser.role === "team_lead") {
      if (!Number.isFinite(orgNum) || orgNum <= 0) {
        return err("Invalid team id", 400);
      }
      const allowed = await isTeamLeadOrgApproved(authUser.id, orgNum);
      if (!allowed) {
        return err(
          "Super-admin approval is required before viewing this team's directory",
          403
        );
      }

      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, role, created_at")
        .eq("org_id", teamId)
        .order("name");

      if (error) {
        console.error("[teams/members/tl] DB error:", error.message);
        return err("Internal server error", 500);
      }

      return ok({ members: data });
    }

    const grant = await getAccessGrant(authUser.id);
    if (!grant) return err("No access grant found", 403);

    const tid = String(teamId);
    const teamWide =
      grant.team_ids.some((x) => String(x) === tid) ||
      grant.signaling_org_ids.some((x) => String(x) === tid);

    if (teamWide) {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, role, created_at")
        .eq("org_id", teamId)
        .order("name");

      if (error) {
        console.error("[teams/members/am/team] DB error:", error.message);
        return err("Internal server error", 500);
      }
      return ok({ members: data });
    }

    if (grant.member_ids.length > 0) {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, role, created_at")
        .eq("org_id", teamId)
        .in("id", grant.member_ids)
        .order("name");

      if (error) {
        console.error("[teams/members/am/member] DB error:", error.message);
        return err("Internal server error", 500);
      }
      return ok({ members: data });
    }

    return err("Team not in your access scope", 403);
  } catch (e) {
    console.error("[teams/members] Unhandled:", e);
    return err("Internal server error", 500);
  }
}
