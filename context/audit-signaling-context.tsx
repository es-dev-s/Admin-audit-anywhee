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

const DEFAULT_ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

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

  const [connectionStatus, setConnectionStatus] = useState("Initializing…");
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
  }, []);

  const teardownPeerForClientId = useCallback(
    (clientId: number) => {
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
    [teardownPeerForClientSocket],
  );

  const stopViewingServer = useCallback(
    (clientSocketId: string) => {
      const token = sessionTokenRef.current;
      if (!token) return;
      send({ type: "admin-stop-viewing", token, clientSocketId });
    },
    [send],
  );

  const connectSignalingRequest = useCallback(
    (clientId: number) => {
      const now = Date.now();
      const last = connectCooldownByClientRef.current.get(clientId) ?? 0;
      // Throttle duplicate connect requests for the same client socket.
      if (now - last < 1200) return;
      connectCooldownByClientRef.current.set(clientId, now);
      const token = sessionTokenRef.current;
      if (!token) return;
      send({ type: "connect-to-client", token, clientId });
    },
    [send],
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
      if (n > 0) connectSignalingRequestRef.current(clientId);
    }
  }, []);

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
    [stopViewingServer, teardownPeerForClientSocket],
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
    fetch("/api/team-lead-org-access", { credentials: "include" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        const byOrg = new Map<number, Exclude<TeamLeadOrgAccessStatus, "none">>();
        const approved = new Set<number>();
        if (ok && Array.isArray(j.entries)) {
          for (const row of j.entries as Array<{
            signalingOrgId?: number;
            status?: string;
          }>) {
            const oid = Number(row.signalingOrgId);
            const st = row.status;
            if (!Number.isFinite(oid) || oid <= 0) continue;
            if (
              st === "pending" ||
              st === "approved" ||
              st === "rejected" ||
              st === "revoked"
            ) {
              byOrg.set(oid, st);
              if (st === "approved") approved.add(oid);
            }
          }
        }
        setTlAccess({ loaded: true, byOrg, approved });
      })
      .catch(() => {
        setTlAccess({ loaded: true, byOrg: new Map(), approved: new Set() });
      });
  }, []);

  useEffect(() => {
    if (authState.status !== "authenticated") {
      setTlAccess({ loaded: false, byOrg: new Map(), approved: new Set() });
      return;
    }
    if (authState.user.role !== "team_lead") {
      setTlAccess({ loaded: false, byOrg: new Map(), approved: new Set() });
      return;
    }
    setTlAccess({ loaded: false, byOrg: new Map(), approved: new Set() });
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
      if (!tlAccess.loaded) {
        return { clients: [], orgs };
      }
      return filterSignalingRosterForTeamLead(clients, orgs, tlAccess.approved);
    }
    return filterSignalingRosterForMember(clients, orgs, scopeForFilter);
  }, [
    authState,
    clients,
    orgs,
    scopeForFilter,
    tlAccess.approved,
    tlAccess.loaded,
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
    const wsUrl = process.env.NEXT_PUBLIC_ANYWHERE_SIGNALING_WSS ?? "";
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
        case "start-offer": {
          const clientSocketId = String(msg.clientSocketId || "");
          const clientId = Number(msg.clientId);
          if (!clientSocketId) break;

          if (Number.isFinite(clientId) && clientId > 0) {
            connectCooldownByClientRef.current.delete(clientId);
            const prevSid = clientSocketByClientIdRef.current.get(clientId);
            if (prevSid && prevSid !== clientSocketId) {
              stopViewingServer(prevSid);
              teardownPeerForClientSocket(prevSid);
            }
            clientSocketByClientIdRef.current.set(clientId, clientSocketId);
          }

          const ice = iceServersRef.current.length > 0 ? iceServersRef.current : DEFAULT_ICE;
          teardownPeerForClientSocket(clientSocketId);
          const pc = new RTCPeerConnection({ iceServers: ice });
          pcByClientSocketRef.current.set(clientSocketId, pc);

          pc.addTransceiver("video", { direction: "recvonly" });

          pc.ontrack = (trackEvent) => {
            const stream = trackEvent.streams[0] ?? new MediaStream([trackEvent.track]);
            const resolvedId = Number.isFinite(clientId) && clientId > 0 ? clientId : null;
            if (resolvedId == null) return;
            setStreams((prev) => {
              const next = new Map(prev);
              next.set(resolvedId, stream);
              return next;
            });
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
          if (pc && candidate?.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch {
              /* ignore */
            }
          }
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
  }, [flushPendingConnects, mergeOrgClients, send, stopViewingServer, teardownPeerForClientId, teardownPeerForClientSocket]);

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
      signalingSessionToken,
    ],
  );

  return <AuditSignalingContext.Provider value={value}>{children}</AuditSignalingContext.Provider>;
}
