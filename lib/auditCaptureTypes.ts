export type AuditCaptureRow = {
  id: string;
  capture_type: "screenshot" | "flag";
  object_key: string | null;
  note: string | null;
  team_id: number | null;
  member_id: number | null;
  member_name: string | null;
  created_at: string;
};
