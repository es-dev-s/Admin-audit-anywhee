"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  Clock,
  MousePointerClick,
  Keyboard,
  ScrollText,
  Copy,
  ClipboardPaste,
  Scissors,
  TextSelect,
  Type,
} from "lucide-react";
import type {
  BrowserTabAnalyticsRow,
  BrowserTabAnalyticsSnapshot,
  TabInteractionEvent,
} from "@/lib/browserTabAnalyticsTypes";
import { formatActiveDuration, isAuditableCopyPasteType } from "@/lib/browserTabAnalyticsTypes";
import {
  parseInteractionDetail,
  type ParsedInteractionDetail,
} from "@/lib/parseInteractionDetail";

/** Time only — auditors care when it happened, not a wall of metadata. */
function formatAuditorTime(ts: number): string {
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

function titleCaseAction(action: string): string {
  const a = action.trim();
  if (!a) return "Activity";
  const lower = a.toLowerCase();
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
}

function iconForParsed(parsed: ParsedInteractionDetail, eventType: string) {
  const blob = `${parsed.action} ${eventType}`.toUpperCase();
  if (blob.includes("PASTE")) return ClipboardPaste;
  if (blob.includes("CUT")) return Scissors;
  if (blob.includes("COPY")) return Copy;
  if (blob.includes("SELECT")) return TextSelect;
  if (blob.includes("TYPE") || blob.includes("KEY") || blob.includes("SEARCH")) return Type;
  return MousePointerClick;
}

function displaySource(
  parsed: ParsedInteractionDetail,
  tab: BrowserTabAnalyticsRow,
): string {
  if (parsed.source.trim()) return parsed.source.trim();
  if (tab.url) {
    try {
      return new URL(tab.url).hostname || tab.domain || "";
    } catch {
      return tab.domain || tab.url;
    }
  }
  return tab.domain || "";
}

function eventsForTab(events: TabInteractionEvent[], row: BrowserTabAnalyticsRow): TabInteractionEvent[] {
  const rowHost = row.domain || (() => {
    try {
      return row.url ? new URL(row.url).hostname : "";
    } catch {
      return "";
    }
  })();
  return events
    .filter((ev) => {
      if (row.tabId != null && ev.tabId != null && ev.tabId === row.tabId) return true;
      if (ev.url && row.url && ev.url === row.url) return true;
      if (ev.url && rowHost) {
        try {
          if (new URL(ev.url).hostname === rowHost) return true;
        } catch {
          if (ev.url.includes(rowHost)) return true;
        }
      }
      if (rowHost && ev.detail.includes(rowHost)) return true;
      if (row.title && ev.title && row.title === ev.title) return true;
      return false;
    })
    .sort((a, b) => b.ts - a.ts);
}

export function BrowserTabDetailSidebar({
  snapshot,
  tab,
  onClose,
}: {
  snapshot: BrowserTabAnalyticsSnapshot;
  tab: BrowserTabAnalyticsRow;
  onClose: () => void;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const ageSinceSnapshotMs = Date.now() - snapshot.updatedAtMs;
  const isFocused = tab.isActive || (tab.tabId != null && snapshot.activeTabId === tab.tabId);
  const liveExtraMs =
    isFocused && ageSinceSnapshotMs >= 0 && ageSinceSnapshotMs < 180_000 ? ageSinceSnapshotMs : 0;
  const displayedActiveMs = tab.activeMs + (isFocused ? liveExtraMs : 0);

  const interactions = useMemo(
    () =>
      eventsForTab(snapshot.recentInteractions, tab)
        .filter((ev) => isAuditableCopyPasteType(ev, parseInteractionDetail(ev.detail)))
        .sort((a, b) => b.ts - a.ts),
    [snapshot.recentInteractions, tab],
  );
  const sessionInteractions = useMemo(
    () =>
      [...snapshot.recentInteractions]
        .filter((ev) => isAuditableCopyPasteType(ev, parseInteractionDetail(ev.detail)))
        .sort((a, b) => b.ts - a.ts),
    [snapshot.recentInteractions],
  );

  const textActivityEvents =
    interactions.length > 0 ? interactions : sessionInteractions;

  void tick;

  return (
    <>
      <button
        type="button"
        aria-label="Close tab details"
        className="fixed inset-x-0 bottom-0 top-[var(--topbar-h)] z-[150] bg-black/40 md:hidden"
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: 28, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 28, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className={
          "fixed right-0 top-[var(--topbar-h)] z-[150] flex w-full max-w-md flex-col " +
          "bottom-0 h-[calc(100dvh-var(--topbar-h))] border-l border-[var(--color-border)] bg-[var(--color-bg-surface)] " +
          "md:w-[min(28rem,40vw)] md:max-w-none"
        }
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Tab detail
            </p>
            <h2 className="mt-1 line-clamp-2 text-[14px] font-semibold text-[var(--color-text-primary)]">
              {tab.title || "(untitled)"}
            </h2>
            <p className="mt-0.5 line-clamp-2 break-all font-mono text-[11px] text-[var(--color-text-muted)]">
              {tab.url || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/40 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                <Clock size={11} /> Active dwell
              </div>
              <p className="mt-1 text-[18px] font-semibold tabular-nums text-[var(--color-text-primary)]">
                {formatActiveDuration(displayedActiveMs)}
              </p>
              {isFocused ? (
                <p className="mt-1 text-[10px] text-emerald-700">
                  Still focused — includes ~{formatActiveDuration(liveExtraMs)} since last snapshot
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">Tab not focused now</p>
              )}
            </div>
            {tab.dwellIdleMs != null && tab.dwellIdleMs > 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/40 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Idle on tab
                </div>
                <p className="mt-1 text-[18px] font-semibold tabular-nums text-[var(--color-text-primary)]">
                  {formatActiveDuration(tab.dwellIdleMs)}
                </p>
              </div>
            ) : null}
          </div>

          {(tab.keystrokes != null && tab.keystrokes > 0) ||
          (tab.scrollPx != null && tab.scrollPx > 0) ||
          (tab.mousePx != null && tab.mousePx > 0) ||
          (tab.clicks != null && tab.clicks > 0) ? (
            <div className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Activity counts (batch)
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {tab.keystrokes != null ? (
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-2 text-center">
                    <Keyboard size={12} className="mx-auto text-[var(--color-text-muted)]" />
                    <p className="mt-1 text-[14px] font-semibold tabular-nums text-[var(--color-text-secondary)]">
                      {tab.keystrokes}
                    </p>
                    <p className="text-[9px] uppercase text-[var(--color-text-muted)]">Keys</p>
                  </div>
                ) : null}
                {tab.clicks != null ? (
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-2 text-center">
                    <MousePointerClick size={12} className="mx-auto text-[var(--color-text-muted)]" />
                    <p className="mt-1 text-[14px] font-semibold tabular-nums text-[var(--color-text-secondary)]">
                      {tab.clicks}
                    </p>
                    <p className="text-[9px] uppercase text-[var(--color-text-muted)]">Clicks</p>
                  </div>
                ) : null}
                {tab.scrollPx != null ? (
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-2 text-center">
                    <ScrollText size={12} className="mx-auto text-[var(--color-text-muted)]" />
                    <p className="mt-1 text-[13px] font-semibold tabular-nums text-[var(--color-text-secondary)]">
                      {Math.round(tab.scrollPx)}
                    </p>
                    <p className="text-[9px] uppercase text-[var(--color-text-muted)]">Scroll px</p>
                  </div>
                ) : null}
                {tab.mousePx != null ? (
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-2 text-center">
                    <MousePointerClick size={12} className="mx-auto text-[var(--color-text-muted)]" />
                    <p className="mt-1 text-[13px] font-semibold tabular-nums text-[var(--color-text-secondary)]">
                      {Math.round(tab.mousePx)}
                    </p>
                    <p className="text-[9px] uppercase text-[var(--color-text-muted)]">Mouse px</p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Captured text on this tab
            </h3>
            {textActivityEvents.length === 0 ? (
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
                No captured copy, paste, or typing in the current buffer for this tab.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {textActivityEvents.map((ev, i) => {
                  const parsed = parseInteractionDetail(ev.detail);
                  const Icon = iconForParsed(parsed, ev.eventType);
                  const src = displaySource(parsed, tab);
                  const label = titleCaseAction(parsed.action);
                  return (
                    <li
                      key={`${ev.ts}-${i}`}
                      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/25 px-3 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <Icon size={14} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                        <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                          {label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12px] text-[var(--color-text-secondary)]">
                        {formatAuditorTime(ev.ts)}
                      </p>
                      {src ? (
                        <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">{src}</p>
                      ) : null}
                      <p className="mt-3 whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-[var(--color-bg-surface)] px-3 py-2 font-mono text-[13px] leading-relaxed text-[var(--color-text-primary)]">
                        {parsed.text.trim()}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </motion.aside>
    </>
  );
}
