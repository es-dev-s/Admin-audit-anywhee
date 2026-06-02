"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ClipboardPaste,
  Copy,
  LayoutList,
  Scissors,
  TextSelect,
  Type,
  Filter as FilterIcon,
} from "lucide-react";
import { AnimatedPage } from "@/components/ui/AnimatedPage";
import { useAuditSignaling } from "@/context/audit-signaling-context";
import { useBrowserTabSnapshotMerge } from "@/hooks/useBrowserTabSnapshotMerge";
import { useSignalingStreamAuth } from "@/hooks/useSignalingStreamAuth";
import { memberOrgPlainText } from "@/lib/memberOrgDisplay";
import { useUIStore } from "@/store/uiStore";
import type { AuditableKind } from "@/lib/browserTabAnalyticsTypes";
import {
  classifyCopyPasteType,
  findTabForInteraction,
  formatActiveDuration,
  isAuditableCopyPasteType,
  tabRowKey,
} from "@/lib/browserTabAnalyticsTypes";
import { parseInteractionDetail } from "@/lib/parseInteractionDetail";
import { auditAnalyticsPath } from "@/lib/auditNav";
import { useAuditBackNav } from "@/hooks/useAuditBackNav";

type FilterKind = "all" | AuditableKind;

function kindIcon(kind: AuditableKind) {
  if (kind === "paste") return ClipboardPaste;
  if (kind === "copy") return Copy;
  if (kind === "cut") return Scissors;
  if (kind === "select") return TextSelect;
  return Type;
}

function kindHeading(kind: AuditableKind): string {
  if (kind === "paste") return "Pasted text";
  if (kind === "copy") return "Copied text";
  if (kind === "cut") return "Cut text";
  if (kind === "select") return "Selected text";
  return "Typed text";
}

function kindBadgeLabel(kind: AuditableKind): string {
  if (kind === "paste") return "Paste";
  if (kind === "copy") return "Copy";
  if (kind === "cut") return "Cut";
  if (kind === "select") return "Select";
  return "Type";
}

function hostFromUrl(url: string | undefined): string {
  if (!url?.trim()) return "";
  try {
    return new URL(url).hostname || "";
  } catch {
    return "";
  }
}

function formatTs(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  } catch {
    return String(ts);
  }
}

