import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, ok, err } from "@/lib/server/authHelpers";
import { parseOptionalDateRange } from "@/lib/server/parseDateRangeQuery";

const MAX = 400;

function mapRow(r: Record<string, unknown>) {
  const meta = r.metadata;
  return {
    id: String(r.id),
    createdAt: r.created_at as string,
    eventType: r.event_type as string,
    summary: r.summary as string,
    detail: (r.detail as string | null) ?? null,
    actorUserId: (r.actor_user_id as string | null) ?? null,
    actorName: (r.actor_name as string | null) ?? null,
    actorEmail: (r.actor_email as string | null) ?? null,
    recipientUserId: (r.recipient_user_id as string | null) ?? null,
    recipientEmail: (r.recipient_email as string | null) ?? null,
    recipientName: (r.recipient_name as string | null) ?? null,
    auditOrgId: (r.audit_org_id as string | null) ?? null,
    auditOrgName: (r.audit_org_name as string | null) ?? null,
    signalingOrgId:
      r.signaling_org_id != null ? Number(r.signaling_org_id) : null,
    signalingOrgLabel: (r.signaling_org_label as string | null) ?? null,
    liveTeamId: r.live_team_id != null ? Number(r.live_team_id) : null,
    liveTeamName: (r.live_team_name as string | null) ?? null,
    liveMemberId: r.live_member_id != null ? Number(r.live_member_id) : null,
    liveMemberName: (r.live_member_name as string | null) ?? null,
    decision: (r.decision as string | null) ?? null,
    reviewedByLabel: (r.reviewed_by_label as string | null) ?? null,
    metadata: meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {},
    captureId: (r.capture_id as string | null) ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const typeFilter = req.nextUrl.searchParams.get("type")?.trim();
    const parsed = parseOptionalDateRange(req.nextUrl.searchParams);
    if (!parsed.ok) return err(parsed.error, 400);

    let q = supabase
      .from("audit_timeline_events")
      .select(
        "id, created_at, event_type, summary, detail, actor_user_id, actor_name, actor_email, recipient_user_id, recipient_email, recipient_name, audit_org_id, audit_org_name, signaling_org_id, signaling_org_label, live_team_id, live_team_name, live_member_id, live_member_name, decision, reviewed_by_label, metadata, capture_id",
      )
      .eq("team_lead_id", authUser.id);

    if (parsed.from) {
      q = q.gte("created_at", parsed.from);
    }
    if (parsed.to) {
      q = q.lte("created_at", parsed.to);
    }

    if (typeFilter) {
      q = q.eq("event_type", typeFilter);
    }

    q = q.order("created_at", { ascending: false }).limit(MAX);

    const { data, error } = await q;

    if (error) {
      console.error("[audit-timeline/list]", error.message);
      return err("Internal server error", 500);
    }

    return ok({ events: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)) });
  } catch (e) {
    console.error("[audit-timeline/list] Unhandled", e);
    return err("Internal server error", 500);
  }
}
