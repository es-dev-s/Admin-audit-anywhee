import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Shared secret for admin-dashboard (Electron) → audit-dashboard service routes.
 * Set AUDIT_SUPERADMIN_SERVICE_SECRET in the audit app env; same value in admin .env for IPC.
 */
export function verifyAuditSuperadminSecret(req: NextRequest): boolean {
  const secret = process.env.AUDIT_SUPERADMIN_SERVICE_SECRET?.trim();
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();

  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
