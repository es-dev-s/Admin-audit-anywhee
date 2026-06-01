// lib/server/tokens.ts
// Server-only token utilities for JWT + refresh tokens + invite tokens.
// Uses Node.js built-in crypto — no extra dependencies.

import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const SECRET = process.env.JWT_SECRET!;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "15m";
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? "7d";

// ─── JWT ─────────────────────────────────────────────────────────────────────

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role }, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): { sub: string; role: string } {
  return jwt.verify(token, SECRET) as { sub: string; role: string };
}

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshExpiresAt(): string {
  return new Date(
    Date.now() + parseDurationMs(REFRESH_EXPIRES_IN)
  ).toISOString();
}

// ─── Invite Token ─────────────────────────────────────────────────────────────

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function parseDurationMs(d: string): number {
  const m = d.match(/^(\d+)([smhd])$/);
  if (!m) return 7 * 86_400_000;
  const multipliers: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
  return Number(m[1]) * multipliers[m[2]];
}
