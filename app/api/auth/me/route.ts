// app/api/auth/me/route.ts
// Return current user from JWT (no DB call for basic info).
// For audit_members, also fetches their access grant scope.
//
// The middleware has already verified the JWT and injected
// x-user-id and x-user-role headers. This route just reads them.
// However, for the full user object (name, email) we do a DB lookup
// since the JWT only contains sub and role (no sensitive data in JWT).

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { verifyAccessToken } from "@/lib/tokenUtils";
import { getAccessGrant } from "@/lib/server/authHelpers";

export async function GET(req: NextRequest) {
  try {
    // Try middleware-injected headers first (for protected routes)
    let userId = req.headers.get("x-user-id");

    // Fallback: verify from cookie directly (for when called from login/register pages)
    if (!userId) {
      const accessToken = req.cookies.get("access_token")?.value;
      if (!accessToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      try {
        const payload = verifyAccessToken(accessToken);
        userId = payload.sub;
      } catch {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Fetch full user record
    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, role, created_at")
      .eq("id", userId)
      .single();

    if (error || !user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    let scope = null;
    if (user.role === "audit_member") {
      scope = await getAccessGrant(user.id);
    }

    return Response.json({ user, scope });
  } catch (e) {
    console.error("[auth/me] Unhandled:", e);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
