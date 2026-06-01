// app/api/auth/login/route.ts
// Login endpoint — verify credentials, issue tokens, set HTTP-only cookies.
//
// Security:
// - Always returns generic "Invalid email or password" on failure — never reveals which field is wrong
// - Constant-time bcrypt compare even when email not found (prevents timing attacks)
// - Rate limited: 10 requests per 15 minutes per IP
// - Email domain enforced server-side

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
import { checkRateLimit } from "@/lib/rateLimit";
import {
  insertAuditTimelineEvent,
  timelineOwnerIdForUser,
} from "@/lib/server/auditTimelineLog";

const EMAIL_DOMAIN = "@entegrasources.com.np";
const GENERIC_LOGIN_ERROR = "Invalid email or password";

export async function POST(req: NextRequest) {
  try {
    // ── Rate limiting ──
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const rateCheck = checkRateLimit(`login:${ip}`);
    if (rateCheck.limited) {
      return Response.json(
        { error: "Too many login attempts. Please try again later." },
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

    const body = await req.json().catch(() => ({}));
    const { email, password } = body;

    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Domain enforcement — server-side
    if (!normalizedEmail.endsWith(EMAIL_DOMAIN)) {
      return Response.json(
        { error: `Email must end with ${EMAIL_DOMAIN}` },
        { status: 400 }
      );
    }

    // 1. Fetch user by email
    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, role, password_hash, created_by")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (error) {
      console.error("[auth/login] DB error:", error.message);
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // Constant-time failure — never reveal whether email exists
    if (!user) {
      // Dummy bcrypt compare to prevent timing-based email enumeration
      await bcrypt.compare(
        "dummy",
        "$2b$12$invalidhashpadding000000000000000000000"
      );
      return Response.json({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
    }

    // 2. Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return Response.json({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
    }

    // 3. Issue tokens
    const accessToken = signAccessToken(user.id, user.role);
    const rawRefresh = generateRefreshToken();
    const refreshHash = hashToken(rawRefresh);
    const expiresAt = refreshExpiresAt();

    const { error: rtError } = await supabase.from("refresh_tokens").insert({
      user_id: user.id,
      token_hash: refreshHash,
      expires_at: expiresAt,
    });

    if (rtError) {
      console.error(
        "[auth/login] Refresh token insert error:",
        rtError.message
      );
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const timelineOwner = timelineOwnerIdForUser({
      id: user.id,
      role: user.role,
      created_by: user.created_by as string | null,
    });
    if (timelineOwner) {
      void insertAuditTimelineEvent(supabase, {
        team_lead_id: timelineOwner,
        event_type: "auth_login",
        summary: `${user.name} signed in`,
        detail:
          user.role === "team_lead"
            ? "Team lead session started."
            : "Audit member session started.",
        actor_user_id: user.id,
        actor_name: user.name as string,
        actor_email: user.email as string,
        metadata: { role: user.role },
      });
    }

    // Return safe user object — tokens are in cookies only, never in body
    const response = Response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    return setAuthCookies(response, accessToken, rawRefresh);
  } catch (e) {
    console.error("[auth/login] Unhandled:", e);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
