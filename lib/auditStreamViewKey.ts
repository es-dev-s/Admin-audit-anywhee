export type AuditStreamViewOptions = {
  preferredSourceId?: string | null;
  preferredSourceIndex?: number | null;
  /**
   * Live-feed 1×2 wall: pin display 0 and 1 to separate stream keys.
   * Without this, display index 0 uses the default per-client key.
   */
  dualPane?: boolean;
};

/** Unique key per client + display source (supports dual-monitor wall). */
export function auditStreamViewKey(
  clientId: number,
  opts?: AuditStreamViewOptions
): string {
  if (opts?.preferredSourceId) {
    return `${clientId}:sid:${opts.preferredSourceId}`;
  }
  const idx = opts?.preferredSourceIndex;
  if (opts?.dualPane && idx != null && Number.isFinite(idx) && idx >= 0) {
    return `${clientId}:idx:${Math.trunc(idx)}`;
  }
  if (idx != null && Number.isFinite(idx) && idx > 0) {
    return `${clientId}:idx:${Math.trunc(idx)}`;
  }
  return String(clientId);
}

export function clientIdFromViewKey(viewKey: string): number {
  const head = viewKey.split(":")[0];
  const n = Number(head);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/** Build stable stream options for acquire/getStream/release. */
export function auditStreamViewOpts(
  displayIndex: number,
  sourceId?: string | null,
  dualPane?: boolean
): AuditStreamViewOptions {
  return {
    preferredSourceId: sourceId ?? null,
    preferredSourceIndex: displayIndex,
    dualPane: dualPane === true,
  };
}
