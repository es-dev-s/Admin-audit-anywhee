import type { AuditLiveClient, AuditOrg } from "@/lib/auditTypes";
import type { MergedAccessGrant } from "@/lib/accessGrantTypes";

function uniqStrings(arr: string[]): string[] {
  return [...new Set(arr.map(String))];
}

/**
 * Restrict signaling roster for audit_member using merged grant.
 * Team lead / unscoped: pass role !== audit_member or null scope → no filtering.
 */
export function filterSignalingRosterForMember(
  clients: AuditLiveClient[],
  orgs: AuditOrg[],
  scope: MergedAccessGrant | null | undefined
): { clients: AuditLiveClient[]; orgs: AuditOrg[] } {
  if (!scope) {
    return { clients, orgs };
  }

  const teamKeys = uniqStrings([...scope.team_ids, ...scope.signaling_org_ids]);
  const teamKeySet = new Set(teamKeys);
  const allowClient = new Set(uniqStrings(scope.signal_client_ids));
  const hasClientAllowList = allowClient.size > 0;

  const clientPasses = (c: AuditLiveClient) => {
    const orgKey = String(c.orgId);
    if (teamKeySet.has(orgKey)) return true;
    if (hasClientAllowList && allowClient.has(String(c.id))) return true;
    return false;
  };

  const filteredClients = clients.filter(clientPasses);
  const orgIdSet = new Set(filteredClients.map((c) => c.orgId));
  const filteredOrgs = orgs.filter((o) => orgIdSet.has(o.id));
  return { clients: filteredClients, orgs: filteredOrgs };
}

/**
 * Team leads: hide live roster clients until super-admin approves per signaling org.
 * Orgs list stays complete so the dashboard can show every team with access status.
 */
export function filterSignalingRosterForTeamLead(
  clients: AuditLiveClient[],
  orgs: AuditOrg[],
  approvedOrgIds: Set<number>
): { clients: AuditLiveClient[]; orgs: AuditOrg[] } {
  if (approvedOrgIds.size === 0) {
    return { clients: [], orgs };
  }
  const filteredClients = clients.filter((c) => approvedOrgIds.has(c.orgId));
  return { clients: filteredClients, orgs };
}
