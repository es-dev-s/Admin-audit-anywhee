import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, ok, err } from "@/lib/server/authHelpers";
import {
  teamLeadCanGrantLiveAccess,
  teamLeadShareDeniedMessage,
} from "@/lib/server/teamLeadOrgAccess";
import {
  applyGrantShareToUser,
  defaultSharedExpiresAtIso,
} from "@/lib/server/accessGrantOps";
import { insertAuditTimelineEvent } from "@/lib/server/auditTimelineLog";

export type MemberAccessRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

type RequestRow = {
  id: string;
  audit_member_id: string;
  team_lead_id: string;
  share_scope: string;
  signaling_org_id: number;
  signal_client_id: number | null;
  status: string;
  message: string | null;
  decline_reason: string | null;
  live_team_name: string | null;
  live_member_name: string | null;
  requested_at: string;
  reviewed_at: string | null;
};

function mapRequest(
  r: RequestRow,
  member?: { name: string; email: string } | null
) {
  return {
    id: r.id,
    auditMemberId: r.audit_member_id,
    memberName: member?.name ?? null,
    memberEmail: member?.email ?? null,
    shareScope: r.share_scope as "team" | "member",
    signalingOrgId: Number(r.signaling_org_id),
    signalClientId:
      r.signal_client_id != null ? Number(r.signal_client_id) : null,
    status: r.status as MemberAccessRequestStatus,
    message: r.message,
    declineReason: r.decline_reason,
    liveTeamName: r.live_team_name,
    liveMemberName: r.live_member_name,
    requestedAt: r.requested_at,
    reviewedAt: r.reviewed_at,
  };
}

async function fetchMemberProfile(memberId: string) {
  const { data } = await supabase
    .from("users")
    .select("id, name, email, role, created_by")
    .eq("id", memberId)
    .maybeSingle();
  return data as {
    id: string;
    name: string;
    email: string;
    role: string;
    created_by: string | null;
  } | null;
}

/** GET — team lead: inbox; audit member: own requests */
export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);

    const statusFilter = req.nextUrl.searchParams.get("status")?.trim();
    let q = supabase
      .from("member_live_access_requests")
      .select(
        "id, audit_member_id, team_lead_id, share_scope, signaling_org_id, signal_client_id, status, message, decline_reason, live_team_name, live_member_name, requested_at, reviewed_at"
      )
      .order("requested_at", { ascending: false });

    if (authUser.role === "team_lead") {
      q = q.eq("team_lead_id", authUser.id);
    } else if (authUser.role === "audit_member") {
      q = q.eq("audit_member_id", authUser.id);
    } else {
      return err("Forbidden", 403);
    }

    if (
      statusFilter === "pending" ||
      statusFilter === "approved" ||
      statusFilter === "rejected" ||
      statusFilter === "cancelled"
    ) {
      q = q.eq("status", statusFilter);
    }

    const { data: rows, error } = await q;
    if (error) {
      console.error("[member-access-requests/list]", error.message);
      return err("Internal server error", 500);
    }

    const memberIds = [
      ...new Set((rows ?? []).map((r) => String(r.audit_member_id))),
    ];
    const nameById = new Map<string, { name: string; email: string }>();
    if (memberIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", memberIds);
      for (const u of users ?? []) {
        nameById.set(String(u.id), {
          name: u.name as string,
          email: u.email as string,
        });
      }
    }

    const requests = (rows ?? []).map((r) =>
      mapRequest(r as RequestRow, nameById.get(String(r.audit_member_id)))
    );
    const pendingCount = requests.filter((x) => x.status === "pending").length;

    return ok({ requests, pendingCount });
  } catch (e) {
    console.error("[member-access-requests/list] Unhandled", e);
    return err("Internal server error", 500);
  }
}

