export type SignalUiKind = "connected" | "connecting" | "error";

/** Map raw signaling connection string to UI bucket (no URL or secrets). */
export function getSignalUiState(connectionStatus: string): SignalUiKind {
  const s = connectionStatus.trim().toLowerCase();
  if (s === "live") return "connected";
  if (
    s.includes("initializing") ||
    s.includes("authenticating") ||
    s.includes("loading orgs") ||
    s.includes("loading")
  ) {
    return "connecting";
  }
  if (
    s.includes("missing") ||
    s.includes("failed") ||
    s.includes("error") ||
    s.includes("disconnected") ||
    s.includes("restricted") ||
    s.includes("denied") ||
    s.includes("invalid")
  ) {
    return "error";
  }
  if (s.includes("socket")) return "error";
  return "connecting";
}

export function formatSignalLabel(connectionStatus: string): string {
  if (connectionStatus === "Live") return "CONNECTED";
  return connectionStatus.toUpperCase().replace(/\s+/g, " ").slice(0, 48);
}
