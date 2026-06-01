// app/api/auth/register/route.ts
// Registration endpoint — the core identity gate.
//
// Flow:
// 1. Validate input (name, email domain, password strength)
// 2. cPanel email existence check — MUST exist on company server
// 3. Duplicate check — email must not already be registered
// 4. Create account (bcrypt hash, insert user with role: team_lead)
// 5. Auto-login — issue JWT + refresh token, set HTTP-only cookies
//
// This is the ONLY way to create a team_lead account.
// Audit members are created via invite redemption.

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
import { verifyEmailInCpanel } from "@/lib/cpanel";

const EMAIL_DOMAIN = "@entegrasources.com.np";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, email, password, confirmPassword } = body;

    // ── Input validation ──
    if (!name?.trim() || !email?.trim() || !password) {
      return Response.json(
        { error: "Full name, email, and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Domain check — server-side enforcement (frontend also checks)
    if (!normalizedEmail.endsWith(EMAIL_DOMAIN)) {
      return Response.json(
        { error: `Email must end with ${EMAIL_DOMAIN}` },
        { status: 400 }
      );
    }

    // Password strength — min 8 chars, 1 uppercase, 1 number, 1 special char
    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    if (!/[A-Z]/.test(password)) {
      return Response.json(
        { error: "Password must contain at least one uppercase letter" },
        { status: 400 }
      );
    }

    if (!/[0-9]/.test(password)) {
      return Response.json(
        { error: "Password must contain at least one number" },
        { status: 400 }
      );
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      return Response.json(
        { error: "Password must contain at least one special character" },
        { status: 400 }
      );
    }

    if (confirmPassword !== undefined && confirmPassword !== password) {
      return Response.json(
        { error: "Passwords do not match" },
        { status: 400 }
      );
    }

    // ── Step 1: cPanel email existence check ──
    // This is the identity gate — only emails that exist on the company
    // cPanel server can register. This prevents arbitrary signups.
    try {
      const { exists } = await verifyEmailInCpanel(normalizedEmail);
      if (!exists) {
        return Response.json(
          {
            error:
              "This email account does not exist on the company server. Please ask your admin to create your company email account first.",
          },
          { status: 403 }
        );
      }
    } catch (cpanelError) {
      // Never leak cPanel error details to the client
      console.error("[auth/register] cPanel verification failed:", cpanelError);
      return Response.json(
        {
          error:
            "Unable to verify email with company server. Please try again later.",
        },
        { status: 502 }
      );
    }

    // ── Step 2: Duplicate check ──
    const { data: existing, error: checkError } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (checkError) {
      console.error("[auth/register] DB check error:", checkError.message);
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    if (existing) {
      return Response.json(
        { error: "An account with this email already exists. Please log in." },
        { status: 409 }
      );
    }

    // ── Step 3: Create account ──
    // bcrypt cost factor 12 — no exceptions
    const passwordHash = await bcrypt.hash(password, 12);

    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        name: name.trim(),
        email: normalizedEmail,
        password_hash: passwordHash,
        role: "team_lead",
      })
      .select("id, name, email, role")
      .single();

    if (insertError) {
      // Never expose DB error to client
      console.error("[auth/register] User insert error:", insertError.message);
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // ── Step 4: Auto-login — issue tokens and set cookies ──
    const accessToken = signAccessToken(newUser.id, newUser.role);
    const rawRefresh = generateRefreshToken();
    const refreshHash = hashToken(rawRefresh);
    const expiresAt = refreshExpiresAt();

    const { error: rtError } = await supabase.from("refresh_tokens").insert({
      user_id: newUser.id,
      token_hash: refreshHash,
      expires_at: expiresAt,
    });

    if (rtError) {
      console.error(
        "[auth/register] Refresh token insert error:",
        rtError.message
      );
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // Build response with safe user object — no tokens in body
    const response = Response.json(
      {
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
        },
      },
      { status: 201 }
    );

    // Set HTTP-only cookies for both tokens
    return setAuthCookies(response, accessToken, rawRefresh);
  } catch (e) {
    console.error("[auth/register] Unhandled:", e);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
