"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ClipboardPaste,
  Copy,
  Database,
  Loader2,
  MonitorSmartphone,
  Scissors,
  TextSelect,
  Type,
} from "lucide-react";
import type { AuditLiveClient } from "@/lib/auditTypes";
import {
  classifyCopyPasteType,
  isAuditableCopyPasteType,
  parseBrowserTabRow,
  parseInteractionEvent,
  tabRowKey,
  tabTitleAndHost,
  type AuditableKind,
  type BrowserTabAnalyticsRow,
} from "@/lib/browserTabAnalyticsTypes";
import { parseInteractionDetail } from "@/lib/parseInteractionDetail";

type RawEvent = {
  id: number;
  receivedAt: number;
  browserName?: string;
  activeTabId?: number | null;
  reason?: string | null;
  tabs?: unknown[];
  session?: { recentInteractions?: unknown[] };
};

type SnapshotRow = {
  key: string;
  kind: "snapshot";
  sortTime: number;
  eventDbId: number;
  receivedAt: number;
  browserName: string;
  reason: string | null;
  activeTabId: number | null;
  tabs: BrowserTabAnalyticsRow[];
};

type TextRow = {
  key: string;
  kind: "text";
  sortTime: number;
  eventDbId: number;
  receivedAt: number;
  auditable: AuditableKind;
  detail: string;
  text: string;
  tabId: number | null;
};

type TimelineRow = SnapshotRow | TextRow;

function formatLocal(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string): string {
  try {
    const [y, m, day] = key.split("-").map(Number);
    const d = new Date(y, m - 1, day);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  } catch {
    return key;
  }
}

function kindIcon(k: AuditableKind) {
  if (k === "paste") return ClipboardPaste;
  if (k === "copy") return Copy;
  if (k === "cut") return Scissors;
  if (k === "select") return TextSelect;
  return Type;
}

function kindLabel(k: AuditableKind): string {
  if (k === "paste") return "Paste";
  if (k === "copy") return "Copy";
  if (k === "cut") return "Cut";
  if (k === "select") return "Select";
  return "Type";
}

function flattenEvents(raw: RawEvent[]): TimelineRow[] {
  const out: TimelineRow[] = [];
  for (const ev of raw) {
    const receivedAt = Number(ev.receivedAt);
    if (!Number.isFinite(receivedAt)) continue;
    const tabsRaw = Array.isArray(ev.tabs) ? ev.tabs : [];
    const tabs = tabsRaw.map(parseBrowserTabRow).filter((t): t is BrowserTabAnalyticsRow => t !== null);
    out.push({
      key: `snap-${ev.id}`,
      kind: "snapshot",
      sortTime: receivedAt,
      eventDbId: ev.id,
      receivedAt,
      browserName: typeof ev.browserName === "string" && ev.browserName.trim() ? ev.browserName.trim() : "Browser",
      reason: typeof ev.reason === "string" ? ev.reason : null,
      activeTabId:
        ev.activeTabId != null && Number.isFinite(Number(ev.activeTabId)) ? Math.round(Number(ev.activeTabId)) : null,
      tabs,
    });

    const ri = ev.session?.recentInteractions;
    if (!Array.isArray(ri)) continue;
    let i = 0;
    for (const rawInt of ri) {
      const tev = parseInteractionEvent(rawInt);
      if (!tev) continue;
      const parsed = parseInteractionDetail(tev.detail);
      if (!isAuditableCopyPasteType(tev, parsed)) continue;
      const auditable = classifyCopyPasteType(parsed, tev);
      if (!auditable) continue;
      const sortTime = Number.isFinite(tev.ts) && tev.ts > 0 ? tev.ts : receivedAt;
      out.push({
        key: `txt-${ev.id}-${i}-${tev.ts}`,
        kind: "text",
        sortTime,
        eventDbId: ev.id,
        receivedAt,
        auditable,
        detail: tev.detail,
        text: parsed.text.trim(),
        tabId: tev.tabId,
      });
      i += 1;
    }
  }
  out.sort((a, b) => b.sortTime - a.sortTime);
  return out;
}

type FilterMode = "all" | "snapshot" | "text";

