/** Signaling WebSocket URL for the audit browser (NEXT_PUBLIC_* or same host :18085). */
export function resolveSignalingWssUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_ANYWHERE_SIGNALING_WSS ?? "").trim();
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined") {
    const port = (process.env.NEXT_PUBLIC_SIGNALING_PORT ?? "18085").trim() || "18085";
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${window.location.hostname}:${port}`;
  }

  return "";
}
