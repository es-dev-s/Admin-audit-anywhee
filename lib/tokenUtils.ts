// lib/tokenUtils.ts
// Server-only token utilities for JWT + refresh tokens + invite tokens + cookie helpers.
// Uses Node.js built-in crypto — no extra dependencies.
//
// Security notes:
// - JWT signed with HS256, payload contains only { sub, role, iat, exp }
// - Refresh tokens: only SHA-256 hash stored in DB; raw value lives only in HTTP-only cookie
// - Cookie helpers enforce httpOnly, secure (prod), sameSite: strict

import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const SECRET = process.env.JWT_SECRET!;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "15m";
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? "7d";

// ─── JWT ─────────────────────────────────────────────────────────────────────

export function signAccessToken(userId: string, role: string): string {
  // Payload: only sub (user id) and role — no sensitive data
  return jwt.sign({ sub: userId, role }, SECRET, {
    expiresIn: EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(
  token: string
): { sub: string; role: string } {
  return jwt.verify(token, SECRET) as { sub: string; role: string };
}

// ─── Refresh Tokens ─────────────────────────────────────────────────────────

/** Generate a cryptographically random refresh token (32 bytes hex = 64 chars) */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** SHA-256 hash a token for safe DB storage — raw token never stored */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Calculate refresh token expiry as an ISO string */
export function refreshExpiresAt(): string {
  return new Date(
    Date.now() + parseDurationMs(REFRESH_EXPIRES_IN)
  ).toISOString();
}

// ─── Invite Token ───────────────────────────────────────────────────────────

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ─── Cookie Helpers ─────────────────────────────────────────────────────────

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Build a Set-Cookie header value for an auth cookie.
 * All auth cookies are httpOnly, secure (prod), sameSite=strict, path=/
 */
function buildCookie(
  name: string,
  value: string,
  maxAgeSeconds: number
): string {
  const parts = [
    `${name}=${value}`,
    `HttpOnly`,
    `Path=/`,
    `SameSite=Strict`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (IS_PROD) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Append access_token and refresh_token Set-Cookie headers to a Response.
 * Call this after issuing tokens on login/register/refresh.
 */
export function setAuthCookies(
  response: Response,
  accessToken: string,
  refreshToken: string
): Response {
  const accessMaxAge = Math.floor(parseDurationMs(EXPIRES_IN) / 1000);
  const refreshMaxAge = Math.floor(parseDurationMs(REFRESH_EXPIRES_IN) / 1000);

  response.headers.append(
    "Set-Cookie",
    buildCookie("access_token", accessToken, accessMaxAge)
  );
  response.headers.append(
    "Set-Cookie",
    buildCookie("refresh_token", refreshToken, refreshMaxAge)
  );

  return response;
}

/**
 * Clear both auth cookies by setting them to empty with Max-Age=0.
 */
export function clearAuthCookies(response: Response): Response {
  response.headers.append(
    "Set-Cookie",
    buildCookie("access_token", "", 0)
  );
  response.headers.append(
    "Set-Cookie",
    buildCookie("refresh_token", "", 0)
  );
  return response;
}

// ─── Util ───────────────────────────────────────────────────────────────────

/** Parse a duration string like "15m", "7d", "3600s" into milliseconds */
export function parseDurationMs(d: string): number {
  const m = d.match(/^(\d+)([smhd])$/);
  if (!m) return 7 * 86_400_000; // default: 7 days
  const multipliers: Record<string, number> = {
    s: 1e3,
    m: 6e4,
    h: 36e5,
    d: 864e5,
  };
  return Number(m[1]) * multipliers[m[2]];
}
