/** Merged access grant row(s) for an audit_member. */
export type MergedAccessGrant = {
  team_ids: string[];
  member_ids: string[];
  signaling_org_ids: string[];
  signal_client_ids: string[];
};
