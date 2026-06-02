/** Mirrors signaling-server `_mapAdminClientRow` (subset used by audit UI). */
export type AuditLiveClient = {
  id: number;
  fullName: string;
  status: string;
  orgId: number;
  orgName: string | null;
  /** Org string from client app enrollment (`client-auth` orgName), not audit team title. */
  claimedOrgName?: string | null;
  /** When signaling includes device id / label (optional). */
  device?: string | null;
  /** When signaling or API merges user email (optional). */
  email?: string | null;
  screenSources: Array<{ id: string; name: string; index: number | null }>;
};

export type AuditOrg = { id: number; name: string };

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
