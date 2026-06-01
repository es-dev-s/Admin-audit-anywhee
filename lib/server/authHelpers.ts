// lib/server/authHelpers.ts
// Shared logic used across multiple API routes.
// Now reads user identity from middleware-injected headers (x-user-id, x-user-role)
// instead of parsing Bearer tokens — the middleware has already verified the JWT.
// Also provides access grant lookup for AM scope checks.

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import type { MergedAccessGrant } from "@/lib/accessGrantTypes";

export type AuthUser = { id: string; role: string };

/**
 * Extract authenticated user from middleware-injected headers.
 * The middleware verifies the JWT from the access_token cookie and injects
 * x-user-id and x-user-role headers. This function simply reads them.
 * Returns null if headers are missing (request wasn't authenticated by middleware).
 */
export function getAuthUser(req: NextRequest): AuthUser | null {
  const id = req.headers.get("x-user-id");
  const role = req.headers.get("x-user-role");
  if (!id || !role) return null;
  return { id, role };
}

function mergeGrantRows(
  rows: Array<{
    team_ids?: string[] | null;
    member_ids?: string[] | null;
    signaling_org_ids?: string[] | null;
    signal_client_ids?: string[] | null;
  }>
): MergedAccessGrant {
  const u = (a: unknown) => {
    const arr = Array.isArray(a) ? a : [];
    return [...new Set(arr.map((x) => String(x)).filter(Boolean))];
  };
  const flat = (key: keyof (typeof rows)[number]) =>
    rows.flatMap((r) => {
      const v = r[key];
      return Array.isArray(v) ? v : [];
    });
  return {
    team_ids: u(flat("team_ids")),
    member_ids: u(flat("member_ids")),
    signaling_org_ids: u(flat("signaling_org_ids")),
    signal_client_ids: u(flat("signal_client_ids")),
  };
}

/** Returns merged access grants for an audit_member (multiple rows allowed), or null. */
export async function getAccessGrant(
  userId: string
): Promise<MergedAccessGrant | null> {
  const { data, error } = await supabase
    .from("access_grants")
    .select("team_ids, member_ids, signaling_org_ids, signal_client_ids")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .or("shared_expires_at.is.null,shared_expires_at.gt.now()");
  if (error) throw error;
  if (!data?.length) return null;
  return mergeGrantRows(data);
}

/** Standard JSON error responses */
export const err = (msg: string, status: number) =>
  Response.json({ error: msg }, { status });

export const ok = (data: unknown, status = 200) =>
  Response.json(data, { status });
