export type AuditStreamViewOptions = {
  preferredSourceId?: string | null;
  preferredSourceIndex?: number | null;
};

/** Unique key per client + display source (supports dual-monitor wall). */
export function auditStreamViewKey(
  clientId: number,
  opts?: AuditStreamViewOptions
): string {
  if (opts?.preferredSourceId) {
    return `${clientId}:sid:${opts.preferredSourceId}`;
  }
  if (
    opts?.preferredSourceIndex != null &&
    Number.isFinite(opts.preferredSourceIndex) &&
    opts.preferredSourceIndex >= 0
  ) {
    return `${clientId}:idx:${Math.trunc(opts.preferredSourceIndex)}`;
  }
  return String(clientId);
}

export function clientIdFromViewKey(viewKey: string): number {
  const head = viewKey.split(":")[0];
  const n = Number(head);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}