/** POST — audit member: create request; team lead: approve/reject */
export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // ─── Team lead review ───────────────────────────────────────────────────
    if (authUser.role === "team_lead") {
      const requestId =
        typeof body.requestId === "string" ? body.requestId.trim() : "";
      const action = body.action;
      const declineReason =
        typeof body.declineReason === "string"
          ? body.declineReason.trim().slice(0, 500)
          : null;

      if (!requestId) return err("requestId is required", 400);
      if (action !== "approve" && action !== "reject") {
        return err("action must be approve or reject", 400);
      }

      const { data: row, error: findErr } = await supabase
        .from("member_live_access_requests")
        .select("*")
        .eq("id", requestId)
        .eq("team_lead_id", authUser.id)
        .maybeSingle();

      if (findErr || !row) {
        return err("Request not found", 404);
      }

      if (row.status !== "pending") {
        return ok({
          success: true,
          status: row.status,
          message: "Request already reviewed",
        });
      }

      const signalingOrgId = Number(row.signaling_org_id);
      const shareScope = row.share_scope as "team" | "member";
      const signalClientId =
        row.signal_client_id != null ? Number(row.signal_client_id) : null;

      const member = await fetchMemberProfile(String(row.audit_member_id));
      if (!member || member.role !== "audit_member") {
        return err("Member not found", 404);
      }

      const { data: actor } = await supabase
        .from("users")
        .select("name, email")
        .eq("id", authUser.id)
        .maybeSingle();

      if (action === "reject") {
        const { error: upErr } = await supabase
          .from("member_live_access_requests")
          .update({
            status: "rejected",
            decline_reason: declineReason || "Declined by team lead",
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", requestId);

        if (upErr) {
          console.error("[member-access-requests/reject]", upErr.message);
          return err("Internal server error", 500);
        }

        void insertAuditTimelineEvent(supabase, {
          team_lead_id: authUser.id,
          event_type: "member_access_rejected",
          summary: `Declined live access for ${member.name}`,
          detail: declineReason,
          actor_user_id: authUser.id,
          actor_name: (actor?.name as string) ?? null,
          actor_email: (actor?.email as string) ?? null,
          recipient_user_id: member.id,
          recipient_name: member.name,
          recipient_email: member.email,
          signaling_org_id: signalingOrgId,
          signaling_org_label: row.live_team_name as string | null,
          live_member_id:
            shareScope === "member" && signalClientId != null
              ? signalClientId
              : null,
          live_member_name: row.live_member_name as string | null,
          decision: "rejected",
        });

        return ok({ success: true, status: "rejected" as const });
      }

      const canGrant = await teamLeadCanGrantLiveAccess(
        authUser.id,
        signalingOrgId,
        shareScope,
        signalClientId
      );
      if (!canGrant) {
        return err(await teamLeadShareDeniedMessage(authUser.id), 403);
      }

      const sharedExpiresAtIso = defaultSharedExpiresAtIso();
      const grantErr = await applyGrantShareToUser(
        member.id,
        authUser.id,
        shareScope,
        String(signalingOrgId),
        null,
        shareScope === "member" ? signalClientId : null,
        shareScope === "member" ? member.id : null,
        sharedExpiresAtIso
      );
      if (grantErr.error) return err(grantErr.error, 500);

      const { error: upErr } = await supabase
        .from("member_live_access_requests")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (upErr) {
        console.error("[member-access-requests/approve]", upErr.message);
        return err("Internal server error", 500);
      }

      void insertAuditTimelineEvent(supabase, {
        team_lead_id: authUser.id,
        event_type: "member_access_approved",
        summary:
          shareScope === "team"
            ? `Approved team live access for ${member.name}`
            : `Approved member stream for ${member.name}`,
        detail: row.live_team_name
          ? `Team: ${row.live_team_name}`
          : `Organization #${signalingOrgId}`,
        actor_user_id: authUser.id,
        actor_name: (actor?.name as string) ?? null,
        actor_email: (actor?.email as string) ?? null,
        recipient_user_id: member.id,
        recipient_name: member.name,
        recipient_email: member.email,
        signaling_org_id: signalingOrgId,
        signaling_org_label: row.live_team_name as string | null,
        live_member_id:
          shareScope === "member" && signalClientId != null
            ? signalClientId
            : null,
        live_member_name: row.live_member_name as string | null,
        decision: "approved",
      });

      return ok({
        success: true,
        status: "approved" as const,
        autoRevokesAt: sharedExpiresAtIso,
      });
    }

    // ─── Audit member create request ────────────────────────────────────────
    if (authUser.role !== "audit_member") {
      return err("Forbidden", 403);
    }

    const shareScope = body.shareScope;
    const signalingOrgId = Number(body.signalingOrgId);
    const signalClientId =
      body.signalClientId != null ? Number(body.signalClientId) : null;
    const message =
      typeof body.message === "string"
        ? body.message.trim().slice(0, 500)
        : null;
    const liveTeamName =
      typeof body.liveTeamName === "string"
        ? body.liveTeamName.trim().slice(0, 240)
        : null;
    const liveMemberName =
      typeof body.liveMemberName === "string"
        ? body.liveMemberName.trim().slice(0, 240)
        : null;

    if (shareScope !== "team" && shareScope !== "member") {
      return err("shareScope must be team or member", 400);
    }
    if (!Number.isFinite(signalingOrgId) || signalingOrgId <= 0) {
      return err("signalingOrgId must be a positive number", 400);
    }
    if (shareScope === "member") {
      if (!Number.isFinite(signalClientId) || signalClientId! <= 0) {
        return err("signalClientId is required for member scope", 400);
      }
    }

    const { data: self, error: selfErr } = await supabase
      .from("users")
      .select("id, name, email, created_by")
      .eq("id", authUser.id)
      .maybeSingle();

    if (selfErr || !self?.created_by) {
      return err("Your account is not linked to a team lead", 400);
    }

    const teamLeadId = String(self.created_by);

    const { data: pendingDup } = await supabase
      .from("member_live_access_requests")
      .select("id")
      .eq("audit_member_id", authUser.id)
      .eq("signaling_org_id", signalingOrgId)
      .eq("share_scope", shareScope)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingDup) {
      return err("You already have a pending request for this access", 409);
    }

    if (shareScope === "member") {
      const { data: pendingClient } = await supabase
        .from("member_live_access_requests")
        .select("id")
        .eq("audit_member_id", authUser.id)
        .eq("signal_client_id", signalClientId!)
        .eq("status", "pending")
        .maybeSingle();
      if (pendingClient) {
        return err("You already have a pending request for this client", 409);
      }
    }

    const { data: inserted, error: insErr } = await supabase
      .from("member_live_access_requests")
      .insert({
        audit_member_id: authUser.id,
        team_lead_id: teamLeadId,
        share_scope: shareScope,
        signaling_org_id: signalingOrgId,
        signal_client_id: shareScope === "member" ? signalClientId : null,
        status: "pending",
        message,
        live_team_name: liveTeamName,
        live_member_name: liveMemberName,
      })
      .select("id, status")
      .single();

    if (insErr) {
      console.error("[member-access-requests/create]", insErr.message);
      return err("Internal server error", 500);
    }

    void insertAuditTimelineEvent(supabase, {
      team_lead_id: teamLeadId,
      event_type: "member_access_requested",
      summary:
        shareScope === "team"
          ? `${self.name} requested team live access`
          : `${self.name} requested a member stream`,
      detail: message ?? "Awaiting team lead approval.",
      actor_user_id: authUser.id,
      actor_name: self.name as string,
      actor_email: self.email as string,
      signaling_org_id: signalingOrgId,
      signaling_org_label: liveTeamName,
      live_member_id:
        shareScope === "member" && signalClientId != null
          ? signalClientId
          : null,
      live_member_name: liveMemberName,
    });

    return ok(
      { success: true, id: inserted.id, status: inserted.status as string },
      201
    );
  } catch (e) {
    console.error("[member-access-requests] Unhandled", e);
    return err("Internal server error", 500);
  }
}
