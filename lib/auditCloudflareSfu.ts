import {
  parseSessionDescription,
  sfuNewSession,
  sfuRenegotiate,
  sfuTracksNew,
  type SfuSend,
} from "@/lib/cloudflareSfuApi";

export type SfuSubscriberHint = {
  trackName: string;
  publisherSessionId: string;
  stunUrl?: string;
  providerLane?: number;
  providerLanes?: number[];
};

function stunIce(stunUrl?: string): RTCIceServer[] {
  const url = stunUrl?.trim() || "stun:stun.cloudflare.com:3478";
  return [{ urls: url }];
}

function lanesToTry(hint: SfuSubscriberHint): number[] {
  const fromHint = hint.providerLanes?.filter((n) => n === 1 || n === 2) ?? [];
  if (fromHint.length) return [...new Set(fromHint)];
  if (hint.providerLane === 1 || hint.providerLane === 2) {
    return [hint.providerLane, hint.providerLane === 1 ? 2 : 1];
  }
  return [1, 2];
}

async function subscribeOnLane(
  send: SfuSend,
  hint: SfuSubscriberHint,
  lane: number,
  onStream: (stream: MediaStream) => void,
): Promise<() => void> {
  const { sessionId, lane: stickyLane } = await sfuNewSession(send, lane);
  const pc = new RTCPeerConnection({ iceServers: stunIce(hint.stunUrl) });

  const cleanup = () => {
    try {
      pc.close();
    } catch {
      /* ignore */
    }
  };

  pc.ontrack = (ev) => {
    const stream = ev.streams[0] ?? new MediaStream([ev.track]);
    onStream(stream);
  };

  pc.onicecandidate = () => {
    if (!pc.localDescription?.sdp) return;
    void sfuRenegotiate(
      send,
      sessionId,
      { sessionDescription: { type: "offer", sdp: pc.localDescription.sdp } },
      stickyLane,
    ).catch(() => {});
  };

  const pushRes = await sfuTracksNew(
    send,
    sessionId,
    {
      tracks: [
        {
          location: "remote",
          trackName: hint.trackName,
          sessionId: hint.publisherSessionId,
        },
      ],
    },
    stickyLane,
  );

  const remoteDesc = parseSessionDescription(pushRes.sessionDescription);
  if (!remoteDesc) throw new Error("SFU pull missing sessionDescription");

  await pc.setRemoteDescription(new RTCSessionDescription(remoteDesc));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await sfuRenegotiate(send, sessionId, {
    sessionDescription: { type: answer.type, sdp: answer.sdp },
  }, stickyLane);

  return cleanup;
}

/** Pull a remote published track from Cloudflare SFU (tries lane 1 then 2). */
export async function subscribeCloudflareSfu(
  send: SfuSend,
  hint: SfuSubscriberHint,
  onStream: (stream: MediaStream) => void,
): Promise<() => void> {
  let lastErr: unknown;
  for (const lane of lanesToTry(hint)) {
    try {
      return await subscribeOnLane(send, hint, lane, onStream);
    } catch (err) {
      lastErr = err;
      send({
        type: "media-provider-failed",
        providerLane: lane,
        reason: err instanceof Error ? err.message : "sfu_subscribe_failed",
      });
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("all SFU lanes failed");
}
