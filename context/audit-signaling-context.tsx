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
  streams: Map<number, MediaStream>;
  /** Latest browser/extension tab snapshot per enrolled client (from `browser-tab-events-update`). */
  browserTabAnalyticsByClientId: Map<number, BrowserTabAnalyticsSnapshot>;
  getBrowserTabAnalytics: (clientId: number) => BrowserTabAnalyticsSnapshot | undefined;
  /** Ref-counted: increment when a surface needs a live stream; decrements on release. */
  acquireStream: (clientId: number, opts?: { preferredSourceId?: string | null; preferredSourceIndex?: number | null }) => void;
  releaseStream: (clientId: number) => void;
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
  const pcByClientSocketRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const clientSocketByClientIdRef = useRef<Map<number, string>>(new Map());
  const interestRef = useRef<Map<number, number>>(new Map());
  const prefsRef = useRef<Map<number, { preferredSourceId?: string | null; preferredSourceIndex?: number | null }>>(new Map());
  const streamTimeoutByClientRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const streamTrackReceivedRef = useRef<Set<number>>(new Set());
  const connectRetryCountRef = useRef<Map<number, number>>(new Map());
  const connectRetryTimerRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const connectQueueRef = useRef<number[]>([]);
  const connectQueueScheduledRef = useRef(false);
  const connectInFlightRef = useRef(0);
  const iceDedupByClientSocketRef = useRef<Map<string, Set<string>>>(new Map());
  const pendingIceByClientSocketRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const [connectionStatus, setConnectionStatus] = useState("Initializing…");
  const connectionStatusRef = useRef(connectionStatus);
  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [homeOrgName, setHomeOrgName] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<AuditOrg[]>([]);
  const [clients, setClients] = useState<AuditLiveClient[]>([]);
  const [streams, setStreams] = useState<Map<number, MediaStream>>(new Map());
  const [browserTabAnalyticsByClientId, setBrowserTabAnalyticsByClientId] = useState<
    Map<number, BrowserTabAnalyticsSnapshot>
  >(() => new Map());

  const send = useCallback((payload: Record<string, unknown>) => {
    const sock = wsRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    sock.send(JSON.stringify(payload));
  }, []);

  const teardownPeerForClientSocket = useCallback((clientSocketId: string) => {
    const pc = pcByClientSocketRef.current.get(clientSocketId);
    if (pc) {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      pcByClientSocketRef.current.delete(clientSocketId);
    }
    iceDedupByClientSocketRef.current.delete(clientSocketId);
    pendingIceByClientSocketRef.current.delete(clientSocketId);
  }, []);

  const removeFromConnectQueue = useCallback((clientId: number) => {
    connectQueueRef.current = connectQueueRef.current.filter((id) => id !== clientId);
  }, []);

  const enqueueConnect = useCallback((clientId: number) => {
    if (!Number.isFinite(clientId) || clientId <= 0) return;
    const q = connectQueueRef.current;
    if (!q.includes(clientId)) q.push(clientId);
  }, []);

  const clearStreamConnectTimeout = useCallback((clientId: number) => {
    const t = streamTimeoutByClientRef.current.get(clientId);
    if (t) {
      clearTimeout(t);
      streamTimeoutByClientRef.current.delete(clientId);
    }
  }, []);

  const teardownPeerForClientId = useCallback(
    (clientId: number) => {
      clearStreamConnectTimeout(clientId);
      streamTrackReceivedRef.current.delete(clientId);
      const sid = clientSocketByClientIdRef.current.get(clientId);
      if (sid) {
        teardownPeerForClientSocket(sid);
        clientSocketByClientIdRef.current.delete(clientId);
      }
      setStreams((prev) => {
        if (!prev.has(clientId)) return prev;
        const next = new Map(prev);
        next.delete(clientId);
        return next;
      });
    },
    [clearStreamConnectTimeout, teardownPeerForClientSocket],
  );

  const clearConnectRetry = useCallback((clientId: number) => {
    connectRetryCountRef.current.delete(clientId);
    const t = connectRetryTimerRef.current.get(clientId);
    if (t) {
      clearTimeout(t);
      connectRetryTimerRef.current.delete(clientId);
    }
  }, []);

  const failClientStream = useCallback(
    (clientId: number, message: string) => {
      if (!Number.isFinite(clientId) || clientId <= 0) return;
      clearConnectRetry(clientId);
      interestRef.current.delete(clientId);
      connectCooldownByClientRef.current.delete(clientId);
      teardownPeerForClientId(clientId);
      showToastRef.current(message, "error");
    },
    [clearConnectRetry, teardownPeerForClientId],
  );

  const scheduleConnectRetry = useCallback(
    (clientId: number, message: string) => {
      if (!Number.isFinite(clientId) || clientId <= 0) return;
      if ((interestRef.current.get(clientId) ?? 0) <= 0) return;

      const attempt = (connectRetryCountRef.current.get(clientId) ?? 0) + 1;
      connectRetryCountRef.current.set(clientId, attempt);
      if (attempt > 6) {
        failClientStream(clientId, message);
        return;
      }

      if (attempt === 1) {
        showToastRef.current("Waiting for client on signaling — retrying…", "error");
      }

      const prev = connectRetryTimerRef.current.get(clientId);
      if (prev) clearTimeout(prev);
      connectRetryTimerRef.current.set(
        clientId,
        setTimeout(() => {
          connectRetryTimerRef.current.delete(clientId);
          connectCooldownByClientRef.current.delete(clientId);
          connectSignalingRequestRef.current(clientId);
        }, 2000),
      );
    },
    [failClientStream],
  );

  const armStreamConnectTimeout = useCallback(
    (clientId: number) => {
      if (!Number.isFinite(clientId) || clientId <= 0) return;
      clearStreamConnectTimeout(clientId);
      streamTimeoutByClientRef.current.set(
        clientId,
        setTimeout(() => {
          streamTimeoutByClientRef.current.delete(clientId);
          if (streamTrackReceivedRef.current.has(clientId)) return;
          failClientStream(
            clientId,
            "Stream timed out. Confirm the client app is online, signaling uses Cloudflare TURN, and ports 18085/13000 are open.",
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
    (clientId: number) => {
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
        connectInFlightRef.current < MAX_PARALLEL_STREAM_CONNECTS &&
        connectQueueRef.current.length > 0
      ) {
        const clientId = connectQueueRef.current.shift();
        if (clientId == null) break;
        if ((interestRef.current.get(clientId) ?? 0) <= 0) continue;
        connectInFlightRef.current += 1;
        const started = connectSignalingRequestImmediate(clientId);
        if (!started) {
          connectInFlightRef.current = Math.max(0, connectInFlightRef.current - 1);
          if ((interestRef.current.get(clientId) ?? 0) > 0) {
            connectQueueRef.current.unshift(clientId);
          }
        }
        if (connectQueueRef.current.length > 0 || connectInFlightRef.current > 0) {
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

  const connectSignalingRequest = useCallback(
    (clientId: number) => {
      enqueueConnect(clientId);
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
    for (const [clientId, n] of interestRef.current) {
      if (n > 0) enqueueConnect(clientId);
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
    (clientId: number, opts?: { preferredSourceId?: string | null; preferredSourceIndex?: number | null }) => {
      if (!Number.isFinite(clientId) || clientId <= 0) return;
      prefsRef.current.set(clientId, {
        preferredSourceId: opts?.preferredSourceId ?? null,
        preferredSourceIndex: opts?.preferredSourceIndex ?? null,
      });
      const prev = interestRef.current.get(clientId) ?? 0;
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
      interestRef.current.set(clientId, prev + 1);
      if (prev === 0) {
        connectSignalingRequest(clientId);
      }
    },
    [connectSignalingRequest],
  );

  const releaseStream = useCallback(
    (clientId: number) => {
      const n = (interestRef.current.get(clientId) ?? 0) - 1;
      if (n <= 0) {
        interestRef.current.delete(clientId);
        prefsRef.current.delete(clientId);
        removeFromConnectQueue(clientId);
        const sid = clientSocketByClientIdRef.current.get(clientId);
        if (sid) {
          stopViewingServer(sid);
          teardownPeerForClientSocket(sid);
          clientSocketByClientIdRef.current.delete(clientId);
        }
        setStreams((prev) => {
          if (!prev.has(clientId)) return prev;
          const next = new Map(prev);
          next.delete(clientId);
          return next;
        });
      } else {
        interestRef.current.set(clientId, n);
      }
    },
    [removeFromConnectQueue, stopViewingServer, teardownPeerForClientSocket],
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

        if (scopeOk && Array.isArray(scopeJ.signalOrgIds) && scopeJ.signalOrgIds.length > 0) {
          // Has admin-assigned groups: build approved set from group org ids.
          for (const oid of scopeJ.signalOrgIds as number[]) {
            if (Number.isFinite(oid) && oid > 0) {
              approved.add(oid);
              byOrg.set(oid, "approved");
            }
          }
          // Also store the allowed client ids for use in filtering.
          const allowedClientIds: number[] = Array.isArray(scopeJ.signalClientIds)
            ? (scopeJ.signalClientIds as number[])
            : [];
          setTlAccess({
            loaded: true,
            byOrg,
            approved,
            allowedClientIds: new Set(allowedClientIds),
            groups: Array.isArray(scopeJ.groups)
              ? (scopeJ.groups as Array<{ id: string; name: string; description: string | null; signalClientIds: number[] }>)
              : [],
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
        // Admin-group scope: only the specific clients in the assigned groups.
        const allowed = tlAccess.allowedClientIds;
        const filtered = clients.filter((c) => allowed.has(c.id));
        const orgIds = new Set(filtered.map((c) => c.orgId));
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
            iceServersRef.current = msg.iceServers as RTCIceServer[];
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
            teardownPeerForClientId(cid);
          }
          break;
        }
        case "connect-response": {
          const clientId = Number(msg.clientId);
          connectInFlightRef.current = Math.max(0, connectInFlightRef.current - 1);
          pumpConnectQueue();
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
              if (retryable) scheduleConnectRetry(clientId, text);
              else failClientStream(clientId, text);
            } else {
              showToastRef.current(text, "error");
            }
            break;
          }
          if (Number.isFinite(clientId) && clientId > 0) {
            clearConnectRetry(clientId);
            armStreamConnectTimeout(clientId);
          }
          break;
        }
        case "start-offer": {
          const clientSocketId = String(msg.clientSocketId || "");
          const clientId = Number(msg.clientId);
          if (!clientSocketId) break;

          if (Number.isFinite(clientId) && clientId > 0) {
            clearConnectRetry(clientId);
            connectCooldownByClientRef.current.delete(clientId);
            armStreamConnectTimeout(clientId);
            const prevSid = clientSocketByClientIdRef.current.get(clientId);
            if (prevSid && prevSid !== clientSocketId) {
              stopViewingServer(prevSid);
              teardownPeerForClientSocket(prevSid);
            }
            clientSocketByClientIdRef.current.set(clientId, clientSocketId);
          }

          const ice = iceServersRef.current.length > 0 ? iceServersRef.current : DEFAULT_ICE;
          teardownPeerForClientSocket(clientSocketId);
          const pc = createAuditPeerConnection(ice);
          pcByClientSocketRef.current.set(clientSocketId, pc);
          iceDedupByClientSocketRef.current.set(clientSocketId, createCandidateDedupeSet());
          pendingIceByClientSocketRef.current.set(clientSocketId, []);

          pc.addTransceiver("video", { direction: "recvonly" });

          pc.ontrack = (trackEvent) => {
            const stream = trackEvent.streams[0] ?? new MediaStream([trackEvent.track]);
            const resolvedId = Number.isFinite(clientId) && clientId > 0 ? clientId : null;
            if (resolvedId == null) return;
            streamTrackReceivedRef.current.add(resolvedId);
            clearStreamConnectTimeout(resolvedId);
            setStreams((prev) => {
              const next = new Map(prev);
              next.set(resolvedId, stream);
              return next;
            });
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState !== "failed" && pc.connectionState !== "disconnected") return;
            if (!Number.isFinite(clientId) || clientId <= 0) return;
            if (streamTrackReceivedRef.current.has(clientId)) return;
            failClientStream(clientId, `WebRTC ${pc.connectionState} — check TURN (Cloudflare) on signaling server.`);
          };

          pc.onicecandidate = (iceEvent) => {
            if (!iceEvent.candidate) return;
            send({
              type: "ice-candidate",
              targetSocketId: clientSocketId,
              candidate: iceEvent.candidate.toJSON(),
            });
          };

          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            const pref =
              Number.isFinite(clientId) && clientId > 0 ? prefsRef.current.get(clientId) : undefined;
            send({
              type: "offer",
              targetSocketId: clientSocketId,
              sdp: offer,
              ...(pref?.preferredSourceId ? { preferredSourceId: pref.preferredSourceId } : {}),
              ...(pref?.preferredSourceIndex != null ? { preferredSourceIndex: pref.preferredSourceIndex } : {}),
            });
          } catch (e) {
            console.error("[audit] createOffer failed", e);
          }
          break;
        }
        case "answer": {
          const sdp = msg.sdp as RTCSessionDescriptionInit | undefined;
          const fromSocketId = String(msg.fromSocketId || "");
          const pc = fromSocketId ? pcByClientSocketRef.current.get(fromSocketId) : null;
          if (pc && sdp) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(sdp));
              const fromSocketId = String(msg.fromSocketId || "");
              const queue = fromSocketId
                ? pendingIceByClientSocketRef.current.get(fromSocketId) ?? []
                : [];
              if (fromSocketId) pendingIceByClientSocketRef.current.set(fromSocketId, []);
              const dedupe =
                (fromSocketId && iceDedupByClientSocketRef.current.get(fromSocketId)) ||
                createCandidateDedupeSet();
              if (fromSocketId) iceDedupByClientSocketRef.current.set(fromSocketId, dedupe);
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
          const fromSocketId = String(msg.fromSocketId || "");
          const pc = fromSocketId ? pcByClientSocketRef.current.get(fromSocketId) : null;
          if (!pc || !candidate?.candidate || !fromSocketId) break;
          if (!pc.remoteDescription || !pc.localDescription) {
            const q = pendingIceByClientSocketRef.current.get(fromSocketId) ?? [];
            q.push(candidate);
            pendingIceByClientSocketRef.current.set(fromSocketId, q);
            break;
          }
          const dedupe =
            iceDedupByClientSocketRef.current.get(fromSocketId) ?? createCandidateDedupeSet();
          iceDedupByClientSocketRef.current.set(fromSocketId, dedupe);
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
      for (const sid of pcByClientSocketRef.current.keys()) {
        teardownPeerForClientSocket(sid);
      }
      clientSocketByClientIdRef.current.clear();
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
    mergeOrgClients,
    pumpConnectQueue,
    send,
    stopViewingServer,
    teardownPeerForClientId,
    teardownPeerForClientSocket,
  ]);

  const value = useMemo<AuditSignalingContextValue>(
    () => ({
      connectionStatus,
      adminRole,
      homeOrgName,
      orgs: visibleOrgs,
      clients: visibleClients,
      streams,
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

  return <AuditSignalingContext.Provider value={value}>{children}</AuditSignalingContext.Provider>;
}