export default function BrowserActivityLogPage() {
  const params = useParams<{ teamId: string; memberId: string }>();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const orgId = Number(params.teamId);
  const clientId = Number(params.memberId);
  const { backHref, backLabel } = useAuditBackNav(orgId, from);

  const streamAuth = useSignalingStreamAuth(orgId, clientId);
  const { getClient, getBrowserTabAnalytics, connectionStatus, signalingSessionToken } =
    useAuditSignaling();

  const client = Number.isFinite(clientId) && clientId > 0 ? getClient(clientId) : undefined;
  const wsSnapshot =
    Number.isFinite(clientId) && clientId > 0 ? getBrowserTabAnalytics(clientId) : undefined;
  const snapshot = useBrowserTabSnapshotMerge(orgId, clientId, wsSnapshot, {
    enabled:
      Number.isFinite(orgId) &&
      orgId > 0 &&
      Number.isFinite(clientId) &&
      clientId > 0 &&
      streamAuth.status === "authorized",
    signalingSessionToken,
    live: connectionStatus === "Live",
  });

  const memberName = client?.fullName ?? `Client ${clientId}`;
  const orgName = client?.orgName ?? null;
  const claimedOrgName = client?.claimedOrgName ?? null;
  const headerSubtitle = memberOrgPlainText(memberName, orgName, orgId, claimedOrgName);
  const live = connectionStatus === "Live";

  const [filter, setFilter] = useState<FilterKind>("all");

  const headerKey = `${orgId}::${clientId}::${headerSubtitle}`;
  useEffect(() => {
    if (!Number.isFinite(orgId) || orgId <= 0 || !Number.isFinite(clientId) || clientId <= 0) return;
    useUIStore.getState().setHeader("Browser activity log", headerSubtitle);
    return () => useUIStore.getState().setHeader("", "");
  }, [headerKey, orgId, clientId, headerSubtitle]);

  const parentAnalyticsHref = useMemo(() => {
    if (Number.isFinite(orgId) && orgId > 0 && Number.isFinite(clientId) && clientId > 0) {
      return auditAnalyticsPath(orgId, clientId, from);
    }
    return "/audit";
  }, [orgId, clientId, from]);

  /** Same rules as the client dashboard: auditable text lines only (hides tab aggregates, selector-only, etc.). */
  const auditableEvents = useMemo(() => {
    const raw = snapshot?.recentInteractions ?? [];
    return [...raw]
      .filter((ev) => isAuditableCopyPasteType(ev, parseInteractionDetail(ev.detail)))
      .sort((a, b) => b.ts - a.ts);
  }, [snapshot?.recentInteractions]);

  const filteredEvents = useMemo(() => {
    return auditableEvents.filter((ev) => {
      const kind = classifyCopyPasteType(parseInteractionDetail(ev.detail), ev);
      if (!kind) return false;
      if (filter === "all") return true;
      return kind === filter;
    });
  }, [auditableEvents, filter]);

  const totalRawInteractions = snapshot?.recentInteractions?.length ?? 0;

  if (!Number.isFinite(clientId) || clientId <= 0) {
    return (
      <AnimatedPage>
        <p className="text-[12px] text-[var(--color-text-muted)]">Invalid member.</p>
      </AnimatedPage>
    );
  }

  if (streamAuth.status === "loading") {
    return (
      <AnimatedPage>
        <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]" />
          <p className="text-[12px] text-[var(--color-text-muted)]">Checking access…</p>
        </div>
      </AnimatedPage>
    );
  }

  if (streamAuth.status === "denied") {
    return (
      <AnimatedPage>
        <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-2 text-center">
          <p className="text-[13px] font-medium text-[var(--color-text-secondary)]">Access denied</p>
          <p className="max-w-md text-[12px] text-[var(--color-text-muted)]">{streamAuth.message}</p>
          <Link
            href={parentAnalyticsHref}
            className="mt-4 inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
          >
            <ChevronLeft size={14} /> Back
          </Link>
        </div>
      </AnimatedPage>
    );
  }

  const tabs = snapshot?.tabs ?? [];

  return (
    <AnimatedPage>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Link
            href={parentAnalyticsHref}
            className="inline-flex w-fit items-center gap-1 text-[12px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          >
            <ChevronLeft size={14} /> Back to browser analytics
          </Link>
          <Link
            href={backHref}
            className="inline-flex w-fit items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-muted)]"
          >
            {backLabel}
          </Link>
        </div>
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium ${
            live
              ? "border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]"
              : "border-[var(--color-status-pending-border)] bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-text)]"
          }`}
        >
          <LayoutList size={12} />
          Signaling {live ? "live" : "disconnected"} — snapshot reflects latest extension batch
        </div>
      </div>

      {!snapshot ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-surface)] px-6 py-14 text-center">
          <p className="text-[13px] font-medium text-[var(--color-text-secondary)]">No extension data yet</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] text-[var(--color-text-muted)]">
            Keep the member&apos;s client and BrowserScope extension running. Activity will appear here as events
            arrive.
          </p>
        </div>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
              Live snapshot — tabs & time on tab
            </h2>
            <p className="mb-3 text-[12px] text-[var(--color-text-muted)]">
              From the latest live extension batch. The 7-day stored audit trail (database) is on the{" "}
              <Link href={parentAnalyticsHref} className="font-medium text-[var(--color-accent)] hover:underline">
                Browser analytics
              </Link>{" "}
              page for this member.
            </p>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-surface-2)]">
                      <th
                        scope="col"
                        className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]"
                      >
                        Title
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]"
                      >
                        Host / URL
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]"
                      >
                        Active dwell
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]"
                      >
                        Idle dwell
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]"
                      >
                        Keys / clicks
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-[12px] text-[var(--color-text-muted)]">
                          No tabs in the latest snapshot.
                        </td>
                      </tr>
                    ) : (
                      tabs.map((row, i) => {
                        const k = tabRowKey(row, i);
                        const focused =
                          row.isActive ||
                          (row.tabId != null &&
                            snapshot.activeTabId != null &&
                            row.tabId === snapshot.activeTabId);
                        return (
                          <tr
                            key={k}
                            className={`border-b border-[var(--color-border)] last:border-b-0 ${
                              focused ? "bg-[var(--color-accent-subtle)]/50" : "hover:bg-[var(--color-bg-surface-2)]"
                            }`}
                          >
                            <td className="px-4 py-3 text-[13px] font-medium text-[var(--color-text-primary)]">
                              {row.title || "(untitled)"}
                            </td>
                            <td className="max-w-[280px] px-4 py-3">
                              <span
                                className="block truncate font-mono text-[11px] text-[var(--color-text-secondary)]"
                                title={row.url}
                              >
                                {row.domain || row.url || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums text-[var(--color-text-secondary)]">
                              {formatActiveDuration(row.activeMs)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums text-[var(--color-text-muted)]">
                              {row.dwellIdleMs != null && row.dwellIdleMs > 0
                                ? formatActiveDuration(row.dwellIdleMs)
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-center text-[11px] text-[var(--color-text-secondary)]">
                              {row.keystrokes != null || row.clicks != null ? (
                                <span className="tabular-nums">
                                  {row.keystrokes ?? "—"} / {row.clicks ?? "—"}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
                Copy, paste, cut, select & typing
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                  <FilterIcon size={12} /> Filter
                </span>
                {(
                  [
                    ["all", "All"],
                    ["copy", "Copy"],
                    ["paste", "Paste"],
                    ["cut", "Cut"],
                    ["select", "Select"],
                    ["type", "Type"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id as FilterKind)}
                    className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                      filter === id
                        ? "border-[var(--color-accent-border)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                        : "border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface-2)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-6 py-12 text-center">
                <p className="text-[13px] text-[var(--color-text-secondary)]">
                  {totalRawInteractions === 0
                    ? "No interaction lines in the current buffer yet."
                    : auditableEvents.length === 0
                      ? "No copy, paste, cut, select, or typing events with captured text in the current buffer. Summary lines (for example tab activity counts) are not shown here."
                      : "No events match this filter."}
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {filteredEvents.map((ev, i) => {
                  const parsed = parseInteractionDetail(ev.detail);
                  const kind = classifyCopyPasteType(parsed, ev)!;
                  const Icon = kindIcon(kind);
                  const text = parsed.text.trim();
                  const tabRow = findTabForInteraction(ev.tabId, tabs);
                  const tabTitle =
                    tabRow?.title?.trim() ||
                    ev.title?.trim() ||
                    (ev.tabId != null ? `Tab ${ev.tabId}` : "Unknown tab");
                  const tabHost =
                    tabRow?.domain?.trim() ||
                    hostFromUrl(ev.url) ||
                    hostFromUrl(tabRow?.url) ||
                    "";
                  return (
                    <li
                      key={`${ev.ts}-${i}-${kind}`}
                      className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4 shadow-[var(--shadow-xs)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <Icon
                            size={16}
                            className="mt-0.5 shrink-0 text-[var(--color-accent)]"
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-[var(--color-accent-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-accent)]">
                                {kindBadgeLabel(kind)}
                              </span>
                              <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
                                {formatTs(ev.ts)}
                              </span>
                            </div>
                            <p className="mt-2 text-[13px] font-semibold text-[var(--color-text-primary)]">
                              {kindHeading(kind)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-[var(--input-radius)] border border-[var(--color-border)] bg-[var(--color-bg-surface-2)] px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                          Tab
                        </p>
                        <p className="mt-0.5 text-[13px] font-medium text-[var(--color-text-primary)]">{tabTitle}</p>
                        {tabHost ? (
                          <p className="mt-0.5 font-mono text-[12px] text-[var(--color-text-secondary)]">{tabHost}</p>
                        ) : null}
                        {ev.tabId != null ? (
                          <p className="mt-1 font-mono text-[10px] text-[var(--color-text-tertiary)]">
                            Chrome tab id {ev.tabId}
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-3">
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[var(--input-radius)] bg-[var(--color-bg-surface-2)] px-3 py-2.5 font-mono text-[13px] leading-relaxed text-[var(--color-text-primary)] ring-1 ring-[var(--color-border)]">
                          {text}
                        </pre>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </AnimatedPage>
  );
}
