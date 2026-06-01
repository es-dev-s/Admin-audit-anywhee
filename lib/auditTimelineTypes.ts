/** Event kinds written to `audit_timeline_events` (server). */
export const AUDIT_TIMELINE_EVENT_TYPES = [
  "auth_login",
  "auth_logout",
  "org_access_requested",
  "org_access_approved",
  "org_access_rejected",
  "org_access_revoked",
  "access_share",
  "member_audit_org_updated",
] as const;

export type AuditTimelineEventType = (typeof AUDIT_TIMELINE_EVENT_TYPES)[number];

export type AuditTimelineDecision = "approved" | "rejected" | "revoked";

export type AuditTimelineEventRow = {
  id: string;
  team_lead_id: string;
  created_at: string;
  event_type: string;
  summary: string;
  detail: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  recipient_user_id: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  audit_org_id: string | null;
  audit_org_name: string | null;
  signaling_org_id: number | null;
  signaling_org_label: string | null;
  live_team_id: number | null;
  live_team_name: string | null;
  live_member_id: number | null;
  live_member_name: string | null;
  decision: AuditTimelineDecision | null;
  reviewed_by_label: string | null;
  metadata: Record<string, unknown>;
  capture_id: string | null;
};
