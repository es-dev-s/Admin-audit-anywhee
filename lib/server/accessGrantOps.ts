import { supabase } from "@/lib/supabaseClient";

export const DEFAULT_ACCESS_GRANT_TTL_MS = 24 * 60 * 60 * 1000;

function uniqAppend(base: string[], add: string[]): string[] {
  const s = new Set(base.map(String));
  for (const x of add) {
    const v = String(x).trim();
    if (v) s.add(v);
  }
  return [...s];
}

export function defaultSharedExpiresAtIso(): string {
  return new Date(Date.now() + DEFAULT_ACCESS_GRANT_TTL_MS).toISOString();
}

/** Apply or extend access_grants for a user (same logic as access-share). */
export async function applyGrantShareToUser(
  targetUserId: string,
  ownerTeamLeadId: string,
  shareScope: "team" | "member",
  signalOrgStr: string,
  orgIdStr: string | null,
  signalClientId: number | null,
  memberUserId: string | null,
  sharedExpiresAtIso: string
): Promise<{ error?: string }> {
  const { data: rows, error: grantListErr } = await supabase
    .from("access_grants")
    .select(
      "id, team_ids, member_ids, signaling_org_ids, signal_client_ids, invite_id"
    )
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: true });

  if (grantListErr) {
    console.error("[access-grant] grant list:", grantListErr.message);
    return { error: "Internal server error" };
  }

  const existing = rows?.[0];
  let nextTeams = existing?.team_ids?.map(String) ?? [];
  let nextMembers = existing?.member_ids?.map(String) ?? [];
  let nextSigOrgs = existing?.signaling_org_ids?.map(String) ?? [];
  let nextSigClients = existing?.signal_client_ids?.map(String) ?? [];

  if (shareScope === "team") {
    nextSigOrgs = uniqAppend(nextSigOrgs, [signalOrgStr]);
    if (orgIdStr) nextTeams = uniqAppend(nextTeams, [orgIdStr]);
  } else {
    nextSigClients = uniqAppend(nextSigClients, [String(signalClientId)]);
    if (memberUserId) nextMembers = uniqAppend(nextMembers, [memberUserId]);
  }

  if (existing) {
    const { error: upErr } = await supabase
      .from("access_grants")
      .update({
        team_ids: nextTeams,
        member_ids: nextMembers,
        signaling_org_ids: nextSigOrgs,
        signal_client_ids: nextSigClients,
        shared_expires_at: sharedExpiresAtIso,
        revoked_at: null,
      })
      .eq("id", existing.id);

    if (upErr) {
      console.error("[access-grant] grant update:", upErr.message);
      return { error: "Internal server error" };
    }
  } else {
    const { error: insErr } = await supabase.from("access_grants").insert({
      user_id: targetUserId,
      invite_id: null,
      team_ids: nextTeams,
      member_ids: nextMembers,
      signaling_org_ids: nextSigOrgs,
      signal_client_ids: nextSigClients,
      shared_expires_at: sharedExpiresAtIso,
      revoked_at: null,
    });

    if (insErr) {
      console.error("[access-grant] grant insert:", insErr.message);
      return { error: "Internal server error" };
    }
  }

  const sig = Number(signalOrgStr);
  if (Number.isFinite(sig) && sig > 0) {
    const { error: orgErr } = await supabase
      .from("users")
      .update({ org_id: sig })
      .eq("id", targetUserId)
      .eq("created_by", ownerTeamLeadId)
      .eq("role", "audit_member");

    if (orgErr) {
      console.error("[access-grant] org_id update:", orgErr.message);
      return { error: "Internal server error" };
    }
  }

  return {};
}

export async function applyGrantRevokeToUser(
  targetUserId: string,
  shareScope: "team" | "member",
  signalOrgStr: string,
  orgIdStr: string | null,
  signalClientId: number | null,
  memberUserId: string | null
): Promise<{ error?: string }> {
  const { data: rows, error: grantListErr } = await supabase
    .from("access_grants")
    .select(
      "id, team_ids, member_ids, signaling_org_ids, signal_client_ids, shared_expires_at"
    )
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: true });

  if (grantListErr) {
    console.error("[access-revoke] grant list:", grantListErr.message);
    return { error: "Internal server error" };
  }

  const existing = rows?.[0];
  if (!existing) return {};

  const revokeSet = (arr: unknown[], remove: string[]) => {
    const deny = new Set(remove.map((x) => String(x)));
    return (Array.isArray(arr) ? arr : [])
      .map((x) => String(x))
      .filter((x) => x && !deny.has(x));
  };

  const revokeNowIso = new Date().toISOString();
  let nextTeams = existing.team_ids?.map(String) ?? [];
  let nextMembers = existing.member_ids?.map(String) ?? [];
  let nextSigOrgs = existing.signaling_org_ids?.map(String) ?? [];
  let nextSigClients = existing.signal_client_ids?.map(String) ?? [];

  if (shareScope === "team") {
    nextSigOrgs = revokeSet(nextSigOrgs, [signalOrgStr]);
    if (orgIdStr) nextTeams = revokeSet(nextTeams, [orgIdStr]);
  } else {
    if (signalClientId != null) {
      nextSigClients = revokeSet(nextSigClients, [String(signalClientId)]);
    }
    if (memberUserId) {
      nextMembers = revokeSet(nextMembers, [memberUserId]);
    }
  }

  const hasAnyScope =
    nextTeams.length > 0 ||
    nextMembers.length > 0 ||
    nextSigOrgs.length > 0 ||
    nextSigClients.length > 0;

  const { error: upErr } = await supabase
    .from("access_grants")
    .update({
      team_ids: nextTeams,
      member_ids: nextMembers,
      signaling_org_ids: nextSigOrgs,
      signal_client_ids: nextSigClients,
      shared_expires_at: hasAnyScope
        ? existing.shared_expires_at ?? null
        : revokeNowIso,
      revoked_at: hasAnyScope ? null : revokeNowIso,
    })
    .eq("id", existing.id);

  if (upErr) {
    console.error("[access-revoke] grant update:", upErr.message);
    return { error: "Internal server error" };
  }

  return {};
}
