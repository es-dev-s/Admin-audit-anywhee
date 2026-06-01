/** Tab row from signaling `browser-tab-events-update` (matches server normalizeTab). */
export type BrowserTabAnalyticsRow = {
  tabId: number | null;
  title: string;
  url: string;
  domain: string;
  favIconUrl: string;
  isActive: boolean;
  activeMs: number;
  /**
   * When the signaling server sends a cumulative/lifetime total for this tab (URL or tab id),
   * prefer this for “all time” display; otherwise use {@link tabTotalDwellMs}.
   */
  totalActiveMs?: number;
  /** When present (extension-bus), idle dwell on this tab. */
  dwellIdleMs?: number;
  keystrokes?: number;
  scrollPx?: number;
  mousePx?: number;
  clicks?: number;
};

/** Trimmed interaction line from client `recentInteractions` (also in session_json). */
export type TabInteractionEvent = {
  ts: number;
  eventType: string;
  tabId: number | null;
  detail: string;
  url?: string;
  title?: string;
};

export type BrowserTabAnalyticsSnapshot = {
  clientId: number;
  browserName: string;
  activeTabId: number | null;
  tabs: BrowserTabAnalyticsRow[];
  updatedAtMs: number;
  batchAccepted: number;
  /** Recent extension events; filter by tab in the detail panel. */
  recentInteractions: TabInteractionEvent[];
};

/** Active tab first, then by dwell (`activeMs`) for team roster / summaries. */
export function topRecentBrowserTabs(
  snapshot: BrowserTabAnalyticsSnapshot | undefined,
  limit = 3,
): BrowserTabAnalyticsRow[] {
  if (!snapshot?.tabs?.length) return [];
  const tabs = [...snapshot.tabs];
  tabs.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const am = a.activeMs ?? 0;
    const bm = b.activeMs ?? 0;
    if (bm !== am) return bm - am;
    return (b.tabId ?? -1) - (a.tabId ?? -1);
  });
  return tabs.slice(0, Math.max(0, limit));
}

export function tabTitleAndHost(tab: BrowserTabAnalyticsRow): { title: string; host: string } {
  const domain = (tab.domain || "").trim();
  let host = domain;
  if (!host && tab.url) {
    try {
      host = new URL(tab.url).hostname || "";
    } catch {
      host = "";
    }
  }
  const rawTitle = (tab.title || "").trim();
  const title = rawTitle || domain || host || "(untitled)";
  return { title, host };
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseBrowserTabRow(raw: unknown): BrowserTabAnalyticsRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title : "";
  const url =
    typeof r.url === "string"
      ? r.url
      : typeof r.href === "string"
        ? r.href
        : "";
  const domain = typeof r.domain === "string" ? r.domain : "";
  // Match signaling-server normalizeTab: allow host-only rows (some builds send domain before title/url).
  if (!title.trim() && !url.trim() && !domain.trim()) return null;
  const tabId = num(r.tabId ?? r.tab_id);
  const activeMsRaw = Number(r.activeMs ?? r.active_ms ?? 0);
  const activeMs =
    Number.isFinite(activeMsRaw) && activeMsRaw >= 0
      ? Math.min(Math.round(activeMsRaw), 31_536_000_000)
      : 0;
  const favIconUrl =
    typeof r.favIconUrl === "string"
      ? r.favIconUrl
      : typeof r.fav_icon_url === "string"
        ? r.fav_icon_url
        : "";
  const idleRaw = Number(r.dwellIdleMs ?? r.dwell_idle_ms);
  const dwellIdleMs =
    Number.isFinite(idleRaw) && idleRaw >= 0 ? Math.min(Math.round(idleRaw), 31_536_000_000) : undefined;
  const totalRaw = Number(
    r.totalActiveMs ??
      r.total_active_ms ??
      r.cumulativeActiveMs ??
      r.cumulative_active_ms ??
      r.lifetimeActiveMs ??
      r.lifetime_active_ms
  );
  const totalActiveMs =
    Number.isFinite(totalRaw) && totalRaw >= 0
      ? Math.min(Math.round(totalRaw), 31_536_000_000)
      : undefined;
  const ks = Number(r.keystrokes);
  const scrollPx = Number(r.scroll_px ?? r.scrollPx);
  const mousePx = Number(r.mouse_px ?? r.mousePx);
  const clicks = Number(r.clicks);
  return {
    tabId: tabId != null && tabId >= 0 ? Math.round(tabId) : null,
    title,
    url,
    domain,
    favIconUrl,
    isActive: r.isActive === true,
    activeMs,
    ...(totalActiveMs !== undefined ? { totalActiveMs } : {}),
    ...(dwellIdleMs !== undefined ? { dwellIdleMs } : {}),
    ...(Number.isFinite(ks) ? { keystrokes: Math.round(ks) } : {}),
    ...(Number.isFinite(scrollPx) ? { scrollPx: Math.round(scrollPx) } : {}),
    ...(Number.isFinite(mousePx) ? { mousePx: Math.round(mousePx) } : {}),
    ...(Number.isFinite(clicks) ? { clicks: Math.round(clicks) } : {}),
  };
}

