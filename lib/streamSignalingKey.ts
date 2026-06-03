/** WebRTC signaling correlation id — must match `auditStreamViewKey` / `pcByViewKeyRef` keys. */
export function streamSignalingKey(msg: {
  streamKey?: unknown;
  fromSocketId?: unknown;
  clientId?: unknown;
  preferredSourceId?: unknown;
  preferredSourceIndex?: unknown;
}): string | null {
  if (typeof msg.streamKey === "string" && msg.streamKey.trim()) {
    return msg.streamKey.trim();
  }

  const cid = Number(msg.clientId);
  const prefix =
    Number.isFinite(cid) && cid > 0
      ? String(Math.trunc(cid))
      : typeof msg.fromSocketId === "string" && msg.fromSocketId.trim()
        ? msg.fromSocketId.trim()
        : "";
  if (!prefix) return null;

  const srcId =
    typeof msg.preferredSourceId === "string" && msg.preferredSourceId.trim()
      ? msg.preferredSourceId.trim()
      : "";
  if (srcId) return `${prefix}:sid:${srcId}`;

  const idx = msg.preferredSourceIndex;
  // Match auditStreamViewKey: display index 0 without dualPane is plain clientId; :idx:0 requires streamKey on the wire.
  if (typeof idx === "number" && Number.isFinite(idx) && idx > 0) {
    return `${prefix}:idx:${Math.trunc(idx)}`;
  }

  return prefix;
}
