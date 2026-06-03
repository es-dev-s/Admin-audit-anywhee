"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useToast } from "@/components/ui/toast-context";
import { type AuditLiveClient, type AuditOrg } from "@/lib/auditTypes";
import { useAuth } from "@/context/auth-context";
import { apiGetMe } from "@/lib/authClient";
import {
  filterSignalingRosterForMember,
  filterSignalingRosterForTeamLead,
} from "@/lib/auditScopeFilter";
import type { MergedAccessGrant } from "@/lib/accessGrantTypes";
import type { BrowserTabAnalyticsSnapshot } from "@/lib/browserTabAnalyticsTypes";
import { parseBrowserTabRow, parseInteractionEvent } from "@/lib/browserTabAnalyticsTypes";
import { resolveSignalingWssUrl } from "@/lib/signalingWsUrl";
import {
  createAuditPeerConnection,
  createCandidateDedupeSet,
  safeAddIceCandidate,
} from "@/lib/auditWebrtc";
import {
  countActiveStreamInterests,
  MAX_CONCURRENT_ACTIVE_STREAMS,
  MAX_PARALLEL_STREAM_CONNECTS,
  STREAM_CONNECT_STAGGER_MS,
} from "@/lib/auditStreamLimits";
import {
  auditStreamViewKey,
  clientIdFromViewKey,
  type AuditStreamViewOptions,
} from "@/lib/auditStreamViewKey";
import { streamSignalingKey } from "@/lib/streamSignalingKey";

import {
  applyStreamTransportToRefs,
  attachIcePhases,
  parseStreamTransport,
  sfuSubscriberHint,
  type StreamTransportPlan,
} from "@/lib/auditStreamTransport";
import { handleSfuApiResponse } from "@/lib/cloudflareSfuApi";
import { subscribeCloudflareSfu } from "@/lib/auditCloudflareSfu";

const DEFAULT_ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const STREAM_CONNECT_TIMEOUT_MS = 45_000;
const CONNECT_COOLDOWN_MS = 1200;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseScreenSources(raw: unknown): AuditLiveClient["screenSources"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => isRecord(s))
    .map((s) => ({
      id: typeof s.id === "string" ? s.id : "",
      name: typeof s.name === "string" ? s.name : "",
      index: Number.isFinite(Number(s.index)) ? Math.trunc(Number(s.index)) : null,
    }))
    .filter((s) => s.id && s.name)
    .slice(0, 8);
}

function parseClientRow(raw: unknown): AuditLiveClient | null {
  if (!isRecord(raw)) return null;
  const id = Number(raw.id);
  const orgId = Number(raw.orgId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(orgId)) return null;
  const fullName = typeof raw.fullName === "string" ? raw.fullName : "";
  if (!fullName) return null;
  const status = typeof raw.status === "string" ? raw.status : "offline";
  const orgName = typeof raw.orgName === "string" ? raw.orgName : null;
  const claimedRaw = raw.claimedOrgName;
  const claimedOrgName =
    typeof claimedRaw === "string" && claimedRaw.trim() ? claimedRaw.trim() : null;
  const device =
    typeof raw.device === "string"
      ? raw.device
      : typeof raw.deviceId === "string"
        ? raw.deviceId
        : null;
  const email = typeof raw.email === "string" ? raw.email : null;
  return {
    id,
    fullName,
    status,
    orgId,
    orgName,
    ...(claimedOrgName ? { claimedOrgName } : {}),
    ...(device ? { device } : {}),
    ...(email ? { email } : {}),
    screenSources: parseScreenSources(raw.screenSources),
  };
}

function parseOrg(raw: unknown): AuditOrg | null {
  if (!isRecord(raw)) return null;
  const id = Number(raw.id);
  const name = typeof raw.name === "string" ? raw.name : "";
  if (!Number.isFinite(id) || !name) return null;
  return { id, name };
}

function normalizeMemberScope(raw: unknown): MergedAccessGrant | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const arr = (x: unknown) =>
    Array.isArray(x) ? x.map((v) => String(v)).filter(Boolean) : [];
  return {
    team_ids: arr(o.team_ids),
    member_ids: arr(o.member_ids),
    signaling_org_ids: arr(o.signaling_org_ids),
    signal_client_ids: arr(o.signal_client_ids),
  };
}

export type TeamLeadOrgAccessStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "revoked";

export type TeamLeadOrgAccessState = {
  loaded: boolean;
  statusForOrg: (orgId: number) => TeamLeadOrgAccessStatus;
  approvedOrgIds: Set<number>;
  refresh: () => void;
};

export type AuditSignalingContextValue = {
  connectionStatus: string;
  adminRole: string | null;
  homeOrgName: string | null;
  orgs: AuditOrg[];
  clients: AuditLiveClient[];
  streams: Map<string, MediaStream>;
  getStream: (
    clientId: number,
    opts?: AuditStreamViewOptions
  ) => MediaStream | undefined;
  /** Latest browser/extension tab snapshot per enrolled client (from `browser-tab-events-update`). */
  browserTabAnalyticsByClientId: Map<number, BrowserTabAnalyticsSnapshot>;
  getBrowserTabAnalytics: (clientId: number) => BrowserTabAnalyticsSnapshot | undefined;
  /** Ref-counted: increment when a surface needs a live stream; decrements on release. */
  acquireStream: (clientId: number, opts?: AuditStreamViewOptions) => void;
  releaseStream: (clientId: number, opts?: AuditStreamViewOptions) => void;
  getClient: (clientId: number) => AuditLiveClient | undefined;
  /** Ask the viewed member’s desktop app to show and focus (requires active stream session). */
  requestClientAppFocus: (clientId: number) => void;
  /** Present only for audit team leads: super-admin approval per signaling org. */
  teamLeadOrgAccess: TeamLeadOrgAccessState | null;
  /** Admin-assigned groups for this team lead (group scope). Empty if no groups assigned. */
  assignedGroups: Array<{ id: string; name: string; description: string | null; signalClientIds: number[] }>;
  /**
   * Signaling HTTP API (`GET /api/browser-tab-events`, etc.) — set after WebSocket `admin-login-response`.
   * Pass as `x-signaling-session` to `/api/audit/browser-extension-timeline` (server proxies to signaling).
   */
  signalingSessionToken: string | null;
};

const AuditSignalingContext = createContext<AuditSignalingContextValue | null>(null);

/** Sidebar-only: updates when admin-assigned groups change, not on every roster tick. */
export type AssignedAuditGroup = AuditSignalingContextValue["assignedGroups"][number];

export type AssignedGroupsScope = {
  groups: AssignedAuditGroup[];
  /** False for team leads until group scope API finishes (avoids sidebar flicker). */
  ready: boolean;
  hasGroupScope: boolean;
};

const defaultAssignedGroupsScope: AssignedGroupsScope = {
  groups: [],
  ready: true,
  hasGroupScope: false,
};

const AssignedGroupsContext = createContext<AssignedGroupsScope>(defaultAssignedGroupsScope);

export function useAssignedGroups(): AssignedAuditGroup[] {
  return useContext(AssignedGroupsContext).groups;
}

export function useAssignedGroupsScope(): AssignedGroupsScope {
  return useContext(AssignedGroupsContext);
}

/** Use in layouts without `AuditSignalingProvider` (e.g. team-lead). */
export function useOptionalAuditSignaling(): AuditSignalingContextValue | null {
  return useContext(AuditSignalingContext);
}

