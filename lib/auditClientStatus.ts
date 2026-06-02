/** Signaling roster status helpers (aligned with signing-server effectiveStatus). */

export type ClientRosterKind = "online" | "offline" | "unknown";

const OFFLINE_STATUSES = new Set(["offline", "disconnected", "away"]);

export function isClientStreamable(status: string | undefined): boolean {
  return status === "sharing" || status === "online";
}

export function isClientLive(status: string | undefined): boolean {
  return isClientStreamable(status);
}

/** Green = online/sharing, red = offline, yellow = unknown / other. */
export function classifyClientRosterStatus(
  status: string | undefined,
): ClientRosterKind {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s === "sharing" || s === "online") return "online";
  if (OFFLINE_STATUSES.has(s)) return "offline";
  return "unknown";
}

export function clientRosterStatusLabel(status: string | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "sharing") return "Live";
  if (s === "online") return "Online";
  if (s === "offline") return "Offline";
  if (s === "disconnected") return "Offline";
  if (!s) return "Unknown";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Maps roster kind to StatusBadge status prop. */
export function clientRosterToBadgeStatus(
  kind: ClientRosterKind,
): "online" | "offline" | "warning" {
  if (kind === "online") return "online";
  if (kind === "offline") return "offline";
  return "warning";
}
