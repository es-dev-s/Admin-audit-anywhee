/** Where the user opened a member screen from — controls Back navigation. */
export type AuditMemberFrom = "dashboard" | "live" | "team";

export function auditMemberScreenPath(
  orgId: number,
  clientId: number,
  from?: AuditMemberFrom,
): string {
  const base = `/audit/${orgId}/${clientId}`;
  if (!from || from === "team") return base;
  return `${base}?from=${from}`;
}

export function auditAnalyticsPath(
  orgId: number,
  clientId: number,
  from?: AuditMemberFrom | string | null,
): string {
  const base = `/audit/${orgId}/${clientId}/analytics`;
  if (from === "dashboard" || from === "live") return `${base}?from=${from}`;
  return base;
}

export function auditAnalyticsActivityPath(
  orgId: number,
  clientId: number,
  from?: AuditMemberFrom | string | null,
): string {
  const base = `/audit/${orgId}/${clientId}/analytics/activity`;
  if (from === "dashboard" || from === "live") return `${base}?from=${from}`;
  return base;
}

/**
 * Dashboard and group-scoped admins return to /audit; live wall to /audit/live;
 * otherwise the org (team) detail page.
 */
export function auditMemberBackHref(
  orgId: number,
  from: string | null | undefined,
  hasGroupScope: boolean,
): string {
  if (from === "dashboard" || hasGroupScope) return "/audit";
  if (from === "live") return "/audit/live";
  if (Number.isFinite(orgId) && orgId > 0) return `/audit/${orgId}`;
  return "/audit";
}

export function auditMemberBackLabel(
  from: string | null | undefined,
  hasGroupScope: boolean,
): string {
  if (from === "dashboard" || hasGroupScope) return "Back to dashboard";
  if (from === "live") return "Back to live feed";
  return "Back to team";
}