export function useAuditSignaling(): AuditSignalingContextValue {
  const ctx = useContext(AuditSignalingContext);
  if (!ctx) {
    throw new Error("useAuditSignaling must be used within AuditSignalingProvider");
  }
  return ctx;
}

type TlAccessInternal = {
  loaded: boolean;
  byOrg: Map<number, Exclude<TeamLeadOrgAccessStatus, "none">>;
  approved: Set<number>;
  /** When non-null, only these client ids are visible (admin-group scope). */
  allowedClientIds: Set<number> | null;
  /** Admin-assigned group names + per-group client ids for display. */
  groups: Array<{ id: string; name: string; description: string | null; signalClientIds: number[] }>;
  hasGroupScope: boolean;
};

export function AuditSignalingProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);
  const { state: authState } = useAuth();
  const [memberScope, setMemberScope] = useState<MergedAccessGrant | null>(null);
  const [tlAccess, setTlAccess] = useState<TlAccessInternal>({
    loaded: false,
    byOrg: new Map(),
    approved: new Set(),
    allowedClientIds: null,
    groups: [],
    hasGroupScope: false,
  });

  useEffect(() => {
    if (authState.status !== "authenticated") {
      setMemberScope(null);
      return;
    }
    if (authState.user.role !== "audit_member") {
      setMemberScope(null);
      return;
    }
    let cancelled = false;
    apiGetMe()
      .then((r) => {
        if (!cancelled) setMemberScope(normalizeMemberScope(r.scope));
      })
      .catch(() => {
        if (!cancelled) setMemberScope(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    authState.status,
    authState.status === "authenticated" ? authState.user.id : "",
    authState.status === "authenticated" ? authState.user.role : "",
  ]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const unmountedRef = useRef(false);
  const connectCooldownByClientRef = useRef<Map<number, number>>(new Map());
  const sessionTokenRef = useRef<string | null>(null);
  const [signalingSessionToken, setSignalingSessionToken] = useState<string | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const iceStunOnlyRef = useRef<RTCIceServer[]>([]);
  const iceFullRef = useRef<RTCIceServer[]>([]);
  const icePhaseCleanupByViewKeyRef = useRef<Map<string, () => void>>(new Map());
  const pcByViewKeyRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const clientSocketByViewKeyRef = useRef<Map<string, string>>(new Map());
  const pendingViewKeyByClientRef = useRef<Map<number, string[]>>(new Map());
  const activeSessionIdByViewKeyRef = useRef<Map<string, number>>(new Map());
  const interestRef = useRef<Map<string, number>>(new Map());
  const prefsRef = useRef<Map<string, AuditStreamViewOptions>>(new Map());
  const streamTimeoutByViewKeyRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const streamTrackReceivedRef = useRef<Set<string>>(new Set());
  const connectRetryCountRef = useRef<Map<string, number>>(new Map());
  const connectRetryTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const connectQueueRef = useRef<string[]>([]);
  const connectQueueScheduledRef = useRef(false);
  /** View keys with an outstanding connect-to-client (parallel cap uses Set size). */
  const connectInFlightKeysRef = useRef<Set<string>>(new Set());
  /** Incremented on releaseStream so late start-offer from a prior cycle is ignored. */
  const connectGenRef = useRef<Map<string, number>>(new Map());
  /** Generation captured when connect-to-client is sent for a viewKey. */
  const connectGenAtStartRef = useRef<Map<string, number>>(new Map());
  /** Pairs the latest connect-to-client request with its viewKey until connect-response. */
  const lastConnectViewKeyByClientRef = useRef<Map<number, string>>(new Map());
  const iceDedupByViewKeyRef = useRef<Map<string, Set<string>>>(new Map());
  const pendingIceByViewKeyRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const sfuCleanupByViewKeyRef = useRef<Map<string, () => void>>(new Map());
  const pendingSfuByViewKeyRef = useRef<
    Map<string, { clientSocketId: string; clientId: number; plan: StreamTransportPlan }>
  >(new Map());

  const [connectionStatus, setConnectionStatus] = useState("Initializing…");
  const connectionStatusRef = useRef(connectionStatus);
  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [homeOrgName, setHomeOrgName] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<AuditOrg[]>([]);
  const [clients, setClients] = useState<AuditLiveClient[]>([]);
  const [streams, setStreams] = useState<Map<string, MediaStream>>(new Map());
  const [browserTabAnalyticsByClientId, setBrowserTabAnalyticsByClientId] = useState<
    Map<number, BrowserTabAnalyticsSnapshot>
  >(() => new Map());

  const send = useCallback((payload: Record<string, unknown>) => {
    const sock = wsRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    sock.send(JSON.stringify(payload));
  }, []);

  const teardownMeshPeerForViewKey = useCallback((viewKey: string) => {
    icePhaseCleanupByViewKeyRef.current.get(viewKey)?.();
    icePhaseCleanupByViewKeyRef.current.delete(viewKey);
    const pc = pcByViewKeyRef.current.get(viewKey);
    if (pc) {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      pcByViewKeyRef.current.delete(viewKey);
    }
    iceDedupByViewKeyRef.current.delete(viewKey);
    pendingIceByViewKeyRef.current.delete(viewKey);
    activeSessionIdByViewKeyRef.current.delete(viewKey);
  }, []);

  const hasActiveInterestForClientId = useCallback((clientId: number) => {
    for (const [viewKey, n] of interestRef.current.entries()) {
      if (clientIdFromViewKey(viewKey) === clientId && n > 0) {
        return true;
      }
    }
    return false;
  }, []);

  const teardownPeerForClientSocket = useCallback(
    (clientSocketId: string) => {
      for (const [viewKey, sid] of [...clientSocketByViewKeyRef.current.entries()]) {
        if (sid === clientSocketId) teardownMeshPeerForViewKey(viewKey);
      }
    },
    [teardownMeshPeerForViewKey],
  );

  const removeFromConnectQueue = useCallback((viewKey: string) => {
    connectQueueRef.current = connectQueueRef.current.filter((k) => k !== viewKey);
  }, []);

  const enqueueConnect = useCallback((viewKey: string) => {
    const clientId = clientIdFromViewKey(viewKey);
    if (!Number.isFinite(clientId) || clientId <= 0) return;
    const q = connectQueueRef.current;
    if (!q.includes(viewKey)) q.push(viewKey);
  }, []);

  const clearStreamConnectTimeout = useCallback((viewKey: string) => {
    const t = streamTimeoutByViewKeyRef.current.get(viewKey);
    if (t) {
      clearTimeout(t);
      streamTimeoutByViewKeyRef.current.delete(viewKey);
    }
  }, []);

  const teardownSfuForViewKey = useCallback((viewKey: string) => {
    pendingSfuByViewKeyRef.current.delete(viewKey);
    const cleanup = sfuCleanupByViewKeyRef.current.get(viewKey);
    if (cleanup) {
      try {
        cleanup();
      } catch {
        /* ignore */
      }
      sfuCleanupByViewKeyRef.current.delete(viewKey);
    }
  }, []);

  const teardownPeerForViewKey = useCallback(
    (viewKey: string) => {
      clearStreamConnectTimeout(viewKey);
      streamTrackReceivedRef.current.delete(viewKey);
      teardownSfuForViewKey(viewKey);
      teardownMeshPeerForViewKey(viewKey);
      clientSocketByViewKeyRef.current.delete(viewKey);
      setStreams((prev) => {
        if (!prev.has(viewKey)) return prev;
        const next = new Map(prev);
        next.delete(viewKey);
        return next;
      });
    },
    [clearStreamConnectTimeout, teardownMeshPeerForViewKey, teardownSfuForViewKey],
  );

  const teardownAllViewsForClientId = useCallback(
    (clientId: number) => {
      for (const viewKey of [...clientSocketByViewKeyRef.current.keys()]) {
        if (clientIdFromViewKey(viewKey) === clientId) {
          teardownPeerForViewKey(viewKey);
        }
      }
      for (const viewKey of [...interestRef.current.keys()]) {
        if (clientIdFromViewKey(viewKey) === clientId) {
          interestRef.current.delete(viewKey);
          prefsRef.current.delete(viewKey);
        }
      }
      pendingViewKeyByClientRef.current.delete(clientId);
    },
    [teardownPeerForViewKey],
  );

  const clearConnectRetry = useCallback((viewKey: string) => {
    connectRetryCountRef.current.delete(viewKey);
    const t = connectRetryTimerRef.current.get(viewKey);
    if (t) {
      clearTimeout(t);
      connectRetryTimerRef.current.delete(viewKey);
    }
  }, []);

  const removePendingViewKey = useCallback((clientId: number, viewKey: string) => {
    if (!Number.isFinite(clientId) || clientId <= 0) return;
    const q = pendingViewKeyByClientRef.current.get(clientId) ?? [];
    const idx = q.indexOf(viewKey);
    if (idx !== -1) {
      const next = [...q];
      next.splice(idx, 1);
      if (next.length) pendingViewKeyByClientRef.current.set(clientId, next);
      else pendingViewKeyByClientRef.current.delete(clientId);
    }
  }, []);

  const popPendingViewKey = useCallback((clientId: number): string | null => {
    const q = pendingViewKeyByClientRef.current.get(clientId);
    if (!q?.length) return null;
    const viewKey = q.shift()!;
    if (!q.length) pendingViewKeyByClientRef.current.delete(clientId);
    else pendingViewKeyByClientRef.current.set(clientId, q);
    return viewKey;
  }, []);

  const failClientStream = useCallback(
    (viewKey: string, message: string) => {
      const clientId = clientIdFromViewKey(viewKey);
      if (!Number.isFinite(clientId) || clientId <= 0) return;
      clearConnectRetry(viewKey);
      connectInFlightKeysRef.current.delete(viewKey);
      pumpConnectQueue();
      connectGenAtStartRef.current.delete(viewKey);
      lastConnectViewKeyByClientRef.current.delete(clientId);
      interestRef.current.delete(viewKey);
      connectCooldownByClientRef.current.delete(clientId);
      teardownPeerForViewKey(viewKey);
      showToastRef.current(message, "error");
    },
    [clearConnectRetry, teardownPeerForViewKey],
  );

  const startMeshView = useCallback(
    async (
      viewKey: string,
      clientSocketId: string,
      clientId: number,
      transportPlan: StreamTransportPlan | null,
    ) => {
      teardownSfuForViewKey(viewKey);
      const ice = iceServersRef.current.length > 0 ? iceServersRef.current : DEFAULT_ICE;
      const stunOnly = iceStunOnlyRef.current.length > 0 ? iceStunOnlyRef.current : ice;
      const fullIce = iceFullRef.current.length > 0 ? iceFullRef.current : ice;
      teardownMeshPeerForViewKey(viewKey);
      const pc = createAuditPeerConnection(ice);
      pcByViewKeyRef.current.set(viewKey, pc);
      const mode = transportPlan?.mode === "turn-relay" ? "turn-relay" : transportPlan?.mode;
      if (mode === "p2p-preferred" || !mode) {
        const cleanup = attachIcePhases(pc, stunOnly, fullIce, transportPlan?.phaseOneMs ?? 5000);
        icePhaseCleanupByViewKeyRef.current.set(viewKey, cleanup);
      } else {
        icePhaseCleanupByViewKeyRef.current.delete(viewKey);
      }
      iceDedupByViewKeyRef.current.set(viewKey, createCandidateDedupeSet());
      pendingIceByViewKeyRef.current.set(viewKey, []);
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.ontrack = (trackEvent) => {
        const stream = trackEvent.streams[0] ?? new MediaStream([trackEvent.track]);
        const resolvedViewKey = viewKey;
        if (!resolvedViewKey) return;
        streamTrackReceivedRef.current.add(resolvedViewKey);
        clearStreamConnectTimeout(resolvedViewKey);
        setStreams((prev) => {
          const next = new Map(prev);
          next.set(resolvedViewKey, stream);
          return next;
        });
        const cid = clientIdFromViewKey(resolvedViewKey);
        if (Number.isFinite(cid) && cid > 0) {
          const remaining = pendingViewKeyByClientRef.current.get(cid) ?? [];
          const nextKey = remaining.find(
            (k) =>
              (interestRef.current.get(k) ?? 0) > 0 && !clientSocketByViewKeyRef.current.has(k),
          );
          if (nextKey) queueMicrotask(() => connectSignalingRequestRef.current(nextKey));
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState !== "failed" && pc.connectionState !== "disconnected") return;
        const vk = viewKey;
        if (streamTrackReceivedRef.current.has(vk)) return;
        failClientStream(vk, `WebRTC ${pc.connectionState} — check TURN on signaling server.`);
      };
      pc.onicecandidate = (iceEvent) => {
        if (!iceEvent.candidate) return;
        const sid = activeSessionIdByViewKeyRef.current.get(viewKey);
        send({
          type: "ice-candidate",
          targetSocketId: clientSocketId,
          streamKey: viewKey,
          ...(sid ? { sessionId: sid } : {}),
          candidate: iceEvent.candidate.toJSON(),
        });
      };
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const pref = viewKey ? prefsRef.current.get(viewKey) : undefined;
        const sid = activeSessionIdByViewKeyRef.current.get(viewKey);
        send({
          type: "offer",
          targetSocketId: clientSocketId,
          streamKey: viewKey,
          ...(sid ? { sessionId: sid } : {}),
          sdp: offer,
          ...(pref?.preferredSourceId ? { preferredSourceId: pref.preferredSourceId } : {}),
          ...(pref?.preferredSourceIndex != null
            ? { preferredSourceIndex: pref.preferredSourceIndex }
            : {}),
        });
      } catch (e) {
        console.error("[audit] createOffer failed", e);
      }
    },
    [
      clearStreamConnectTimeout,
      failClientStream,
      send,
      teardownMeshPeerForViewKey,
      teardownSfuForViewKey,
    ],
  );

  const startSfuView = useCallback(
    async (
      viewKey: string,
      clientSocketId: string,
      clientId: number,
      plan: StreamTransportPlan | null,
      publisherSessionId?: string,
      publisherLane?: number,
    ) => {
      const hint = sfuSubscriberHint(plan, publisherSessionId);
      if (!hint) {
        pendingSfuByViewKeyRef.current.set(viewKey, { clientSocketId, clientId, plan: plan ?? {} });
        return;
      }
      if (publisherLane === 1 || publisherLane === 2) {
        hint.providerLane = publisherLane;
      }
      pendingSfuByViewKeyRef.current.delete(viewKey);
      teardownSfuForViewKey(viewKey);
      teardownMeshPeerForViewKey(viewKey);
      try {
        const cleanup = await subscribeCloudflareSfu(send, hint, (stream) => {
          streamTrackReceivedRef.current.add(viewKey);
          clearStreamConnectTimeout(viewKey);
          setStreams((prev) => {
            const next = new Map(prev);
            next.set(viewKey, stream);
            return next;
          });
          const remaining = pendingViewKeyByClientRef.current.get(clientId) ?? [];
          const nextKey = remaining.find(
            (k) =>
              (interestRef.current.get(k) ?? 0) > 0 &&
              !clientSocketByViewKeyRef.current.has(k),
          );
          if (nextKey) queueMicrotask(() => connectSignalingRequestRef.current(nextKey));
        });
        sfuCleanupByViewKeyRef.current.set(viewKey, cleanup);
      } catch (e) {
        console.warn("[audit] SFU lanes failed, falling back to TURN/mesh", e);
        const fallbackPlan: StreamTransportPlan = {
          ...(plan ?? {}),
          mode: "turn-relay",
          sfu: undefined,
        };
        applyStreamTransportToRefs(fallbackPlan, iceServersRef, iceStunOnlyRef, iceFullRef);
        await startMeshView(viewKey, clientSocketId, clientId, fallbackPlan);
      }
    },
    [
      clearStreamConnectTimeout,
      send,
      startMeshView,
      teardownMeshPeerForViewKey,
      teardownSfuForViewKey,
    ],
  );

  const scheduleConnectRetry = useCallback(
    (viewKey: string, message: string) => {
      const clientId = clientIdFromViewKey(viewKey);
      if (!Number.isFinite(clientId) || clientId <= 0) return;
      if ((interestRef.current.get(viewKey) ?? 0) <= 0) return;

      const attempt = (connectRetryCountRef.current.get(viewKey) ?? 0) + 1;
      connectRetryCountRef.current.set(viewKey, attempt);
      if (attempt > 6) {
        failClientStream(viewKey, message);
        return;
      }

      if (attempt === 1) {
        showToastRef.current("Waiting for client on signaling — retrying…", "error");
      }

      const prev = connectRetryTimerRef.current.get(viewKey);
      if (prev) clearTimeout(prev);
      connectRetryTimerRef.current.set(
        viewKey,
        setTimeout(() => {
          connectRetryTimerRef.current.delete(viewKey);
          connectCooldownByClientRef.current.delete(clientId);
          connectSignalingRequestRef.current(viewKey);
        }, 2000),
      );
    },
    [failClientStream],
  );

  const armStreamConnectTimeout = useCallback(
    (viewKey: string) => {
      if (!viewKey) return;
      clearStreamConnectTimeout(viewKey);
      streamTimeoutByViewKeyRef.current.set(
        viewKey,
        setTimeout(() => {
          streamTimeoutByViewKeyRef.current.delete(viewKey);
          if (streamTrackReceivedRef.current.has(viewKey)) return;
          failClientStream(
            viewKey,
            "Stream timed out. Check the client app is online and signaling at your home server (port 18085).",
          );
        }, STREAM_CONNECT_TIMEOUT_MS),
      );
    },
    [clearStreamConnectTimeout, failClientStream],
  );

  const stopViewingServer = useCallback(
    (clientSocketId: string) => {
      const token = sessionTokenRef.current;
      if (!token) return;
      send({ type: "admin-stop-viewing", token, clientSocketId });
    },
    [send],
  );

  const connectSignalingRequestImmediate = useCallback(
    (viewKey: string) => {
      const clientId = clientIdFromViewKey(viewKey);
      if (!Number.isFinite(clientId) || clientId <= 0) return false;
      if (connectInFlightKeysRef.current.has(viewKey)) return false;
      const now = Date.now();
      const last = connectCooldownByClientRef.current.get(clientId) ?? 0;
      if (now - last < CONNECT_COOLDOWN_MS) return false;
      connectCooldownByClientRef.current.set(clientId, now);
      const token = sessionTokenRef.current;
      if (!token) {
        const status = connectionStatusRef.current;
        showToastRef.current(
          status === "Live"
            ? "Signaling session expired — refresh the page"
            : `Not connected to signaling (${status})`,
          "error",
        );
        return false;
      }
      connectGenAtStartRef.current.set(viewKey, connectGenRef.current.get(viewKey) ?? 0);
      connectInFlightKeysRef.current.add(viewKey);
      lastConnectViewKeyByClientRef.current.set(clientId, viewKey);
      const pending = pendingViewKeyByClientRef.current.get(clientId) ?? [];
      if (!pending.includes(viewKey)) pending.push(viewKey);
      pendingViewKeyByClientRef.current.set(clientId, pending);
      send({ type: "connect-to-client", token, clientId });
      return true;
    },
    [send],
  );

  const pumpConnectQueue = useCallback(() => {
    if (connectQueueScheduledRef.current) return;
    const run = () => {
      connectQueueScheduledRef.current = false;
      while (
        connectInFlightKeysRef.current.size < MAX_PARALLEL_STREAM_CONNECTS &&
        connectQueueRef.current.length > 0
      ) {
        const viewKey = connectQueueRef.current.shift();
        if (viewKey == null) break;
        if ((interestRef.current.get(viewKey) ?? 0) <= 0) continue;
        const started = connectSignalingRequestImmediate(viewKey);
        if (!started) {
          if ((interestRef.current.get(viewKey) ?? 0) > 0) {
            connectQueueRef.current.unshift(viewKey);
          }
        }
        if (
          connectQueueRef.current.length > 0 ||
          connectInFlightKeysRef.current.size >= MAX_PARALLEL_STREAM_CONNECTS
        ) {
          connectQueueScheduledRef.current = true;
          setTimeout(run, STREAM_CONNECT_STAGGER_MS);
          return;
        }
      }
      if (connectQueueRef.current.length > 0) {
        connectQueueScheduledRef.current = true;
        setTimeout(run, STREAM_CONNECT_STAGGER_MS);
      }
    };
    connectQueueScheduledRef.current = true;
    queueMicrotask(run);
  }, [connectSignalingRequestImmediate]);

  const finishConnectInFlight = useCallback(
    (clientId: number, viewKey?: string) => {
      const vk =
        viewKey ??
        (Number.isFinite(clientId) && clientId > 0
          ? lastConnectViewKeyByClientRef.current.get(clientId)
          : undefined);
      if (vk) connectInFlightKeysRef.current.delete(vk);
      if (Number.isFinite(clientId) && clientId > 0) {
        lastConnectViewKeyByClientRef.current.delete(clientId);
      }
      pumpConnectQueue();
    },
    [pumpConnectQueue],
  );

  const connectSignalingRequest = useCallback(
    (viewKey: string) => {
      enqueueConnect(viewKey);
      pumpConnectQueue();
    },
    [enqueueConnect, pumpConnectQueue],
  );

  const requestClientAppFocus = useCallback(
    (clientId: number) => {
      const token = sessionTokenRef.current;
      if (!token) {
        showToastRef.current("Not connected to signaling", "error");
        return;
      }
      if (!Number.isFinite(clientId) || clientId <= 0) return;
      send({ type: "admin-focus-client-app", token, clientId });
    },
    [send],
  );

  const connectSignalingRequestRef = useRef(connectSignalingRequest);

  useEffect(() => {
    connectSignalingRequestRef.current = connectSignalingRequest;
  }, [connectSignalingRequest]);

  const flushPendingConnects = useCallback(() => {
    connectCooldownByClientRef.current.clear();
    for (const [viewKey, n] of interestRef.current) {
      if (n > 0) enqueueConnect(viewKey);
    }
    pumpConnectQueue();
  }, [enqueueConnect, pumpConnectQueue]);

  const mergeOrgClients = useCallback((orgId: number, rows: unknown[]) => {
    const mapped = rows.map(parseClientRow).filter((c): c is AuditLiveClient => c !== null);
    setClients((prev) => {
      const rest = prev.filter((c) => c.orgId !== orgId);
      return [...rest, ...mapped].sort((a, b) => {
        const on = (a.orgName || "").localeCompare(b.orgName || "");
        if (on !== 0) return on;
        return a.fullName.localeCompare(b.fullName);
      });
    });
  }, []);

  const acquireStream = useCallback(
    (clientId: number, opts?: AuditStreamViewOptions) => {
      if (!Number.isFinite(clientId) || clientId <= 0) return;
      const viewKey = auditStreamViewKey(clientId, opts);
      prefsRef.current.set(viewKey, {
        preferredSourceId: opts?.preferredSourceId ?? null,
        preferredSourceIndex: opts?.preferredSourceIndex ?? null,
      });
      const prev = interestRef.current.get(viewKey) ?? 0;
      if (prev === 0) {
        const active = countActiveStreamInterests(interestRef.current);
        if (active >= MAX_CONCURRENT_ACTIVE_STREAMS) {
          showToastRef.current(
            `This tab supports up to ${MAX_CONCURRENT_ACTIVE_STREAMS} live streams. Disconnect one first.`,
            "error",
          );
          return;
        }
      }
      interestRef.current.set(viewKey, prev + 1);
      if (prev === 0) {
        connectSignalingRequest(viewKey);
      }
    },
    [connectSignalingRequest],
  );

  const releaseStream = useCallback(
    (clientId: number, opts?: AuditStreamViewOptions) => {
      const viewKey = auditStreamViewKey(clientId, opts);
      const n = (interestRef.current.get(viewKey) ?? 0) - 1;
      if (n <= 0) {
        interestRef.current.delete(viewKey);
        prefsRef.current.delete(viewKey);
        connectGenRef.current.set(viewKey, (connectGenRef.current.get(viewKey) ?? 0) + 1);
        connectGenAtStartRef.current.delete(viewKey);
        connectInFlightKeysRef.current.delete(viewKey);
        lastConnectViewKeyByClientRef.current.delete(clientId);
        pumpConnectQueue();
        removeFromConnectQueue(viewKey);
        removePendingViewKey(clientId, viewKey);
        const sid = clientSocketByViewKeyRef.current.get(viewKey);
        clientSocketByViewKeyRef.current.delete(viewKey);
        teardownPeerForViewKey(viewKey);
        if (sid) {
          queueMicrotask(() => {
            if (!hasActiveInterestForClientId(clientId)) {
              stopViewingServer(sid);
            }
          });
        }
        setStreams((prev) => {
          if (!prev.has(viewKey)) return prev;
          const next = new Map(prev);
          next.delete(viewKey);
          return next;
        });
      } else {
        interestRef.current.set(viewKey, n);
      }
    },
    [
      hasActiveInterestForClientId,
      pumpConnectQueue,
      removeFromConnectQueue,
      removePendingViewKey,
      stopViewingServer,
      teardownPeerForViewKey,
    ],
  );

  const getStream = useCallback(
    (clientId: number, opts?: AuditStreamViewOptions) => {
      return streams.get(auditStreamViewKey(clientId, opts));
    },
    [streams],
  );

  const emptyScope = useMemo<MergedAccessGrant>(
    () => ({
      team_ids: [],
      member_ids: [],
      signaling_org_ids: [],
      signal_client_ids: [],
    }),
    []
  );

  const scopeForFilter =
    authState.status === "authenticated" &&
    authState.user?.role === "audit_member"
      ? (memberScope ?? emptyScope)
      : null;

  const loadTeamLeadOrgAccess = useCallback(() => {
    // Primary: load admin-assigned group scope (signal_client_ids + signal_org_ids).
    fetch("/api/audit-groups/my-scope", { credentials: "include" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok: scopeOk, j: scopeJ }) => {
        const approved = new Set<number>();
        const byOrg = new Map<number, Exclude<TeamLeadOrgAccessStatus, "none">>();

        const scopeGroups = Array.isArray(scopeJ.groups)
          ? (scopeJ.groups as Array<{ id: string; name: string; description: string | null; signalClientIds: number[] }>)
          : [];
        const allowedClientIds: number[] = Array.isArray(scopeJ.signalClientIds)
          ? (scopeJ.signalClientIds as number[])
          : [];
        const hasAssignedGroups =
          scopeOk && (scopeGroups.length > 0 || allowedClientIds.length > 0);

        if (hasAssignedGroups) {
          for (const oid of (scopeJ.signalOrgIds ?? []) as number[]) {
            if (Number.isFinite(oid) && oid > 0) {
              approved.add(oid);
              byOrg.set(oid, "approved");
            }
          }
          setTlAccess({
            loaded: true,
            byOrg,
            approved,
            allowedClientIds: new Set(allowedClientIds),
            groups: scopeGroups,
            hasGroupScope: true,
          });
          return;
        }

        // Fallback: old team_lead_org_access request/approve flow.
        fetch("/api/team-lead-org-access", { credentials: "include" })
          .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
          .then(({ ok, j }) => {
            if (ok && Array.isArray(j.entries)) {
              for (const row of j.entries as Array<{ signalingOrgId?: number; status?: string }>) {
                const oid = Number(row.signalingOrgId);
                const st = row.status;
                if (!Number.isFinite(oid) || oid <= 0) continue;
                if (st === "pending" || st === "approved" || st === "rejected" || st === "revoked") {
                  byOrg.set(oid, st);
                  if (st === "approved") approved.add(oid);
                }
              }
            }
            setTlAccess({ loaded: true, byOrg, approved, allowedClientIds: null, groups: [], hasGroupScope: false });
          })
          .catch(() => {
            setTlAccess({ loaded: true, byOrg: new Map(), approved: new Set(), allowedClientIds: null, groups: [], hasGroupScope: false });
          });
      })
      .catch(() => {
        setTlAccess({ loaded: true, byOrg: new Map(), approved: new Set(), allowedClientIds: null, groups: [], hasGroupScope: false });
      });
  }, []);

  const tlAccessReset: TlAccessInternal = { loaded: false, byOrg: new Map(), approved: new Set(), allowedClientIds: null, groups: [], hasGroupScope: false };

  useEffect(() => {
    if (authState.status !== "authenticated") {
      setTlAccess(tlAccessReset);
      return;
    }
    if (authState.user.role !== "team_lead") {
      setTlAccess(tlAccessReset);
      return;
    }
    setTlAccess(tlAccessReset);
    loadTeamLeadOrgAccess();
  }, [
    authState.status,
    authState.status === "authenticated" ? authState.user.id : "",
    authState.status === "authenticated" ? authState.user.role : "",
    loadTeamLeadOrgAccess,
  ]);

  const teamLeadOrgAccess = useMemo((): TeamLeadOrgAccessState | null => {
    if (authState.status !== "authenticated" || authState.user.role !== "team_lead") {
      return null;
    }
    return {
      loaded: tlAccess.loaded,
      statusForOrg: (orgId: number) => tlAccess.byOrg.get(orgId) ?? "none",
      approvedOrgIds: tlAccess.approved,
      refresh: loadTeamLeadOrgAccess,
    };
  }, [authState, tlAccess, loadTeamLeadOrgAccess]);

  const { clients: visibleClients, orgs: visibleOrgs } = useMemo(() => {
    if (authState.status === "authenticated" && authState.user.role === "team_lead") {
      if (!tlAccess.loaded) return { clients: [], orgs };

      if (tlAccess.hasGroupScope && tlAccess.allowedClientIds != null) {
        const allowed = tlAccess.allowedClientIds;
        const filtered = clients.filter((c) => allowed.has(Number(c.id)));
        const orgIds = new Set(filtered.map((c) => c.orgId));
        for (const oid of tlAccess.approved) {
          if (Number.isFinite(oid) && oid > 0) orgIds.add(oid);
        }
        return { clients: filtered, orgs: orgs.filter((o) => orgIds.has(o.id)) };
      }

      // Fallback: old org-level approval scope.
      return filterSignalingRosterForTeamLead(clients, orgs, tlAccess.approved);
    }
    return filterSignalingRosterForMember(clients, orgs, scopeForFilter);
  }, [
    authState,
    clients,
    orgs,
    scopeForFilter,
    tlAccess,
  ]);

  const getClient = useCallback(
    (clientId: number) => visibleClients.find((c) => c.id === clientId),
    [visibleClients],
  );

  const getBrowserTabAnalytics = useCallback(
    (clientId: number) => browserTabAnalyticsByClientId.get(clientId),
    [browserTabAnalyticsByClientId],
  );

  useEffect(() => {
    const wsUrl = resolveSignalingWssUrl();
    const wsConnectToken = process.env.NEXT_PUBLIC_WS_CONNECT_TOKEN ?? "";
    const auditOrgName = process.env.NEXT_PUBLIC_AUDIT_ORG_NAME ?? "default";
    const auditUsername = process.env.NEXT_PUBLIC_AUDIT_USERNAME ?? "";
    const auditPassword = process.env.NEXT_PUBLIC_AUDIT_PASSWORD ?? "";
    const missing = !auditUsername || !auditPassword;

    if (!wsUrl || missing) {
      queueMicrotask(() => {
        setConnectionStatus(
          !wsUrl ? "Missing NEXT_PUBLIC_ANYWHERE_SIGNALING_WSS" : "Missing audit credentials in .env",
        );
      });
      return;
    }

    unmountedRef.current = false;
    const connectUrl = new URL(wsUrl);
    if (wsConnectToken) connectUrl.searchParams.set("token", wsConnectToken);

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (unmountedRef.current) return;
      clearReconnectTimer();
      reconnectAttemptRef.current += 1;
      const attempt = reconnectAttemptRef.current;
      const delayMs = Math.min(15_000, 800 * Math.pow(2, attempt - 1));
      setConnectionStatus(`Reconnecting… (${attempt})`);
      reconnectTimerRef.current = setTimeout(() => {
        if (unmountedRef.current) return;
        connect();
      }, delayMs);
    };

    const connect = () => {
      if (unmountedRef.current) return;
      try {
        const prev = wsRef.current;
        if (prev) {
          prev.onopen = null;
          prev.onclose = null;
          prev.onerror = null;
          prev.onmessage = null;
          prev.close();
        }
      } catch {
        /* ignore */
      }
      setConnectionStatus("Connecting…");
      const sock = new WebSocket(connectUrl.toString());
      wsRef.current = sock;

      sock.onopen = () => {
        if (unmountedRef.current) return;
        reconnectAttemptRef.current = 0;
        clearReconnectTimer();
        setConnectionStatus("Authenticating…");
        send({
          type: "admin-login",
          orgName: auditOrgName,
          username: auditUsername,
          password: auditPassword,
        });
      };

      sock.onclose = () => {
        if (unmountedRef.current) return;
        setConnectionStatus("Socket disconnected");
        sessionTokenRef.current = null;
        setSignalingSessionToken(null);
        scheduleReconnect();
      };
      sock.onerror = () => {
        if (unmountedRef.current) return;
        setConnectionStatus("Socket error");
      };

      sock.onmessage = async (ev) => {
        if (unmountedRef.current) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = String(msg.type || "");

      switch (type) {
        case "welcome": {
          if (Array.isArray(msg.iceServers) && msg.iceServers.length > 0) {
            iceFullRef.current = msg.iceServers as RTCIceServer[];
          }
          applyStreamTransportToRefs(
            parseStreamTransport(msg),
            iceServersRef,
            iceStunOnlyRef,
            iceFullRef,
          );
          if (!iceServersRef.current.length && iceFullRef.current.length) {
            iceServersRef.current = iceFullRef.current;
          }
          break;
        }
        case "stream-transport-hint":
        case "stream-transport-upgrade": {
          applyStreamTransportToRefs(
            parseStreamTransport(msg),
            iceServersRef,
            iceStunOnlyRef,
            iceFullRef,
          );
          break;
        }
        case "sfu-api-response": {
          handleSfuApiResponse(msg);
          break;
        }
        case "sfu-publisher-ready": {
          const cid = Number(msg.clientId);
          const pubSid =
            typeof msg.publisherSessionId === "string" ? msg.publisherSessionId : "";
          if (!Number.isFinite(cid) || cid <= 0 || !pubSid) break;
          const pubLane =
            typeof msg.providerLane === "number" && (msg.providerLane === 1 || msg.providerLane === 2)
              ? msg.providerLane
              : undefined;
          for (const [viewKey, pending] of pendingSfuByViewKeyRef.current.entries()) {
            if (pending.clientId !== cid) continue;
            void startSfuView(viewKey, pending.clientSocketId, cid, pending.plan, pubSid, pubLane);
          }
          for (const [viewKey, sid] of clientSocketByViewKeyRef.current.entries()) {
            if (clientIdFromViewKey(viewKey) !== cid) continue;
            if (streamTrackReceivedRef.current.has(viewKey)) continue;
            const pending = pendingSfuByViewKeyRef.current.get(viewKey);
            void startSfuView(
              viewKey,
              sid,
              cid,
              pending?.plan ?? null,
              pubSid,
              pubLane,
            );
          }
          break;
        }
        case "admin-login-response": {
          if (msg.success !== true || typeof msg.token !== "string") {
            setConnectionStatus(typeof msg.message === "string" ? msg.message : "Login failed");
            scheduleReconnect();
            break;
          }
          sessionTokenRef.current = msg.token;
          setSignalingSessionToken(msg.token);
          const admin = isRecord(msg.admin) ? msg.admin : null;
          const role = admin && typeof admin.role === "string" ? admin.role : null;
          setAdminRole(role);
          const org = isRecord(msg.org) && typeof msg.org.name === "string" ? msg.org.name : null;
          setHomeOrgName(org);
          setConnectionStatus("Loading orgs & clients…");
          send({ type: "admin-get-orgs", token: msg.token });
          send({ type: "admin-get-clients", token: msg.token });
          queueMicrotask(() => flushPendingConnects());
          break;
        }
        case "admin-get-orgs-response": {
          if (msg.success === true && Array.isArray(msg.orgs)) {
            const list = msg.orgs.map(parseOrg).filter((o): o is AuditOrg => o !== null);
            setOrgs(list);
          }
          break;
        }
        case "admin-get-clients-response": {
          if (msg.success === true && Array.isArray(msg.clients)) {
            const mapped = msg.clients.map(parseClientRow).filter((c): c is AuditLiveClient => c !== null);
            setClients(
              mapped.sort((a, b) => {
                const on = (a.orgName || "").localeCompare(b.orgName || "");
                if (on !== 0) return on;
                return a.fullName.localeCompare(b.fullName);
              }),
            );
          }
          setConnectionStatus("Live");
          break;
        }
        case "admin-clients-updated": {
          const oid = Number(msg.orgId);
          if (Number.isFinite(oid) && Array.isArray(msg.clients)) {
            mergeOrgClients(oid, msg.clients);
          }
          break;
        }
        case "access-restricted": {
          setConnectionStatus(
            typeof msg.message === "string" ? msg.message : "Access restricted (office network policy)",
          );
          break;
        }
        case "error": {
          const m = typeof msg.message === "string" ? msg.message : "Server error";
          setConnectionStatus(m);
          break;
        }
        case "client-disconnected": {
          const cid = Number(msg.clientId);
          if (Number.isFinite(cid) && cid > 0) {
            teardownAllViewsForClientId(cid);
          }
          break;
        }
        case "connect-response": {
          const clientId = Number(msg.clientId);
          const viewKeyForFlight =
            Number.isFinite(clientId) && clientId > 0
              ? lastConnectViewKeyByClientRef.current.get(clientId)
              : undefined;

          if (msg.success !== true) {
            const text =
              typeof msg.message === "string" && msg.message.trim()
                ? msg.message.trim()
                : typeof msg.error === "string"
                  ? msg.error
                  : "Could not connect to client";
            if (Number.isFinite(clientId) && clientId > 0) {
              const errCode = typeof msg.error === "string" ? msg.error : "";
              const limitHit =
                errCode === "ADMIN_VIEWER_LIMIT" || errCode === "CLIENT_VIEWER_LIMIT";
              const retryable =
                !limitHit &&
                /connection not found|client unavailable|not available/i.test(text);
              const viewKey =
                viewKeyForFlight ?? popPendingViewKey(clientId) ?? String(clientId);
              finishConnectInFlight(clientId, viewKey);
              if (retryable) scheduleConnectRetry(viewKey, text);
              else failClientStream(viewKey, text);
            } else {
              finishConnectInFlight(clientId);
              showToastRef.current(text, "error");
            }
            break;
          }

          if (Number.isFinite(clientId) && clientId > 0) {
            const viewKey = viewKeyForFlight ?? popPendingViewKey(clientId) ?? String(clientId);
            finishConnectInFlight(clientId, viewKey);

            const clientSocketId = String(msg.clientSocketId || "");
            if (clientSocketId) {
              clientSocketByViewKeyRef.current.set(viewKey, clientSocketId);
            }
            const msgSid = Number(msg.sessionId);
            if (Number.isFinite(msgSid) && msgSid > 0) {
              activeSessionIdByViewKeyRef.current.set(viewKey, msgSid);
            }
            clearConnectRetry(viewKey);
            removePendingViewKey(clientId, viewKey);
            armStreamConnectTimeout(viewKey);
          } else {
            finishConnectInFlight(clientId);
          }
          break;
        }
        case "start-offer": {
          const clientSocketId = String(msg.clientSocketId || "");
          const clientId = Number(msg.clientId);
          if (!clientSocketId) break;

          let viewKey = "";
          let ignoredStaleStartOffer = false;
          if (Number.isFinite(clientId) && clientId > 0) {
            for (const [vk, sid] of clientSocketByViewKeyRef.current.entries()) {
              if (sid === clientSocketId && clientIdFromViewKey(vk) === clientId) {
                viewKey = vk;
                break;
              }
            }
          }

          if (viewKey) {
            const genAtStart = connectGenAtStartRef.current.get(viewKey);
            const genNow = connectGenRef.current.get(viewKey) ?? 0;
            if (genAtStart !== undefined && genAtStart !== genNow) {
              console.debug(
                "[audit] Ignoring stale start-offer",
                viewKey,
                "gen",
                genAtStart,
                "→",
                genNow,
              );
              ignoredStaleStartOffer = true;
            }
          }

          if (!ignoredStaleStartOffer && !viewKey && Number.isFinite(clientId) && clientId > 0) {
            for (const [vk, n] of interestRef.current.entries()) {
              if (
                n > 0 &&
                clientIdFromViewKey(vk) === clientId &&
                !pcByViewKeyRef.current.has(vk)
              ) {
                const genAtStart = connectGenAtStartRef.current.get(vk);
                const genNow = connectGenRef.current.get(vk) ?? 0;
                if (genAtStart !== undefined && genAtStart !== genNow) {
                  console.debug(
                    "[audit] Ignoring stale start-offer",
                    vk,
                    "gen",
                    genAtStart,
                    "→",
                    genNow,
                  );
                  ignoredStaleStartOffer = true;
                  break;
                }
                viewKey = vk;
                clientSocketByViewKeyRef.current.set(vk, clientSocketId);
                break;
              }
            }
          }

          if (ignoredStaleStartOffer) break;

          if (!viewKey) {
            console.warn(
              "[audit] start-offer: no viewKey bound in clientSocketByViewKeyRef",
              { clientId, clientSocketId },
            );
            break;
          }

          {
            const msgSid = Number(msg.sessionId);
            if (Number.isFinite(msgSid) && msgSid > 0) {
              const currentSid = activeSessionIdByViewKeyRef.current.get(viewKey) ?? 0;
              if (msgSid < currentSid) {
                console.warn("[audit] Dropping stale start-offer for", viewKey, "sessionId", msgSid);
                break;
              }
              activeSessionIdByViewKeyRef.current.set(viewKey, msgSid);
            }

            clearConnectRetry(viewKey);
            if (Number.isFinite(clientId) && clientId > 0) {
              connectCooldownByClientRef.current.delete(clientId);
            }
            armStreamConnectTimeout(viewKey);
            clientSocketByViewKeyRef.current.set(viewKey, clientSocketId);
          }

          if ((interestRef.current.get(viewKey) ?? 0) <= 0) break;

          const transportPlan = parseStreamTransport(msg);
          applyStreamTransportToRefs(
            transportPlan,
            iceServersRef,
            iceStunOnlyRef,
            iceFullRef,
          );

          if (transportPlan?.mode === "sfu") {
            const pubSid = transportPlan.sfu?.publisherSessionId?.trim();
            if (pubSid) {
              void startSfuView(
                viewKey || String(clientId),
                clientSocketId,
                clientId,
                transportPlan,
                pubSid,
                transportPlan.sfu?.providerLane,
              );
            } else {
              await startMeshView(
                viewKey || String(clientId),
                clientSocketId,
                clientId,
                { ...transportPlan, mode: "turn-relay", sfu: undefined },
              );
            }
            break;
          }

          await startMeshView(
            viewKey || String(clientId),
            clientSocketId,
            clientId,
            transportPlan,
          );
          break;
        }
        case "answer": {
          const sdp = msg.sdp as RTCSessionDescriptionInit | undefined;
          const vk = streamSignalingKey(msg) ?? "";
          
          if (vk) {
            const msgSid = Number(msg.sessionId);
            if (Number.isFinite(msgSid) && msgSid > 0) {
              const currentSid = activeSessionIdByViewKeyRef.current.get(vk) ?? 0;
              if (msgSid !== currentSid) {
                console.warn(`[audit] Dropping stale answer for ${vk}, sessionId: ${msgSid} != ${currentSid}`);
                break;
              }
            }
          }

          const pc = vk ? pcByViewKeyRef.current.get(vk) : null;
          if (pc && sdp) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(sdp));
              const queue = vk ? pendingIceByViewKeyRef.current.get(vk) ?? [] : [];
              if (vk) pendingIceByViewKeyRef.current.set(vk, []);
              const dedupe =
                (vk && iceDedupByViewKeyRef.current.get(vk)) || createCandidateDedupeSet();
              if (vk) iceDedupByViewKeyRef.current.set(vk, dedupe);
              for (const c of queue) {
                if (!c.candidate) continue;
                await safeAddIceCandidate(pc, dedupe, {
                  candidate: c.candidate,
                  sdpMid: c.sdpMid ?? null,
                  sdpMLineIndex: c.sdpMLineIndex ?? null,
                });
              }
            } catch (e) {
              console.error("[audit] setRemoteDescription answer failed", e);
            }
          }
          break;
        }
        case "ice-candidate": {
          const candidate = msg.candidate as RTCIceCandidateInit | undefined;
          const vk = streamSignalingKey(msg) ?? "";
          
          if (vk) {
            const msgSid = Number(msg.sessionId);
            if (Number.isFinite(msgSid) && msgSid > 0) {
              const currentSid = activeSessionIdByViewKeyRef.current.get(vk) ?? 0;
              if (msgSid !== currentSid) {
                console.warn(`[audit] Dropping stale ice-candidate for ${vk}, sessionId: ${msgSid} != ${currentSid}`);
                break;
              }
            }
          }

          const pc = vk ? pcByViewKeyRef.current.get(vk) : null;
          if (!pc || !candidate?.candidate || !vk) break;
          if (!pc.remoteDescription || !pc.localDescription) {
            const q = pendingIceByViewKeyRef.current.get(vk) ?? [];
            q.push(candidate);
            pendingIceByViewKeyRef.current.set(vk, q);
            break;
          }
          const dedupe = iceDedupByViewKeyRef.current.get(vk) ?? createCandidateDedupeSet();
          iceDedupByViewKeyRef.current.set(vk, dedupe);
          await safeAddIceCandidate(pc, dedupe, {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid ?? null,
            sdpMLineIndex: candidate.sdpMLineIndex ?? null,
          });
          break;
        }
        case "admin-focus-client-app-response": {
          if (msg.success === true) {
            showToastRef.current("Client app brought to front", "success");
          } else {
            const text =
              typeof msg.message === "string" && msg.message.trim()
                ? msg.message.trim()
                : "Could not focus client app";
            showToastRef.current(text, "error");
          }
          break;
        }
        case "browser-tab-events-update": {
          const clientId = Number(msg.clientId);
          if (!Number.isFinite(clientId) || clientId <= 0) break;
          const browserName =
            typeof msg.browserName === "string" && msg.browserName.trim()
              ? msg.browserName.trim()
              : "Chromium";
          const activeRaw = Number(msg.activeTabId);
          const activeTabId = Number.isFinite(activeRaw) ? Math.round(activeRaw) : null;
          const accepted = Number(msg.accepted);
          const batchAccepted = Number.isFinite(accepted) ? Math.max(0, Math.round(accepted)) : 0;
          const rawTabs = Array.isArray(msg.tabs) ? msg.tabs : [];
          const tabs = rawTabs
            .map(parseBrowserTabRow)
            .filter((t): t is NonNullable<ReturnType<typeof parseBrowserTabRow>> => t !== null)
            .slice(0, 200);
          const rawRi = Array.isArray(msg.recentInteractions) ? msg.recentInteractions : [];
          const recentInteractions = rawRi
            .map(parseInteractionEvent)
            .filter((x): x is NonNullable<ReturnType<typeof parseInteractionEvent>> => x !== null)
            .slice(0, 120);
          const snap: BrowserTabAnalyticsSnapshot = {
            clientId,
            browserName,
            activeTabId,
            tabs,
            updatedAtMs: Date.now(),
            batchAccepted,
            recentInteractions,
          };
          setBrowserTabAnalyticsByClientId((prev) => {
            const next = new Map(prev);
            next.set(clientId, snap);
            return next;
          });
          break;
        }
        default:
          break;
      }
      };
    };

    connect();

    return () => {
      unmountedRef.current = true;
      clearReconnectTimer();
      for (const viewKey of pcByViewKeyRef.current.keys()) {
        teardownMeshPeerForViewKey(viewKey);
      }
      clientSocketByViewKeyRef.current.clear();
      activeSessionIdByViewKeyRef.current.clear();
      connectQueueRef.current = [];
      pendingViewKeyByClientRef.current.clear();
      connectInFlightKeysRef.current.clear();
      connectGenRef.current.clear();
      connectGenAtStartRef.current.clear();
      lastConnectViewKeyByClientRef.current.clear();
      interestRef.current.clear();
      prefsRef.current.clear();
      sessionTokenRef.current = null;
      setSignalingSessionToken(null);
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    };
  }, [
    flushPendingConnects,
    finishConnectInFlight,
    mergeOrgClients,
    pumpConnectQueue,
    send,
    stopViewingServer,
    teardownAllViewsForClientId,
    teardownMeshPeerForViewKey,
    popPendingViewKey,
    scheduleConnectRetry,
    failClientStream,
    armStreamConnectTimeout,
    clearConnectRetry,
    startMeshView,
    startSfuView,
  ]);

  const value = useMemo<AuditSignalingContextValue>(
    () => ({
      connectionStatus,
      adminRole,
      homeOrgName,
      orgs: visibleOrgs,
      clients: visibleClients,
      streams,
      getStream,
      browserTabAnalyticsByClientId,
      getBrowserTabAnalytics,
      acquireStream,
      releaseStream,
      getClient,
      requestClientAppFocus,
      teamLeadOrgAccess,
      assignedGroups: tlAccess.groups,
      signalingSessionToken,
    }),
    [
      acquireStream,
      adminRole,
      visibleClients,
      browserTabAnalyticsByClientId,
      connectionStatus,
      getBrowserTabAnalytics,
      getClient,
      getStream,
      homeOrgName,
      visibleOrgs,
      releaseStream,
      requestClientAppFocus,
      streams,
      teamLeadOrgAccess,
      tlAccess.groups,
      signalingSessionToken,
    ],
  );

  const assignedGroupsScope = useMemo((): AssignedGroupsScope => {
    const isTeamLead =
      authState.status === "authenticated" && authState.user.role === "team_lead";
    return {
      groups: tlAccess.groups,
      ready: !isTeamLead || tlAccess.loaded,
      hasGroupScope: isTeamLead && tlAccess.hasGroupScope,
    };
  }, [
    authState.status,
    authState.status === "authenticated" ? authState.user.role : "",
    tlAccess.groups,
    tlAccess.loaded,
    tlAccess.hasGroupScope,
  ]);

  return (
    <AuditSignalingContext.Provider value={value}>
      <AssignedGroupsContext.Provider value={assignedGroupsScope}>
        {children}
      </AssignedGroupsContext.Provider>
    </AuditSignalingContext.Provider>
  );
}
