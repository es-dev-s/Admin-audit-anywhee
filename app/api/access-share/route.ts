import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, ok, err } from "@/lib/server/authHelpers";
import { isTeamLeadOrgApproved } from "@/lib/server/teamLeadOrgAccess";
import { checkRateLimit } from "@/lib/rateLimit";
import { insertAuditTimelineEvent } from "@/lib/server/auditTimelineLog";

const EMAIL_DOMAIN = "@entegrasources.com.np";

type RecipientMode = "email" | "audit_member" | "audit_organization";

type ShareBody = {
  recipientMode?: RecipientMode;
  email?: string;
  targetUserId?: string;
  auditOrganizationId?: string;
  shareScope?: "team" | "member";
  organizationId?: string | null;
  signalingOrgId: number;
  signalClientId?: number | null;
  memberUserId?: string | null;
  /** Display labels for timeline (optional). */
  liveTeamName?: string | null;
  liveMemberName?: string | null;
  targetAuditOrgName?: string | null;
};

const DEFAULT_AUTO_REVOKE_MS = 24 * 60 * 60 * 1000;

function uniqAppend(base: string[], add: string[]): string[] {
  const s = new Set(base.map(String));
  for (const x of add) {
    const v = String(x).trim();
    if (v) s.add(v);
  }
  return [...s];
}

async function applyGrantShareToUser(
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
    console.error("[access-share] grant list:", grantListErr.message);
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
      console.error("[access-share] grant update:", upErr.message);
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
      console.error("[access-share] grant insert:", insErr.message);
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
      console.error("[access-share] org_id update:", orgErr.message);
      return { error: "Internal server error" };
    }
  }

  return {};
}

