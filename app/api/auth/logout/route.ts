// app/api/auth/logout/route.ts
// Logout endpoint — revoke refresh token in DB, clear both auth cookies.
//
// Reads the refresh_token from HTTP-only cookie (not request body).
// Always clears cookies even if DB revocation fails — defense in depth.

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { hashToken, clearAuthCookies } from "@/lib/tokenUtils";
import {
  insertAuditTimelineEvent,
  timelineOwnerIdForUser,
} from "@/lib/server/auditTimelineLog";

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get("refresh_token")?.value;

    if (refreshToken) {
      const hash = hashToken(refreshToken);

      const { data: rtRow } = await supabase
        .from("refresh_tokens")
        .select("user_id")
        .eq("token_hash", hash)
        .maybeSingle();

      if (rtRow?.user_id) {
        const { data: u } = await supabase
          .from("users")
          .select("id, name, email, role, created_by")
          .eq("id", rtRow.user_id)
          .maybeSingle();
        if (u) {
          const timelineOwner = timelineOwnerIdForUser({
            id: u.id,
            role: u.role as string,
            created_by: u.created_by as string | null,
          });
          if (timelineOwner) {
            void insertAuditTimelineEvent(supabase, {
              team_lead_id: timelineOwner,
              event_type: "auth_logout",
              summary: `${u.name} signed out`,
              detail: "Session ended.",
              actor_user_id: u.id,
              actor_name: u.name as string,
              actor_email: u.email as string,
              metadata: { role: u.role },
            });
          }
        }
      }

      const { error } = await supabase
        .from("refresh_tokens")
        .update({ revoked: true })
        .eq("token_hash", hash);

      if (error) {
        // Log but don't fail — still clear cookies
        console.error("[auth/logout] DB error:", error.message);
      }
    }

    // Always clear cookies regardless of DB result
    const response = Response.json({ message: "Logged out successfully" });
    return clearAuthCookies(response);
  } catch (e) {
    console.error("[auth/logout] Unhandled:", e);
    // Still clear cookies on error
    const response = Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
    return clearAuthCookies(response);
  }
}