export function tabRowKey(row: BrowserTabAnalyticsRow, index: number): string {
  if (row.tabId != null && row.tabId >= 0) return `id:${row.tabId}`;
  if (row.url) return `url:${row.url.slice(0, 500)}`;
  return `idx:${index}`;
}

export function parseInteractionEvent(raw: unknown): TabInteractionEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ts = Number(r.ts);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const detail = typeof r.detail === "string" ? r.detail : "";
  const eventType =
    typeof r.eventType === "string"
      ? r.eventType
      : typeof r.event_type === "string"
        ? r.event_type
        : "unknown";
  const tid = r.tabId ?? r.tab_id;
  const tabId = Number.isFinite(Number(tid)) ? Math.round(Number(tid)) : null;
  const url = typeof r.url === "string" ? r.url : undefined;
  const title = typeof r.title === "string" ? r.title : undefined;
  return { ts, eventType, tabId, detail, ...(url ? { url } : {}), ...(title ? { title } : {}) };
}

/**
 * Prefer the snapshot that reflects the latest server time (WS uses receive time; HTTP must use DB `receivedAt`).
 */
export function pickFresherTabSnapshot(
  ws: BrowserTabAnalyticsSnapshot | undefined,
  http: BrowserTabAnalyticsSnapshot | undefined,
): BrowserTabAnalyticsSnapshot | undefined {
  if (!ws && !http) return undefined;
  if (!ws) return http;
  if (!http) return ws;
  const a = ws.updatedAtMs ?? 0;
  const b = http.updatedAtMs ?? 0;
  return a >= b ? ws : http;
}

/** Short label for UI, e.g. "Snapshot · 12s ago" */
export function formatSnapshotAgeRelative(updatedAtMs: number | undefined): string | null {
  if (updatedAtMs == null || !Number.isFinite(updatedAtMs)) return null;
  const sec = Math.max(0, Math.round((Date.now() - updatedAtMs) / 1000));
  if (sec < 45) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 120) return `${min}m ago`;
  const h = Math.floor(min / 60);
  return `${h}h ago`;
}

/**
 * Build a snapshot from signaling `GET /api/browser-tab-events` (HTTP fallback when
 * `browser-tab-events-update` WebSocket pushes are missing).
 * @param storedReceivedAtMs — DB `received_at` (epoch ms) so merge vs WebSocket snapshots is correct.
 */
export function browserTabSnapshotFromSignalingHttpEvent(
  clientId: number,
  ev: {
    browserName?: unknown;
    activeTabId?: unknown;
    tabs?: unknown;
    session?: unknown;
  },
  storedReceivedAtMs?: number | null,
): BrowserTabAnalyticsSnapshot {
  const session =
    ev.session && typeof ev.session === "object"
      ? (ev.session as Record<string, unknown>)
      : null;
  const rawTabs = Array.isArray(ev.tabs) ? ev.tabs : [];
  const tabs = rawTabs
    .map(parseBrowserTabRow)
    .filter((t): t is NonNullable<ReturnType<typeof parseBrowserTabRow>> => t !== null)
    .slice(0, 200);
  const rawRi =
    session && Array.isArray(session.recentInteractions) ? session.recentInteractions : [];
  const recentInteractions = rawRi
    .map(parseInteractionEvent)
    .filter((x): x is NonNullable<ReturnType<typeof parseInteractionEvent>> => x !== null)
    .slice(0, 120);
  const activeRaw = Number(ev.activeTabId);
  const activeTabId = Number.isFinite(activeRaw) ? Math.round(activeRaw) : null;
  const browserName =
    typeof ev.browserName === "string" && ev.browserName.trim()
      ? ev.browserName.trim()
      : "Chromium";
  const updatedAtMs =
    storedReceivedAtMs != null &&
    Number.isFinite(storedReceivedAtMs) &&
    storedReceivedAtMs > 0
      ? Math.round(storedReceivedAtMs)
      : Date.now();
  return {
    clientId,
    browserName,
    activeTabId,
    tabs,
    updatedAtMs,
    batchAccepted: 0,
    recentInteractions,
  };
}

/** Whether this log line is likely a clipboard/typing interaction for the sidebar. */
export function isUserInteractionLine(ev: TabInteractionEvent): boolean {
  const t = ev.eventType.toUpperCase();
  const d = ev.detail.toUpperCase();
  if (t.includes("INTERACTION") || t.includes("USER")) return true;
  if (d.includes("COPY") || d.includes("PASTE") || d.includes("CUT") || d.includes("TEXT")) return true;
  return false;
}