async function applyGrantRevokeToUser(
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

function trimLabel(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

async function fetchActor(userId: string) {
  const { data } = await supabase
    .from("users")
    .select("name, email")
    .eq("id", userId)
    .maybeSingle();
  return data as { name: string; email: string } | null;
}

function logAccessShare(opts: {
  teamLeadId: string;
  actor: { name: string; email: string } | null;
  shareScope: "team" | "member";
  signalingOrgId: number;
  recipientMode: RecipientMode;
  summary: string;
  detail?: string | null;
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  auditOrgId?: string | null;
  auditOrgName?: string | null;
  liveTeamName?: string | null;
  liveMemberName?: string | null;
  recipientCount?: number;
}) {
  void insertAuditTimelineEvent(supabase, {
    team_lead_id: opts.teamLeadId,
    event_type: "access_share",
    summary: opts.summary,
    detail: opts.detail ?? null,
    actor_user_id: opts.teamLeadId,
    actor_name: opts.actor?.name ?? null,
    actor_email: opts.actor?.email ?? null,
    recipient_user_id: opts.recipientUserId ?? null,
    recipient_email: opts.recipientEmail ?? null,
    recipient_name: opts.recipientName ?? null,
    audit_org_id: opts.auditOrgId ?? null,
    audit_org_name: opts.auditOrgName ?? null,
    signaling_org_id: opts.signalingOrgId,
    live_team_name: opts.liveTeamName ?? null,
    live_member_name: opts.liveMemberName ?? null,
    metadata: {
      recipientMode: opts.recipientMode,
      shareScope: opts.shareScope,
      recipientCount: opts.recipientCount ?? 1,
    },
  });
}

function logAccessRevoke(opts: {
  teamLeadId: string;
  actor: { name: string; email: string } | null;
  shareScope: "team" | "member";
  signalingOrgId: number;
  recipientMode: RecipientMode;
  summary: string;
  detail?: string | null;
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  auditOrgId?: string | null;
  auditOrgName?: string | null;
  liveTeamName?: string | null;
  liveMemberName?: string | null;
  recipientCount?: number;
}) {
  void insertAuditTimelineEvent(supabase, {
    team_lead_id: opts.teamLeadId,
    event_type: "access_revoke",
    summary: opts.summary,
    detail: opts.detail ?? null,
    actor_user_id: opts.teamLeadId,
    actor_name: opts.actor?.name ?? null,
    actor_email: opts.actor?.email ?? null,
    recipient_user_id: opts.recipientUserId ?? null,
    recipient_email: opts.recipientEmail ?? null,
    recipient_name: opts.recipientName ?? null,
    audit_org_id: opts.auditOrgId ?? null,
    audit_org_name: opts.auditOrgName ?? null,
    signaling_org_id: opts.signalingOrgId,
    live_team_name: opts.liveTeamName ?? null,
    live_member_name: opts.liveMemberName ?? null,
    metadata: {
      recipientMode: opts.recipientMode,
      shareScope: opts.shareScope,
      recipientCount: opts.recipientCount ?? 1,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const url = new URL(req.url);
    const includeRevoked = url.searchParams.get("includeRevoked") === "1";

    const { data: members, error: memberErr } = await supabase
      .from("users")
      .select("id, name, email, audit_org_id, created_by")
      .eq("role", "audit_member")
      .eq("created_by", authUser.id);

    if (memberErr) {
      console.error("[access-share:get] members:", memberErr.message);
      return err("Internal server error", 500);
    }

    const memberIds = (members ?? []).map((m) => m.id);
    if (memberIds.length === 0) {
      return ok({ rows: [] });
    }

    let query = supabase
      .from("access_grants")
      .select(
        "id, user_id, team_ids, member_ids, signaling_org_ids, signal_client_ids, shared_expires_at, revoked_at, created_at"
      )
      .in("user_id", memberIds)
      .order("created_at", { ascending: false });

    if (!includeRevoked) {
      query = query.is("revoked_at", null);
    }

    const { data: grants, error: grantErr } = await query;
    if (grantErr) {
      console.error("[access-share:get] grants:", grantErr.message);
      return err("Internal server error", 500);
    }

    const orgIds = [...new Set((members ?? []).map((m) => m.audit_org_id).filter(Boolean))];
    let orgById = new Map<string, string>();
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from("audit_organizations")
        .select("id, name")
        .in("id", orgIds as string[]);
      orgById = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]));
    }

    const memberById = new Map(
      (members ?? []).map((m) => [
        m.id,
        {
          id: m.id as string,
          name: (m.name as string) ?? "Unknown",
          email: (m.email as string) ?? "",
          auditOrgId: (m.audit_org_id as string | null) ?? null,
          auditOrgName: m.audit_org_id ? orgById.get(String(m.audit_org_id)) ?? null : null,
        },
      ])
    );

    const rows = (grants ?? []).map((g) => {
      const member = memberById.get(String(g.user_id));
      return {
        grantId: g.id,
        userId: g.user_id,
        memberName: member?.name ?? "Unknown",
        memberEmail: member?.email ?? null,
        auditOrgId: member?.auditOrgId ?? null,
        auditOrgName: member?.auditOrgName ?? null,
        teamIds: (g.team_ids ?? []).map(String),
        memberIds: (g.member_ids ?? []).map(String),
        signalingOrgIds: (g.signaling_org_ids ?? []).map(String),
        signalClientIds: (g.signal_client_ids ?? []).map(String),
        sharedExpiresAt: g.shared_expires_at ?? null,
        revokedAt: g.revoked_at ?? null,
        createdAt: g.created_at ?? null,
      };
    });

    return ok({ rows });
  } catch (e) {
    console.error("[access-share:get] Unhandled:", e);
    return err("Internal server error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rateCheck = checkRateLimit(`access-share:${ip}`);
    if (rateCheck.limited) {
      return Response.json(
        { error: "Too many requests. Try again later." },
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

    const body = (await req.json().catch(() => ({}))) as ShareBody;
    const recipientMode: RecipientMode = body.recipientMode ?? "email";
    const shareScope = body.shareScope;
    const signalingOrgId = Number(body.signalingOrgId);
    const liveTeamName = trimLabel(body.liveTeamName, 240);
    const liveMemberName = trimLabel(body.liveMemberName, 240);
    const targetAuditOrgName = trimLabel(body.targetAuditOrgName, 240);

    const actor = await fetchActor(authUser.id);

    if (shareScope !== "team" && shareScope !== "member") {
      return err("shareScope must be team or member", 400);
    }
    if (!Number.isFinite(signalingOrgId) || signalingOrgId <= 0) {
      return err("signalingOrgId must be a positive number", 400);
    }

    const tlApproved = await isTeamLeadOrgApproved(authUser.id, signalingOrgId);
    if (!tlApproved) {
      return err(
        "Super-admin approval is required for this team before you can share access",
        403
      );
    }

    const signalOrgStr = String(signalingOrgId);
    const signalClientId =
      body.signalClientId != null ? Number(body.signalClientId) : NaN;

    if (shareScope === "member") {
      if (!Number.isFinite(signalClientId) || signalClientId <= 0) {
        return err("signalClientId is required for member share", 400);
      }
    }

    const orgIdStr =
      body.organizationId != null && String(body.organizationId).trim()
        ? String(body.organizationId).trim()
        : null;
    const memberUserId =
      body.memberUserId != null && String(body.memberUserId).trim()
        ? String(body.memberUserId).trim()
        : null;

    const sharedExpiresAtIso = new Date(
      Date.now() + DEFAULT_AUTO_REVOKE_MS
    ).toISOString();

    const runForUser = async (
      targetUserId: string,
      grantMemberIdOverride: string | null
    ) => {
      const mid =
        shareScope === "member"
          ? grantMemberIdOverride ?? memberUserId
          : null;
      const r = await applyGrantShareToUser(
        targetUserId,
        authUser.id,
        shareScope,
        signalOrgStr,
        orgIdStr,
        shareScope === "member" ? signalClientId : null,
        mid,
        sharedExpiresAtIso
      );
      return r.error;
    };

    if (recipientMode === "email") {
      const emailRaw = body.email?.trim().toLowerCase();
      if (!emailRaw || !emailRaw.endsWith(EMAIL_DOMAIN)) {
        return err(`Email must be a valid ${EMAIL_DOMAIN} address`, 400);
      }

      const { data: target, error: userErr } = await supabase
        .from("users")
        .select("id, role, email, name")
        .eq("email", emailRaw)
        .eq("created_by", authUser.id)
        .maybeSingle();

      if (userErr) {
        console.error("[access-share] user lookup:", userErr.message);
        return err("Internal server error", 500);
      }
      if (!target) {
        return err(
          "No account found for this email. Create the member on the Members page first.",
          404
        );
      }
      if (target.role !== "audit_member") {
        return err("Sharing is only available to audit_member accounts.", 400);
      }

      const e = await runForUser(
        target.id,
        shareScope === "member" ? target.id : null
      );
      if (e) return err(e, 500);

      logAccessShare({
        teamLeadId: authUser.id,
        actor,
        shareScope,
        signalingOrgId,
        recipientMode: "email",
        summary:
          shareScope === "team"
            ? `Shared live team access with ${target.email}`
            : `Shared live member stream with ${target.email}`,
        detail: [
          liveTeamName ? `Live team: ${liveTeamName}` : null,
          shareScope === "member" && liveMemberName
            ? `Member: ${liveMemberName}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
        recipientUserId: target.id,
        recipientEmail: target.email as string,
        recipientName: (target.name as string) ?? null,
        liveTeamName,
        liveMemberName,
        recipientCount: 1,
      });

      return ok({
        success: true,
        recipientCount: 1,
        shareScope,
        signalingOrgId,
        autoRevokesAt: sharedExpiresAtIso,
      });
    }

    if (recipientMode === "audit_member") {
      const tid = body.targetUserId?.trim();
      if (!tid) return err("targetUserId is required", 400);

      const { data: target, error: userErr } = await supabase
        .from("users")
        .select("id, role, name, email")
        .eq("id", tid)
        .eq("created_by", authUser.id)
        .maybeSingle();

      if (userErr || !target) return err("Member not found", 404);
      if (target.role !== "audit_member") {
        return err("Target is not an audit member", 400);
      }

      const e = await runForUser(
        target.id,
        shareScope === "member" ? target.id : null
      );
      if (e) return err(e, 500);

      logAccessShare({
        teamLeadId: authUser.id,
        actor,
        shareScope,
        signalingOrgId,
        recipientMode: "audit_member",
        summary:
          shareScope === "team"
            ? `Shared live team access with ${target.name} (${target.email})`
            : `Shared live member stream with ${target.name} (${target.email})`,
        detail: [
          liveTeamName ? `Live team: ${liveTeamName}` : null,
          shareScope === "member" && liveMemberName
            ? `Stream: ${liveMemberName}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
        recipientUserId: target.id,
        recipientEmail: target.email as string,
        recipientName: target.name as string,
        liveTeamName,
        liveMemberName,
        recipientCount: 1,
      });

      return ok({
        success: true,
        recipientCount: 1,
        shareScope,
        signalingOrgId,
        autoRevokesAt: sharedExpiresAtIso,
      });
    }

    if (recipientMode === "audit_organization") {
      const oid = body.auditOrganizationId?.trim();
      if (!oid) return err("auditOrganizationId is required", 400);

      const { data: org, error: oErr } = await supabase
        .from("audit_organizations")
        .select("id, name")
        .eq("id", oid)
        .eq("created_by", authUser.id)
        .maybeSingle();

      if (oErr || !org) return err("Organization not found", 404);

      const directoryOrgName =
        targetAuditOrgName ?? (org.name as string) ?? null;

      const { data: members, error: mErr } = await supabase
        .from("users")
        .select("id")
        .eq("role", "audit_member")
        .eq("audit_org_id", oid)
        .eq("created_by", authUser.id);

      if (mErr) {
        console.error("[access-share] org members:", mErr.message);
        return err("Internal server error", 500);
      }

      const list = members ?? [];
      if (list.length === 0) {
        return ok({
          success: true,
          recipientCount: 0,
          message: "No audit members are assigned to this organization yet.",
          shareScope,
          signalingOrgId,
        });
      }

      for (const m of list) {
        const e = await runForUser(
          m.id,
          shareScope === "member" ? m.id : null
        );
        if (e) return err(e, 500);
      }

      logAccessShare({
        teamLeadId: authUser.id,
        actor,
        shareScope,
        signalingOrgId,
        recipientMode: "audit_organization",
        summary:
          shareScope === "team"
            ? `Shared live team access with ${list.length} member(s) in “${directoryOrgName ?? "directory org"}”`
            : `Shared live member streams with ${list.length} member(s) in “${directoryOrgName ?? "directory org"}”`,
        detail: [
          liveTeamName ? `Live team: ${liveTeamName}` : null,
          shareScope === "member" && liveMemberName
            ? `Stream: ${liveMemberName}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
        auditOrgId: oid,
        auditOrgName: directoryOrgName,
        liveTeamName,
        liveMemberName,
        recipientCount: list.length,
      });

      return ok({
        success: true,
        recipientCount: list.length,
        shareScope,
        signalingOrgId,
        autoRevokesAt: sharedExpiresAtIso,
      });
    }

    return err("Invalid recipientMode", 400);
  } catch (e) {
    console.error("[access-share] Unhandled:", e);
    return err("Internal server error", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const body = (await req.json().catch(() => ({}))) as ShareBody;
    const recipientMode: RecipientMode = body.recipientMode ?? "email";
    const shareScope = body.shareScope;
    const signalingOrgId = Number(body.signalingOrgId);
    const liveTeamName = trimLabel(body.liveTeamName, 240);
    const liveMemberName = trimLabel(body.liveMemberName, 240);
    const targetAuditOrgName = trimLabel(body.targetAuditOrgName, 240);
    const actor = await fetchActor(authUser.id);

    if (shareScope !== "team" && shareScope !== "member") {
      return err("shareScope must be team or member", 400);
    }
    const hasValidSignalingOrgId =
      Number.isFinite(signalingOrgId) && signalingOrgId > 0;
    const signalingOrgIdForEvent = hasValidSignalingOrgId ? signalingOrgId : 0;
    if (shareScope === "team" && !hasValidSignalingOrgId) {
      return err("signalingOrgId must be a positive number", 400);
    }
    if (hasValidSignalingOrgId) {
      const tlApproved = await isTeamLeadOrgApproved(authUser.id, signalingOrgId);
      if (!tlApproved) {
        return err(
          "Super-admin approval is required for this team before you can revoke access",
          403
        );
      }
    }

    const signalOrgStr = hasValidSignalingOrgId ? String(signalingOrgId) : "";
    const signalClientId =
      body.signalClientId != null ? Number(body.signalClientId) : NaN;

    if (shareScope === "member") {
      if (!Number.isFinite(signalClientId) || signalClientId <= 0) {
        return err("signalClientId is required for member revoke", 400);
      }
    }

    const orgIdStr =
      body.organizationId != null && String(body.organizationId).trim()
        ? String(body.organizationId).trim()
        : null;
    const memberUserId =
      body.memberUserId != null && String(body.memberUserId).trim()
        ? String(body.memberUserId).trim()
        : null;

    const runForUser = async (
      targetUserId: string,
      grantMemberIdOverride: string | null
    ) => {
      const mid =
        shareScope === "member"
          ? grantMemberIdOverride ?? memberUserId
          : null;
      const r = await applyGrantRevokeToUser(
        targetUserId,
        shareScope,
        signalOrgStr,
        orgIdStr,
        shareScope === "member" ? signalClientId : null,
        mid
      );
      return r.error;
    };

    if (recipientMode === "email") {
      const emailRaw = body.email?.trim().toLowerCase();
      if (!emailRaw || !emailRaw.endsWith(EMAIL_DOMAIN)) {
        return err(`Email must be a valid ${EMAIL_DOMAIN} address`, 400);
      }

      const { data: target, error: userErr } = await supabase
        .from("users")
        .select("id, role, email, name")
        .eq("email", emailRaw)
        .eq("created_by", authUser.id)
        .maybeSingle();
      if (userErr || !target) return err("Member not found", 404);
      if (target.role !== "audit_member") {
        return err("Revoking is only available for audit_member accounts.", 400);
      }

      const e = await runForUser(
        target.id,
        shareScope === "member" ? target.id : null
      );
      if (e) return err(e, 500);

      logAccessRevoke({
        teamLeadId: authUser.id,
        actor,
        shareScope,
        signalingOrgId: signalingOrgIdForEvent,
        recipientMode: "email",
        summary:
          shareScope === "team"
            ? `Revoked live team access from ${target.email}`
            : `Revoked live member stream from ${target.email}`,
        detail: [
          liveTeamName ? `Live team: ${liveTeamName}` : null,
          shareScope === "member" && liveMemberName
            ? `Member: ${liveMemberName}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
        recipientUserId: target.id,
        recipientEmail: target.email as string,
        recipientName: (target.name as string) ?? null,
        liveTeamName,
        liveMemberName,
      });

      return ok({
        success: true,
        recipientCount: 1,
        shareScope,
        signalingOrgId: hasValidSignalingOrgId ? signalingOrgId : null,
      });
    }

    if (recipientMode === "audit_member") {
      const tid = body.targetUserId?.trim();
      if (!tid) return err("targetUserId is required", 400);

      const { data: target, error: userErr } = await supabase
        .from("users")
        .select("id, role, name, email")
        .eq("id", tid)
        .eq("created_by", authUser.id)
        .maybeSingle();
      if (userErr || !target) return err("Member not found", 404);
      if (target.role !== "audit_member") return err("Target is not an audit member", 400);

      const e = await runForUser(
        target.id,
        shareScope === "member" ? target.id : null
      );
      if (e) return err(e, 500);

      logAccessRevoke({
        teamLeadId: authUser.id,
        actor,
        shareScope,
        signalingOrgId: signalingOrgIdForEvent,
        recipientMode: "audit_member",
        summary:
          shareScope === "team"
            ? `Revoked live team access from ${target.name} (${target.email})`
            : `Revoked live member stream from ${target.name} (${target.email})`,
        detail: [
          liveTeamName ? `Live team: ${liveTeamName}` : null,
          shareScope === "member" && liveMemberName
            ? `Stream: ${liveMemberName}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
        recipientUserId: target.id,
        recipientEmail: target.email as string,
        recipientName: target.name as string,
        liveTeamName,
        liveMemberName,
      });

      return ok({
        success: true,
        recipientCount: 1,
        shareScope,
        signalingOrgId: hasValidSignalingOrgId ? signalingOrgId : null,
      });
    }

    if (recipientMode === "audit_organization") {
      const oid = body.auditOrganizationId?.trim();
      if (!oid) return err("auditOrganizationId is required", 400);

      const { data: org, error: oErr } = await supabase
        .from("audit_organizations")
        .select("id, name")
        .eq("id", oid)
        .eq("created_by", authUser.id)
        .maybeSingle();
      if (oErr || !org) return err("Organization not found", 404);

      const directoryOrgName =
        targetAuditOrgName ?? (org.name as string) ?? null;

      const { data: members, error: mErr } = await supabase
        .from("users")
        .select("id")
        .eq("role", "audit_member")
        .eq("audit_org_id", oid)
        .eq("created_by", authUser.id);
      if (mErr) return err("Internal server error", 500);

      const list = members ?? [];
      for (const m of list) {
        const e = await runForUser(
          m.id,
          shareScope === "member" ? m.id : null
        );
        if (e) return err(e, 500);
      }

      logAccessRevoke({
        teamLeadId: authUser.id,
        actor,
        shareScope,
        signalingOrgId: signalingOrgIdForEvent,
        recipientMode: "audit_organization",
        summary:
          shareScope === "team"
            ? `Revoked live team access from ${list.length} member(s) in “${directoryOrgName ?? "directory org"}”`
            : `Revoked live member streams from ${list.length} member(s) in “${directoryOrgName ?? "directory org"}”`,
        detail: [
          liveTeamName ? `Live team: ${liveTeamName}` : null,
          shareScope === "member" && liveMemberName
            ? `Stream: ${liveMemberName}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
        auditOrgId: oid,
        auditOrgName: directoryOrgName,
        liveTeamName,
        liveMemberName,
        recipientCount: list.length,
      });

      return ok({
        success: true,
        recipientCount: list.length,
        shareScope,
        signalingOrgId: hasValidSignalingOrgId ? signalingOrgId : null,
      });
    }

    return err("Invalid recipientMode", 400);
  } catch (e) {
    console.error("[access-revoke] Unhandled:", e);
    return err("Internal server error", 500);
  }
}
