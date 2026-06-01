import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, ok, err } from "@/lib/server/authHelpers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { data: invite, error } = await supabase
      .from("invites")
      .select("id, scope, expires_at, max_uses, use_count, revoked")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("[invites/validate] DB error:", error.message);
      return err("Internal server error", 500);
    }

    if (!invite) return err("Invite not found", 404);

    const now = new Date();
    if (invite.revoked) return err("Invite has been revoked", 410);
    if (new Date(invite.expires_at) < now) return err("Invite has expired", 410);
    if (invite.use_count >= invite.max_uses) return err("Invite already used", 410);

    return ok({ valid: true, scope: invite.scope, expiresAt: invite.expires_at });
  } catch (e) {
    console.error("[invites/validate] Unhandled:", e);
    return err("Internal server error", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const { token } = await params;
    const { data: invite, error: fetchErr } = await supabase
      .from("invites")
      .select("id, created_by")
      .eq("token", token)
      .maybeSingle();

    if (fetchErr) {
      console.error("[invites/revoke] DB error:", fetchErr.message);
      return err("Internal server error", 500);
    }

    if (!invite) return err("Invite not found", 404);
    if (invite.created_by !== authUser.id) {
      return err("You do not own this invite", 403);
    }

    const { error } = await supabase
      .from("invites")
      .update({ revoked: true })
      .eq("token", token);

    if (error) {
      console.error("[invites/revoke] update error:", error.message);
      return err("Internal server error", 500);
    }

    return ok({ message: "Invite revoked successfully" });
  } catch (e) {
    console.error("[invites/revoke] Unhandled:", e);
    return err("Internal server error", 500);
  }
}
