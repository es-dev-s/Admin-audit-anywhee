// app/api/invites/[token]/redeem/route.ts
// Invite redemption — creates an audit_member account via a valid invite link.
//
// Flow:
// 1. Validate invite (not expired, not revoked, not exhausted)
// 2. Check email not already registered
// 3. Hash password (bcrypt 12), create user with role: audit_member
// 4. Create access_grant from invite scope
// 5. Increment invite use_count
// 6. Issue JWT + refresh token via HTTP-only cookies
//
// Rate limited: 10 requests per 15 minutes per IP

import { NextRequest } from "next/server";
import bcrypt from "bcrypt";
import { supabase } from "@/lib/supabaseClient";
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiresAt,
  setAuthCookies,
} from "@/lib/tokenUtils";
import { ok, err } from "@/lib/server/authHelpers";
import { checkRateLimit } from "@/lib/rateLimit";

const EMAIL_DOMAIN = "@entegrasources.com.np";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Rate limiting
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const rateCheck = checkRateLimit(`redeem:${ip}`);
    if (rateCheck.limited) {
      return Response.json(
        { error: "Too many attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((rateCheck.retryAfterMs ?? 60000) / 1000)
            ),
          },
        }
      );
    }

    const { token } = await params;
    const body = await req.json().catch(() => ({}));
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return err("name, email, and password are required", 400);
    }

    if (password.length < 8) {
      return err("Password must be at least 8 characters", 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Domain enforcement
    if (!normalizedEmail.endsWith(EMAIL_DOMAIN)) {
      return err(`Email must end with ${EMAIL_DOMAIN}`, 400);
    }

    // 1. Fetch and validate invite
    const { data: invite, error: inviteErr } = await supabase
      .from("invites")
      .select("id, scope, expires_at, max_uses, use_count, revoked")
      .eq("token", token)
      .maybeSingle();

    if (inviteErr) {
      console.error("[invites/redeem] DB error:", inviteErr.message);
      return err("Internal server error", 500);
    }

    if (!invite) return err("Invite not found", 404);

    const now = new Date();
    if (invite.revoked) return err("Invite has been revoked", 410);
    if (new Date(invite.expires_at) < now)
      return err("Invite has expired", 410);
    if (invite.use_count >= invite.max_uses)
      return err("Invite already fully used", 410);

    // 2. Check email not already registered
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      return err("An account with this email already exists", 409);
    }

    // 3. Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // 4. Create user
    const { data: newUser, error: userErr } = await supabase
      .from("users")
      .insert({
        name: name.trim(),
        email: normalizedEmail,
        password_hash,
        role: "audit_member",
      })
      .select("id, name, email, role")
      .single();

    if (userErr) {
      console.error("[invites/redeem] user insert error:", userErr.message);
      return err("Internal server error", 500);
    }

    // 5. Create access_grant
    const scope = invite.scope as {
      team_ids?: string[];
      member_ids?: string[];
    };
    const { error: grantErr } = await supabase.from("access_grants").insert({
      user_id: newUser.id,
      invite_id: invite.id,
      team_ids: scope.team_ids ?? [],
      member_ids: scope.member_ids ?? [],
    });

    if (grantErr) {
      await supabase.from("users").delete().eq("id", newUser.id);
      console.error("[invites/redeem] grant insert error:", grantErr.message);
      return err("Internal server error", 500);
    }

    // 6. Increment use_count
    await supabase
      .from("invites")
      .update({
        use_count: invite.use_count + 1,
        used_at: now.toISOString(),
      })
      .eq("id", invite.id);

    // 7. Issue tokens via HTTP-only cookies
    const accessToken = signAccessToken(newUser.id, "audit_member");
    const rawRefresh = generateRefreshToken();
    const refreshHash = hashToken(rawRefresh);
    const expiresAt = refreshExpiresAt();

    await supabase.from("refresh_tokens").insert({
      user_id: newUser.id,
      token_hash: refreshHash,
      expires_at: expiresAt,
    });

    const response = Response.json(
      {
        message: "Account created successfully",
        user: newUser,
      },
      { status: 201 }
    );

    return setAuthCookies(response, accessToken, rawRefresh);
  } catch (e) {
    console.error("[invites/redeem] Unhandled:", e);
    return err("Internal server error", 500);
  }
}
