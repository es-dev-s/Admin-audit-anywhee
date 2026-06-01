import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, ok, err } from "@/lib/server/authHelpers";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const { token } = await params;
    const { scope } = await req.json().catch(() => ({}));

    if (!scope || !Array.isArray(scope.team_ids) || !Array.isArray(scope.member_ids)) {
      return err("scope must contain team_ids[] and member_ids[] arrays", 400);
    }

    const { data: invite, error: fetchErr } = await supabase
      .from("invites")
      .select("id, created_by, revoked")
      .eq("token", token)
      .maybeSingle();

    if (fetchErr) {
      console.error("[invites/scope] DB error:", fetchErr.message);
      return err("Internal server error", 500);
    }

    if (!invite) return err("Invite not found", 404);
    if (invite.created_by !== authUser.id) {
      return err("You do not own this invite", 403);
    }
    if (invite.revoked) return err("Cannot update a revoked invite", 410);

    const { error } = await supabase
      .from("invites")
      .update({ scope })
      .eq("token", token);

    if (error) {
      console.error("[invites/scope] update error:", error.message);
      return err("Internal server error", 500);
    }

    return ok({
      message: "Invite scope updated",
      scopeNote: "Access grants already redeemed are NOT affected by this change.",
    });
  } catch (e) {
    console.error("[invites/scope] Unhandled:", e);
    return err("Internal server error", 500);
  }
}
