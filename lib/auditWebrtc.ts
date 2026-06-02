/** Shared WebRTC helpers for audit browser viewers (multi-stream grid). */

export type IceCandidateEntry = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

export function createCandidateDedupeSet(): Set<string> {
  return new Set<string>();
}

export async function safeAddIceCandidate(
  pc: RTCPeerConnection,
  dedupeSet: Set<string>,
  entry: IceCandidateEntry,
): Promise<void> {
  const key = entry.candidate;
  if (!key || dedupeSet.has(key)) return;
  dedupeSet.add(key);
  try {
    await pc.addIceCandidate(
      new RTCIceCandidate({
        candidate: entry.candidate,
        sdpMid: entry.sdpMid,
        sdpMLineIndex: entry.sdpMLineIndex,
      }),
    );
  } catch {
    /* non-fatal — remote may still connect */
  }
}

export function createAuditPeerConnection(iceServers: RTCIceServer[]): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize: 4,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });
}
