import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, ok, err } from "@/lib/server/authHelpers";
import type { TeamLeadOrgAccessStatus } from "@/lib/server/teamLeadOrgAccess";
import { insertAuditTimelineEvent } from "@/lib/server/auditTimelineLog";

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const { data, error } = await supabase
      .from("team_lead_org_access")
      .select("signaling_org_id, status, requested_at, reviewed_at")
      .eq("team_lead_id", authUser.id)
      .order("requested_at", { ascending: false });

    if (error) {
      console.error("[team-lead-org-access/list]", error.message);
      return err("Internal server error", 500);
    }

    const entries = (data ?? []).map((r) => ({
      signalingOrgId: Number(r.signaling_org_id),
      status: r.status as TeamLeadOrgAccessStatus,
      requestedAt: r.requested_at,
      reviewedAt: r.reviewed_at,
    }));

    return ok({ entries });
  } catch (e) {
    console.error("[team-lead-org-access/list] Unhandled", e);
    return err("Internal server error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const body = (await req.json().catch(() => ({}))) as {
      signalingOrgId?: number;
      signalingOrgLabel?: string | null;
    };
    const signalingOrgId = Number(body.signalingOrgId);
    const signalingOrgLabel =
      typeof body.signalingOrgLabel === "string"
        ? body.signalingOrgLabel.trim().slice(0, 240)
        : null;
    if (!Number.isFinite(signalingOrgId) || signalingOrgId <= 0) {
      return err("signalingOrgId must be a positive number", 400);
    }

    const { data: existing, error: findErr } = await supabase
      .from("team_lead_org_access")
      .select("id, status")
      .eq("team_lead_id", authUser.id)
      .eq("signaling_org_id", signalingOrgId)
      .maybeSingle();

    if (findErr) {
      console.error("[team-lead-org-access/request]", findErr.message);
      return err("Internal server error", 500);
    }

    if (!existing) {
      const { error: insErr } = await supabase.from("team_lead_org_access").insert({
        team_lead_id: authUser.id,
        signaling_org_id: signalingOrgId,
        status: "pending",
      });
      if (insErr) {
        console.error("[team-lead-org-access/insert]", insErr.message);
        return err("Internal server error", 500);
      }
      const { data: actor } = await supabase
        .from("users")
        .select("name, email")
        .eq("id", authUser.id)
        .maybeSingle();
      void insertAuditTimelineEvent(supabase, {
        team_lead_id: authUser.id,
        event_type: "org_access_requested",
        summary: signalingOrgLabel
          ? `Requested live access: ${signalingOrgLabel}`
          : `Requested live access (organization #${signalingOrgId})`,
        detail: "Awaiting super-admin approval.",
        actor_user_id: authUser.id,
        actor_name: (actor?.name as string) ?? null,
        actor_email: (actor?.email as string) ?? null,
        signaling_org_id: signalingOrgId,
        signaling_org_label: signalingOrgLabel,
      });
      return ok({ success: true, status: "pending" as const });
    }

    const st = existing.status as TeamLeadOrgAccessStatus;
    if (st === "approved" || st === "pending") {
      return ok({ success: true, status: st, message: "No change" });
    }

    const { error: upErr } = await supabase
      .from("team_lead_org_access")
      .update({
        status: "pending",
        requested_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by_username: null,
      })
      .eq("id", existing.id);

    if (upErr) {
      console.error("[team-lead-org-access/reopen]", upErr.message);
      return err("Internal server error", 500);
    }

    const { data: actor2 } = await supabase
      .from("users")
      .select("name, email")
      .eq("id", authUser.id)
      .maybeSingle();
    void insertAuditTimelineEvent(supabase, {
      team_lead_id: authUser.id,
      event_type: "org_access_requested",
      summary: signalingOrgLabel
        ? `Re-requested live access: ${signalingOrgLabel}`
        : `Re-requested live access (organization #${signalingOrgId})`,
      detail: "Awaiting super-admin approval.",
      actor_user_id: authUser.id,
      actor_name: (actor2?.name as string) ?? null,
      actor_email: (actor2?.email as string) ?? null,
      signaling_org_id: signalingOrgId,
      signaling_org_label: signalingOrgLabel,
    });

    return ok({ success: true, status: "pending" as const });
  } catch (e) {
    console.error("[team-lead-org-access/request] Unhandled", e);
    return err("Internal server error", 500);
  }
}