export function ExtensionHistoryTimeline({
  orgId,
  clientId,
  memberLabel,
  signalingSessionToken,
  days = 7,
}: {
  orgId: number;
  clientId: number;
  memberLabel: string;
  signalingSessionToken: string | null;
  days?: number;
}) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<RawEvent[]>([]);

  const load = useCallback(async () => {
    if (!signalingSessionToken || !Number.isFinite(orgId) || !Number.isFinite(clientId)) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const u = new URL("/api/audit/browser-extension-timeline", window.location.origin);
      u.searchParams.set("signalOrgId", String(orgId));
      u.searchParams.set("signalClientId", String(clientId));
      u.searchParams.set("days", String(days));
      const res = await fetch(u.toString(), {
        credentials: "include",
        headers: { "x-signaling-session": signalingSessionToken },
      });
      const j = (await res.json()) as {
        error?: string;
        events?: RawEvent[];
        disabled?: boolean;
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Failed to load history");
        setEvents([]);
        return;
      }
      if (j.disabled) {
        setEvents([]);
        setError("Extension telemetry is disabled on the signaling server.");
        return;
      }
      setEvents(Array.isArray(j.events) ? j.events : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, clientId, signalingSessionToken, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => flattenEvents(events), [events]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "snapshot") return rows.filter((r) => r.kind === "snapshot");
    return rows.filter((r) => r.kind === "text");
  }, [rows, filter]);

  const byDay = useMemo(() => {
    const m = new Map<string, TimelineRow[]>();
    for (const r of filtered) {
      const k = dayKey(r.sortTime);
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] overflow-hidden">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]/40 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              7-day browser audit trail
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
              Stored snapshots and captured text (copy, paste, cut, select, type) for{" "}
              <span className="font-medium text-[var(--color-text-secondary)]">{memberLabel}</span>
              {" — "}
              same retention as the signaling database (typically {days} days).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || !signalingSessionToken}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
              Refresh
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All"],
              ["snapshot", "Tab snapshots"],
              ["text", "Text activity"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                filter === id
                  ? "border-[var(--color-accent-border)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        {!signalingSessionToken ? (
          <p className="text-[12px] text-[var(--color-text-muted)]">
            Waiting for a live signaling session — history loads after the dashboard connects and authenticates.
          </p>
        ) : loading && events.length === 0 ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
            <Loader2 size={14} className="animate-spin shrink-0" />
            Loading stored extension events…
          </div>
        ) : error ? (
          <p className="text-[12px] text-red-700">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-[12px] text-[var(--color-text-muted)]">
            No extension batches in the selected window for this member. Data appears after the client ingests browser
            activity into the signaling server.
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {byDay.map(([dk, dayRows]) => (
              <section key={dk}>
                <div className="mb-3 flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
                  <Calendar size={14} className="text-[var(--color-text-muted)]" />
                  <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">{dayLabel(dk)}</span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    {dayRows.length} event{dayRows.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="flex flex-col gap-3">
                  {dayRows.map((row) =>
                    row.kind === "snapshot" ? (
                      <li
                        key={row.key}
                        className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/30 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <MonitorSmartphone size={14} className="text-[var(--color-accent)] shrink-0" />
                          <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">
                            Tab snapshot
                          </span>
                          <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
                            {formatLocal(row.receivedAt)}
                          </span>
                          <span className="text-[10px] rounded-full bg-[var(--color-bg-surface)] px-2 py-0.5 font-mono text-[var(--color-text-tertiary)]">
                            batch #{row.eventDbId}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                          {row.browserName}
                          {row.reason ? (
                            <span className="text-[var(--color-text-muted)]"> · {row.reason}</span>
                          ) : null}
                        </p>
                        {row.tabs.length > 0 ? (
                          <ul className="mt-2 space-y-1.5 border-l border-[var(--color-border)] pl-3">
                            {row.tabs.slice(0, 12).map((t, i) => {
                              const { title, host } = tabTitleAndHost(t);
                              const active =
                                t.isActive ||
                                (row.activeTabId != null && t.tabId != null && t.tabId === row.activeTabId);
                              return (
                                <li key={tabRowKey(t, i)} className="text-[11px] leading-snug">
                                  {active ? (
                                    <span className="mr-1 text-[9px] font-bold uppercase text-[var(--color-accent)]">
                                      Active
                                    </span>
                                  ) : null}
                                  <span className="font-medium text-[var(--color-text-primary)]">{title}</span>
                                  {host ? (
                                    <span className="block font-mono text-[10px] text-[var(--color-text-muted)]">
                                      {host}
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">No tab list in this batch.</p>
                        )}
                      </li>
                    ) : (
                      <li
                        key={row.key}
                        className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {(() => {
                            const Icon = kindIcon(row.auditable);
                            return <Icon size={14} className="shrink-0 text-[var(--color-accent)]" />;
                          })()}
                          <span className="rounded-md bg-[var(--color-accent-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
                            {kindLabel(row.auditable)}
                          </span>
                          <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
                            {formatLocal(row.sortTime)}
                          </span>
                          {row.tabId != null ? (
                            <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
                              tab {row.tabId}
                            </span>
                          ) : null}
                        </div>
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--color-bg-elevated)] px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--color-text-primary)]">
                          {row.text}
                        </pre>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MemberClientPicker({
  orgId,
  currentClientId,
  teamClients,
}: {
  orgId: number;
  currentClientId: number;
  teamClients: AuditLiveClient[];
}) {
  const router = useRouter();
  const sorted = useMemo(
    () => [...teamClients].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [teamClients],
  );

  if (sorted.length <= 1) return null;

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <label htmlFor="audit-member-select" className="text-[11px] font-medium text-[var(--color-text-muted)] shrink-0">
        Member
      </label>
      <select
        id="audit-member-select"
        className="h-9 max-w-full min-w-[12rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/15"
        value={String(currentClientId)}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isFinite(next) || next <= 0) return;
          router.push(`/audit/${orgId}/${next}/analytics`);
        }}
      >
        {sorted.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.fullName}
            {c.device ? ` — ${c.device}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
