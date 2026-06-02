import type { AuditLiveClient } from "@/lib/auditTypes";

/** Signaling org row name (fallback when enrollment org missing). */
export function resolveOrgDisplayName(
  orgName: string | null | undefined,
  orgId?: number,
): string {
  const trimmed = typeof orgName === "string" ? orgName.trim() : "";
  if (trimmed) return trimmed;
  if (Number.isFinite(orgId) && (orgId as number) > 0) return `Team ${orgId}`;
  return "Organization";
}

/** Org label from client-dashboard install: `claimedOrgName` first, then signaling org name. */
export function resolveClientEnrollmentOrg(params: {
  claimedOrgName?: string | null;
  orgName?: string | null;
  orgId?: number;
}): string {
  const claimed =
    typeof params.claimedOrgName === "string" ? params.claimedOrgName.trim() : "";
  if (claimed) return claimed;
  return resolveOrgDisplayName(params.orgName, params.orgId);
}

/** Plain text for selects, aria-labels, and search indexing. */
export function memberOrgPlainText(
  fullName: string,
  orgName: string | null | undefined,
  orgId?: number,
  claimedOrgName?: string | null,
): string {
  const org = resolveClientEnrollmentOrg({ claimedOrgName, orgName, orgId });
  const name = fullName.trim() || "Member";
  return `${org} · ${name}`;
}

export function memberOrgPlainTextFromClient(
  client: Pick<AuditLiveClient, "fullName" | "orgName" | "claimedOrgName" | "orgId">,
): string {
  return memberOrgPlainText(
    client.fullName,
    client.orgName,
    client.orgId,
    client.claimedOrgName,
  );
}
