import { supabase } from "@/lib/supabaseClient";

export type TeamLeadOrgAccessStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revoked";

export async function getTeamLeadOrgAccessRow(
  teamLeadId: string,
  signalingOrgId: number
): Promise<{ status: TeamLeadOrgAccessStatus } | null> {
  const { data, error } = await supabase
    .from("team_lead_org_access")
    .select("status")
    .eq("team_lead_id", teamLeadId)
    .eq("signaling_org_id", signalingOrgId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.status) return null;
  return { status: data.status as TeamLeadOrgAccessStatus };
}

export async function isTeamLeadOrgApproved(
  teamLeadId: string,
  signalingOrgId: number
): Promise<boolean> {
  const row = await getTeamLeadOrgAccessRow(teamLeadId, signalingOrgId);
  return row?.status === "approved";
}
