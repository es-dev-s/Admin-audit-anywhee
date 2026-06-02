/** Parses signaling-server `streamTransport` and applies two-phase ICE (STUN → TURN). */

import type { SfuSubscriberHint } from "@/lib/auditCloudflareSfu";

export type StreamTransportMode = "p2p-preferred" | "turn-relay" | "sfu";

export type StreamSfuHint = {
  enabled?: boolean;
  role?: "publisher" | "subscriber";
  trackName?: string;
  publisherSessionId?: string;
  stunUrl?: string;
  publisherClientId?: number;
  providerLane?: number;
  providerLanes?: number[];
  fallbackModes?: string[];
};

export type StreamTransportPlan = {
  version?: number;
  mode?: StreamTransportMode;
  phaseOneMs?: number;
  iceServers?: RTCIceServer[];
  iceServersStunOnly?: RTCIceServer[];
  iceServersFull?: RTCIceServer[];
  sfu?: StreamSfuHint;
};

function normalizeIceEntry(raw: unknown): RTCIceServer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const urls = o.urls;
  if (typeof urls !== "string" && !Array.isArray(urls)) return null;
  const out: RTCIceServer = { urls: urls as RTCIceServer["urls"] };
  if (typeof o.username === "string" && o.username) out.username = o.username;
  if (typeof o.credential === "string" && o.credential) out.credential = o.credential;
  return out;
}

function normalizeIceList(raw: unknown): RTCIceServer[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeIceEntry).filter((s): s is RTCIceServer => s !== null);
}

export function parseStreamTransport(msg: Record<string, unknown>): StreamTransportPlan | null {
  const st = msg.streamTransport;
  if (!st || typeof st !== "object") return null;
  const o = st as Record<string, unknown>;
  let sfu: StreamSfuHint | undefined;
  if (o.sfu && typeof o.sfu === "object") {
    const s = o.sfu as Record<string, unknown>;
    sfu = {
      enabled: s.enabled === true,
      role: s.role === "publisher" || s.role === "subscriber" ? s.role : undefined,
      trackName: typeof s.trackName === "string" ? s.trackName : undefined,
      publisherSessionId:
        typeof s.publisherSessionId === "string" ? s.publisherSessionId : undefined,
      stunUrl: typeof s.stunUrl === "string" ? s.stunUrl : undefined,
      publisherClientId:
        typeof s.publisherClientId === "number" ? s.publisherClientId : undefined,
      providerLane:
        typeof s.providerLane === "number" && (s.providerLane === 1 || s.providerLane === 2)
          ? s.providerLane
          : undefined,
      providerLanes: Array.isArray(s.providerLanes)
        ? (s.providerLanes as unknown[]).filter(
            (n): n is number => typeof n === "number" && (n === 1 || n === 2),
          )
        : undefined,
      fallbackModes: Array.isArray(s.fallbackModes)
        ? (s.fallbackModes as unknown[]).filter((m): m is string => typeof m === "string")
        : undefined,
    };
  }
  return {
    version: typeof o.version === "number" ? o.version : undefined,
    mode: typeof o.mode === "string" ? (o.mode as StreamTransportMode) : undefined,
    phaseOneMs: typeof o.phaseOneMs === "number" ? o.phaseOneMs : undefined,
    iceServers: normalizeIceList(o.iceServers),
    iceServersStunOnly: normalizeIceList(o.iceServersStunOnly),
    iceServersFull: normalizeIceList(o.iceServersFull),
    sfu,
  };
}

export function sfuSubscriberHint(
  plan: StreamTransportPlan | null,
  publisherSessionId?: string,
): SfuSubscriberHint | null {
  const sfu = plan?.sfu;
  if (!sfu?.enabled || sfu.role !== "subscriber") return null;
  const trackName = sfu.trackName?.trim();
  const pubSid = (publisherSessionId || sfu.publisherSessionId || "").trim();
  if (!trackName || !pubSid) return null;
  return {
    trackName,
    publisherSessionId: pubSid,
    stunUrl: sfu.stunUrl,
    providerLane: sfu.providerLane,
    providerLanes: sfu.providerLanes,
  };
}

export function applyStreamTransportToRefs(
  plan: StreamTransportPlan | null,
  iceServersRef: { current: RTCIceServer[] },
  stunOnlyRef: { current: RTCIceServer[] },
  fullRef: { current: RTCIceServer[] },
): void {
  const full =
    (plan?.iceServersFull?.length ? plan.iceServersFull : null) ??
    (plan?.iceServers?.length ? plan.iceServers : null);
  const stun =
    (plan?.iceServersStunOnly?.length ? plan.iceServersStunOnly : null) ?? full;
  if (full?.length) {
    fullRef.current = full;
    iceServersRef.current =
      plan?.mode === "p2p-preferred" && stun?.length ? stun : full;
  }
  if (stun?.length) stunOnlyRef.current = stun;
}

/** Two-phase ICE on an audit viewer PeerConnection. */
export function attachIcePhases(
  pc: RTCPeerConnection,
  stunOnly: RTCIceServer[],
  full: RTCIceServer[],
  phaseOneMs = 5000,
): () => void {
  let phase: 1 | 2 = 1;
  let resolved = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const toPhase2 = () => {
    if (phase === 2 || resolved) return;
    phase = 2;
    cleanup();
    try {
      pc.setConfiguration({ iceServers: full, iceTransportPolicy: "all" });
    } catch {
      /* ignore */
    }
  };

  const onState = () => {
    if (resolved) return;
    if (pc.connectionState === "connected") {
      resolved = true;
      cleanup();
      return;
    }
    if (pc.connectionState === "failed" && phase === 1) toPhase2();
  };

  try {
    pc.setConfiguration({
      iceServers: stunOnly.length ? stunOnly : full,
      iceTransportPolicy: "all",
    });
  } catch {
    /* ignore */
  }

  timer = setTimeout(() => {
    if (!resolved && phase === 1) toPhase2();
  }, phaseOneMs);

  pc.addEventListener("connectionstatechange", onState);
  return () => {
    cleanup();
    pc.removeEventListener("connectionstatechange", onState);
  };
}
