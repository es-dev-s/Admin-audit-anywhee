import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { generateInviteToken } from "@/lib/tokenUtils";
import { getAuthUser, ok, err } from "@/lib/server/authHelpers";

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const { scope, max_uses = 1 } = await req.json().catch(() => ({}));

    if (!scope || !Array.isArray(scope.team_ids) || !Array.isArray(scope.member_ids)) {
      return err("scope must contain team_ids[] and member_ids[] arrays", 400);
    }

    if (scope.team_ids.length === 0 && scope.member_ids.length === 0) {
      return err("Scope must grant at least one team or member", 400);
    }

    const token = generateInviteToken();
    const expiryHours = Number(process.env.INVITE_TOKEN_EXPIRY_HOURS ?? 72);
    const expires_at = new Date(Date.now() + expiryHours * 3_600_000).toISOString();

    const { data: invite, error } = await supabase
      .from("invites")
      .insert({
        token,
        created_by: authUser.id,
        scope,
        expires_at,
        max_uses: Math.max(1, Number(max_uses)),
      })
      .select("id, token, scope, expires_at, max_uses, created_at")
      .single();

    if (error) {
      console.error("[invites/create] DB error:", error.message);
      return err("Internal server error", 500);
    }

    // In NextJS we don't have APP_URL guaranteed, handle client side or use origin
    const origin = req.headers.get("origin") || req.nextUrl.origin || "http://localhost:3000";
    const inviteUrl = `${origin}/invite/${token}`;

    return ok({ invite, inviteUrl }, 201);
  } catch (e) {
    console.error("[invites/create] Unhandled:", e);
    return err("Internal server error", 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const { data, error } = await supabase
      .from("invites")
      .select("id, token, scope, expires_at, max_uses, use_count, used_at, revoked, created_at")
      .eq("created_by", authUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[invites/list] DB error:", error.message);
      return err("Internal server error", 500);
    }

    const now = new Date();
    const annotated = data.map((inv) => ({
      ...inv,
      status: inv.revoked
        ? "revoked"
        : new Date(inv.expires_at) < now
        ? "expired"
        : inv.use_count >= inv.max_uses
        ? "exhausted"
        : "active",
    }));

    return ok({ invites: annotated });
  } catch (e) {
    console.error("[invites/list] Unhandled:", e);
    return err("Internal server error", 500);
  }
}
