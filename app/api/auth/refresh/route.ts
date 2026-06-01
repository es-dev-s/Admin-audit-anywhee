// app/api/auth/refresh/route.ts
// Token refresh endpoint — rotate refresh token, issue new access token.
//
// Reads refresh_token from HTTP-only cookie.
// Flow:
// 1. Hash the cookie value → lookup in DB
// 2. Validate: not revoked, not expired
// 3. Delete old token hash from DB (rotation)
// 4. Generate new refresh token, store new hash
// 5. Issue new access token
// 6. Set both as HTTP-only cookies
//
// Token rotation: every use issues a new token and atomically
// deletes the old one. This limits the damage window if a
// refresh token is somehow compromised.

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiresAt,
  setAuthCookies,
  clearAuthCookies,
} from "@/lib/tokenUtils";

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get("refresh_token")?.value;

    if (!refreshToken) {
      return Response.json(
        { error: "No refresh token provided" },
        { status: 401 }
      );
    }

    const hash = hashToken(refreshToken);

    // 1. Lookup by hash
    const { data: record, error } = await supabase
      .from("refresh_tokens")
      .select("id, user_id, expires_at, revoked")
      .eq("token_hash", hash)
      .maybeSingle();

    if (error) {
      console.error("[auth/refresh] DB error:", error.message);
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    if (!record) {
      const response = Response.json(
        { error: "Invalid refresh token" },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }

    if (record.revoked) {
      // A revoked token being used is suspicious — clear cookies
      const response = Response.json(
        { error: "Refresh token revoked" },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }

    if (new Date(record.expires_at) < new Date()) {
      const response = Response.json(
        { error: "Refresh token expired" },
        { status: 401 }
      );
      return clearAuthCookies(response);
    }

    // 2. Fetch user
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", record.user_id)
      .single();

    if (userErr || !user) {
      return Response.json({ error: "User not found" }, { status: 401 });
    }

    // 3. Rotate token — delete old, insert new (atomic intent)
    const { error: delError } = await supabase
      .from("refresh_tokens")
      .delete()
      .eq("id", record.id);

    if (delError) {
      console.error("[auth/refresh] Delete error:", delError.message);
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const newRawRefresh = generateRefreshToken();
    const newHash = hashToken(newRawRefresh);
    const expiresAt = refreshExpiresAt();

    const { error: insertError } = await supabase
      .from("refresh_tokens")
      .insert({
        user_id: user.id,
        token_hash: newHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("[auth/refresh] Insert error:", insertError.message);
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // 4. Issue new access token
    const accessToken = signAccessToken(user.id, user.role);

    const response = Response.json({ success: true });
    return setAuthCookies(response, accessToken, newRawRefresh);
  } catch (e) {
    console.error("[auth/refresh] Unhandled:", e);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
