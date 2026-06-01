import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { ok, err } from "@/lib/server/authHelpers";
import { verifyAuditSuperadminSecret } from "@/lib/server/superAdminServiceAuth";
import type { TeamLeadOrgAccessStatus } from "@/lib/server/teamLeadOrgAccess";
import { insertAuditTimelineEvent } from "@/lib/server/auditTimelineLog";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAuditSuperadminSecret(req)) {
      return err("Unauthorized", 401);
    }

    const statusFilter = req.nextUrl.searchParams.get("status")?.trim();

    let q = supabase
      .from("team_lead_org_access")
      .select(
        "id, team_lead_id, signaling_org_id, status, requested_at, reviewed_at, reviewed_by_username"
      )
      .order("requested_at", { ascending: false });

    if (
      statusFilter === "pending" ||
      statusFilter === "approved" ||
      statusFilter === "rejected" ||
      statusFilter === "revoked"
    ) {
      q = q.eq("status", statusFilter);
    }

    const { data: rows, error } = await q;

    if (error) {
      console.error("[superadmin/audit-org-access/list]", error.message);
      return err("Internal server error", 500);
    }

    const leadIds = [...new Set((rows ?? []).map((r) => r.team_lead_id))];
    const nameById = new Map<string, { name: string; email: string }>();

    if (leadIds.length > 0) {
      const { data: users, error: uErr } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", leadIds);
      if (uErr) {
        console.error("[superadmin/audit-org-access/users]", uErr.message);
        return err("Internal server error", 500);
      }
      for (const u of users ?? []) {
        nameById.set(String(u.id), {
          name: u.name as string,
          email: u.email as string,
        });
      }
    }

    const requests = (rows ?? []).map((r) => {
      const u = nameById.get(String(r.team_lead_id));
      return {
        id: r.id,
        teamLeadId: r.team_lead_id,
        teamLeadName: u?.name ?? null,
        teamLeadEmail: u?.email ?? null,
        signalingOrgId: Number(r.signaling_org_id),
        status: r.status as TeamLeadOrgAccessStatus,
        requestedAt: r.requested_at,
        reviewedAt: r.reviewed_at,
        reviewedByUsername: r.reviewed_by_username,
      };
    });

    const pendingCount = requests.filter((x) => x.status === "pending").length;

    return ok({ requests, pendingCount });
  } catch (e) {
    console.error("[superadmin/audit-org-access/list] Unhandled", e);
    return err("Internal server error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAuditSuperadminSecret(req)) {
      return err("Unauthorized", 401);
    }

    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      action?: "approve" | "reject" | "revoke";
      reviewerUsername?: string;
    };

    const id = body.id?.trim();
    const action = body.action;
    const reviewerUsername =
      typeof body.reviewerUsername === "string"
        ? body.reviewerUsername.trim().slice(0, 128)
        : "";

    if (!id) return err("id is required", 400);
    if (action !== "approve" && action !== "reject" && action !== "revoke") {
      return err("action must be approve, reject, or revoke", 400);
    }
    if (!reviewerUsername) return err("reviewerUsername is required", 400);

    const { data: row, error: findErr } = await supabase
      .from("team_lead_org_access")
      .select("id, status, team_lead_id, signaling_org_id")
      .eq("id", id)
      .maybeSingle();

    if (findErr || !row) return err("Request not found", 404);

    const now = new Date().toISOString();
    const st = row.status as TeamLeadOrgAccessStatus;
    const sigOrg = Number(row.signaling_org_id);
    const tlId = String(row.team_lead_id);

    if (action === "approve") {
      if (st !== "pending") {
        return err("Only pending requests can be approved", 400);
      }
      const { error: upErr } = await supabase
        .from("team_lead_org_access")
        .update({
          status: "approved",
          reviewed_at: now,
          reviewed_by_username: reviewerUsername,
        })
        .eq("id", id);
      if (upErr) {
        console.error("[superadmin/audit-org-access/approve]", upErr.message);
        return err("Internal server error", 500);
      }
      void insertAuditTimelineEvent(supabase, {
        team_lead_id: tlId,
        event_type: "org_access_approved",
        summary: `Live organization access approved (org #${sigOrg})`,
        detail: `Super-admin reviewer: ${reviewerUsername}`,
        decision: "approved",
        reviewed_by_label: reviewerUsername,
        signaling_org_id: sigOrg,
        metadata: { teamLeadOrgAccessRowId: id },
      });
      return ok({ success: true, status: "approved" as const });
    }

    if (action === "reject") {
      if (st !== "pending") {
        return err("Only pending requests can be rejected", 400);
      }
      const { error: upErr } = await supabase
        .from("team_lead_org_access")
        .update({
          status: "rejected",
          reviewed_at: now,
          reviewed_by_username: reviewerUsername,
        })
        .eq("id", id);
      if (upErr) {
        console.error("[superadmin/audit-org-access/reject]", upErr.message);
        return err("Internal server error", 500);
      }
      void insertAuditTimelineEvent(supabase, {
        team_lead_id: tlId,
        event_type: "org_access_rejected",
        summary: `Live organization access rejected (org #${sigOrg})`,
        detail: `Super-admin reviewer: ${reviewerUsername}`,
        decision: "rejected",
        reviewed_by_label: reviewerUsername,
        signaling_org_id: sigOrg,
        metadata: { teamLeadOrgAccessRowId: id },
      });
      return ok({ success: true, status: "rejected" as const });
    }

    // revoke
    if (st !== "approved") {
      return err("Only approved access can be revoked", 400);
    }
    const { error: upErr } = await supabase
      .from("team_lead_org_access")
      .update({
        status: "revoked",
        reviewed_at: now,
        reviewed_by_username: reviewerUsername,
      })
      .eq("id", id);
    if (upErr) {
      console.error("[superadmin/audit-org-access/revoke]", upErr.message);
      return err("Internal server error", 500);
    }
    void insertAuditTimelineEvent(supabase, {
      team_lead_id: tlId,
      event_type: "org_access_revoked",
      summary: `Live organization access revoked (org #${sigOrg})`,
      detail: `Super-admin reviewer: ${reviewerUsername}`,
      decision: "revoked",
      reviewed_by_label: reviewerUsername,
      signaling_org_id: sigOrg,
      metadata: { teamLeadOrgAccessRowId: id },
    });
    return ok({ success: true, status: "revoked" as const });
  } catch (e) {
    console.error("[superadmin/audit-org-access/review] Unhandled", e);
    return err("Internal server error", 500);
  }
}
