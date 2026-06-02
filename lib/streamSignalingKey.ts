/** WebRTC signaling correlation id — matches audit `viewKey` / client peer map key. */
export function streamSignalingKey(msg: {
  streamKey?: unknown;
  fromSocketId?: unknown;
  preferredSourceId?: unknown;
  preferredSourceIndex?: unknown;
}): string | null {
  if (typeof msg.streamKey === "string" && msg.streamKey.trim()) {
    return msg.streamKey.trim();
  }
  const sid =
    typeof msg.fromSocketId === "string" && msg.fromSocketId.trim()
      ? msg.fromSocketId.trim()
      : "";
  if (!sid) return null;
  const srcId =
    typeof msg.preferredSourceId === "string" && msg.preferredSourceId.trim()
      ? msg.preferredSourceId.trim()
      : "";
  if (srcId) return `${sid}:sid:${srcId}`;
  const idx = msg.preferredSourceIndex;
  if (typeof idx === "number" && Number.isFinite(idx) && idx > 0) {
    return `${sid}:idx:${Math.trunc(idx)}`;
  }
  return sid;
}
