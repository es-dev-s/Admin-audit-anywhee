import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, getAccessGrant, ok, err } from "@/lib/server/authHelpers";
import { isTeamLeadOrgApproved } from "@/lib/server/teamLeadOrgAccess";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);

    const { id: memberId } = await params;

    if (authUser.role === "team_lead") {
      const { data: member, error } = await supabase
        .from("users")
        .select("id, name, email, org_id")
        .eq("id", memberId)
        .maybeSingle();

      if (error) {
        console.error("[members/screen/tl] DB error:", error.message);
        return err("Internal server error", 500);
      }
      if (!member) return err("Member not found", 404);

      const orgNum = Number(member.org_id);
      if (!Number.isFinite(orgNum) || orgNum <= 0) {
        return err("Member organization is invalid", 403);
      }
      const allowed = await isTeamLeadOrgApproved(authUser.id, orgNum);
      if (!allowed) {
        return err(
          "Super-admin approval is required for this member's team before viewing details",
          403
        );
      }

      return ok({
        authorized: true,
        member: { id: member.id, name: member.name, orgId: member.org_id },
      });
    }

    // AM: check if memberId is in their scope
    const grant = await getAccessGrant(authUser.id);
    if (!grant) return err("No access grant found", 403);

    const directAccess = grant.member_ids.some(
      (x) => String(x) === String(memberId)
    );

    const orgInTeamGrant = (orgId: unknown) => {
      const o = String(orgId);
      return (
        grant.team_ids.some((x) => String(x) === o) ||
        grant.signaling_org_ids.some((x) => String(x) === o)
      );
    };

    if (!directAccess && grant.team_ids.length + grant.signaling_org_ids.length > 0) {
      const { data: member, error: memberErr } = await supabase
        .from("users")
        .select("id, org_id")
        .eq("id", memberId)
        .maybeSingle();

      if (memberErr) {
        console.error("[members/screen/am] fetch error:", memberErr.message);
        return err("Internal server error", 500);
      }

      if (!member) return err("Member not found", 404);

      const teamAccess = orgInTeamGrant(member.org_id);
      if (!teamAccess) {
        return err("Member not in your access scope", 403);
      }

      return ok({
        authorized: true,
        member: { id: member.id, orgId: member.org_id },
      });
    }

    if (!directAccess) {
      return err("Member not in your access scope", 403);
    }

    const { data: member, error: mErr } = await supabase
      .from("users")
      .select("id, name, org_id")
      .eq("id", memberId)
      .maybeSingle();

    if (mErr || !member) return err("Member not found", 404);

    return ok({
      authorized: true,
      member: { id: member.id, name: member.name, orgId: member.org_id },
    });
  } catch (e) {
    console.error("[members/screen] Unhandled:", e);
    return err("Internal server error", 500);
  }
}
