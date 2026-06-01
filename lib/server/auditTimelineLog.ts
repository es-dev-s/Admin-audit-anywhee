import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditTimelineDecision, AuditTimelineEventType } from "@/lib/auditTimelineTypes";

export type TimelineUserScope = {
  id: string;
  role: string;
  created_by: string | null;
};

/** Team lead sees their own events; audit members' auth events roll up to `created_by` team lead. */
export function timelineOwnerIdForUser(user: TimelineUserScope): string | null {
  if (user.role === "team_lead") return user.id;
  if (user.role === "audit_member" && user.created_by) return user.created_by;
  return null;
}

export type AuditTimelineInsert = {
  team_lead_id: string;
  event_type: AuditTimelineEventType | string;
  summary: string;
  detail?: string | null;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  recipient_user_id?: string | null;
  recipient_email?: string | null;
  recipient_name?: string | null;
  audit_org_id?: string | null;
  audit_org_name?: string | null;
  signaling_org_id?: number | null;
  signaling_org_label?: string | null;
  live_team_id?: number | null;
  live_team_name?: string | null;
  live_member_id?: number | null;
  live_member_name?: string | null;
  decision?: AuditTimelineDecision | null;
  reviewed_by_label?: string | null;
  metadata?: Record<string, unknown>;
  capture_id?: string | null;
};

export async function insertAuditTimelineEvent(
  db: SupabaseClient,
  row: AuditTimelineInsert
): Promise<void> {
  const { error } = await db.from("audit_timeline_events").insert({
    team_lead_id: row.team_lead_id,
    event_type: row.event_type,
    summary: row.summary,
    detail: row.detail ?? null,
    actor_user_id: row.actor_user_id ?? null,
    actor_name: row.actor_name ?? null,
    actor_email: row.actor_email ?? null,
    recipient_user_id: row.recipient_user_id ?? null,
    recipient_email: row.recipient_email ?? null,
    recipient_name: row.recipient_name ?? null,
    audit_org_id: row.audit_org_id ?? null,
    audit_org_name: row.audit_org_name ?? null,
    signaling_org_id: row.signaling_org_id ?? null,
    signaling_org_label: row.signaling_org_label ?? null,
    live_team_id: row.live_team_id ?? null,
    live_team_name: row.live_team_name ?? null,
    live_member_id: row.live_member_id ?? null,
    live_member_name: row.live_member_name ?? null,
    decision: row.decision ?? null,
    reviewed_by_label: row.reviewed_by_label ?? null,
    metadata: row.metadata ?? {},
    capture_id: row.capture_id ?? null,
  });
  if (error) {
    console.error("[audit-timeline] insert failed:", error.message);
  }
}