/** Best-effort total time on tab: server cumulative, else active + idle dwell in the current batch. */
export function tabTotalDwellMs(row: BrowserTabAnalyticsRow): number {
  if (row.totalActiveMs != null && row.totalActiveMs >= 0) {
    return row.totalActiveMs;
  }
  const idle = row.dwellIdleMs ?? 0;
  return Math.max(0, row.activeMs) + Math.max(0, idle);
}

export function formatActiveDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** What the user did — aligned with `client-dashboard/src/lib/browserTextActivity.ts`. */
export type AuditableKind = "copy" | "paste" | "type" | "cut" | "select";

/**
 * Per-tab aggregate lines like "Activity: 5 keys, 27 clicks" (not captured user text).
 * Auditors should not see these mixed with copy/paste/type.
 */
export function isActivityStatsNoise(parsed: {
  action: string;
  text: string;
  source: string;
}, rawDetail: string): boolean {
  const blob = `${parsed.action} ${parsed.text} ${rawDetail}`.toLowerCase();
  if (/activity:\s*\d+/.test(blob) && (/keys?/.test(blob) || /click/.test(blob))) return true;
  const t = parsed.text.trim().toLowerCase();
  if (t.startsWith("activity:") && /keys?/.test(t) && /click/.test(t)) return true;
  return false;
}

/** Same as client `looksLikeUserInteractionDetail` — bus lines start with `COPY from …`, etc. */
export function looksLikeUserInteractionDetail(detail: string): boolean {
  const d = detail.trimStart();
  return /^(COPY|PASTE|CUT|TYPE|SELECT|SEARCH)\s+from\s+/i.test(d);
}

/** USER_INTERACTION events or detail lines that match the extension-bus format. */
export function isUserInteractionEvent(ev: TabInteractionEvent): boolean {
  const t = String(ev.eventType || "").toUpperCase();
  if (t.includes("USER_INTERACTION")) return true;
  return looksLikeUserInteractionDetail(typeof ev.detail === "string" ? ev.detail : "");
}

/**
 * Classify as copy / paste / cut / select / typed text. Returns null for scroll, hover, aggregate activity, etc.
 * Order matches `classifyKind` in the client dashboard.
 */
export function classifyCopyPasteType(
  parsed: { action: string; text: string },
  ev: TabInteractionEvent,
): AuditableKind | null {
  const a = `${parsed.action} ${ev.eventType} ${ev.detail}`.toLowerCase();
  if (/\bpaste\b/.test(a)) return "paste";
  if (/\bcut\b/.test(a)) return "cut";
  if (/\bcopy\b/.test(a)) return "copy";
  if (/\bselect\b/.test(a)) return "select";
  if (/\bsearch\b/.test(a)) return "type";
  if (/\btype\b|\btyped\b|\bkeystroke\b|\binput\b|\bchar\b/.test(a)) return "type";
  return null;
}

function isSelectorOnlyUserInteractionDetail(detail: string): boolean {
  if (!detail) return false;
  if (!/\btarget:\s/.test(detail)) return false;
  return !/\btext:\s/i.test(detail) && !detail.includes(" text: '");
}

/** Reject only selector-only ` target: …` lines (no `text:` payload from the bus). */
export function isHumanCapturedTextDetail(detail: string): boolean {
  return !isSelectorOnlyUserInteractionDetail(detail);
}

/**
 * True when this event is a real copy, paste, or typed snippet with extractable text
 * (excludes per-tab key/click aggregates and non-text actions).
 */
export function isAuditableCopyPasteType(
  ev: TabInteractionEvent,
  parsed: { action: string; source: string; text: string },
): boolean {
  if (!isUserInteractionEvent(ev)) return false;
  if (!isHumanCapturedTextDetail(ev.detail)) return false;
  if (isActivityStatsNoise(parsed, ev.detail)) return false;
  const kind = classifyCopyPasteType(parsed, ev);
  if (!kind) return false;
  const text = parsed.text.trim();
  if (!text) return false;
  /** Rust emits `text: [redacted]` for sensitive fields — not displayable captured text. */
  if (/^\[redacted\]$/i.test(text)) return false;
  if (isActivityStatsNoise({ action: "", source: "", text }, text)) return false;
  return true;
}

/** Resolve tab title/domain from the current snapshot for display. */
export function findTabForInteraction(
  tabId: number | null,
  tabs: BrowserTabAnalyticsRow[],
): BrowserTabAnalyticsRow | null {
  if (tabId == null || tabId < 0) return null;
  return tabs.find((t) => t.tabId === tabId) ?? null;
}
