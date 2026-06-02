/** Server-proxied Cloudflare Realtime SFU (token stays on signaling server). */

export type SfuSend = (payload: Record<string, unknown>) => void;

type Pending = {
  resolve: (msg: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, Pending>();

function rid(): string {
  return `sfu-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function handleSfuApiResponse(msg: Record<string, unknown>): boolean {
  if (msg.type !== "sfu-api-response") return false;
  const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
  const p = requestId ? pending.get(requestId) : undefined;
  if (!p) return true;
  clearTimeout(p.timer);
  pending.delete(requestId);
  if (msg.success === true) p.resolve(msg);
  else p.reject(new Error(typeof msg.error === "string" ? msg.error : "SFU API failed"));
  return true;
}

function callSfu(
  send: SfuSend,
  op: string,
  extra: Record<string, unknown> = {},
  providerLane?: number,
): Promise<Record<string, unknown>> {
  const requestId = rid();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`SFU ${op} timeout`));
    }, 22000);
    pending.set(requestId, { resolve, reject, timer });
    send({
      type: "sfu-api",
      requestId,
      op,
      ...(providerLane === 1 || providerLane === 2 ? { providerLane } : {}),
      ...extra,
    });
  });
}

function laneFromResponse(res: Record<string, unknown>, fallback: number): number {
  const n = res.providerLane;
  return typeof n === "number" && (n === 1 || n === 2) ? n : fallback;
}

export async function sfuNewSession(send: SfuSend, lane: number): Promise<{ sessionId: string; lane: number }> {
  const res = await callSfu(send, "sessions-new", {}, lane);
  const sid = res.sessionId;
  if (typeof sid !== "string" || !sid) throw new Error("missing sessionId");
  return { sessionId: sid, lane: laneFromResponse(res, lane) };
}

export async function sfuTracksNew(
  send: SfuSend,
  sessionId: string,
  body: Record<string, unknown>,
  lane: number,
): Promise<Record<string, unknown>> {
  const res = await callSfu(send, "tracks-new", { sessionId, body }, lane);
  const data = res.data;
  if (!data || typeof data !== "object") throw new Error("missing tracks-new data");
  return data as Record<string, unknown>;
}

export async function sfuRenegotiate(
  send: SfuSend,
  sessionId: string,
  body: Record<string, unknown>,
  lane: number,
): Promise<Record<string, unknown>> {
  const res = await callSfu(send, "renegotiate", { sessionId, body }, lane);
  const data = res.data;
  if (!data || typeof data !== "object") throw new Error("missing renegotiate data");
  return data as Record<string, unknown>;
}

export function parseSessionDescription(raw: unknown): RTCSessionDescriptionInit | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sdp = typeof o.sdp === "string" ? o.sdp : "";
  const type = o.type === "offer" || o.type === "answer" ? o.type : null;
  if (!sdp || !type) return null;
  return { type, sdp };
}
