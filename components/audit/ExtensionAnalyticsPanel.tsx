"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ListTree, Radio } from "lucide-react";
import type { AuditLiveClient } from "@/lib/auditTypes";
import type {
  BrowserTabAnalyticsSnapshot,
  BrowserTabAnalyticsRow,
} from "@/lib/browserTabAnalyticsTypes";
import { formatActiveDuration, tabRowKey } from "@/lib/browserTabAnalyticsTypes";
import { BrowserTabDetailSidebar } from "@/components/audit/BrowserTabDetailSidebar";
import { MemberOrgLabel } from "@/components/audit/MemberOrgLabel";
import { ExtensionHistoryTimeline, MemberClientPicker } from "@/components/audit/ExtensionHistoryTimeline";

function Favicon({ url, title }: { url: string; title: string }) {
  if (!url) {
    return (
      <div className="h-4 w-4 shrink-0 rounded bg-[var(--color-bg-elevated)] border border-[var(--color-border)]" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-4 w-4 shrink-0 rounded-sm"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function TabRow({
  row,
  activeTabId,
  selected,
  onSelect,
}: {
  row: BrowserTabAnalyticsRow;
  activeTabId: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const isFocused =
    row.isActive || (row.tabId != null && activeTabId != null && row.tabId === activeTabId);
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`cursor-pointer transition-colors ${
        selected
          ? "bg-[var(--color-accent)]/15 ring-1 ring-inset ring-[var(--color-accent)]/40"
          : isFocused
            ? "bg-[var(--color-accent)]/8 border-l-2 border-l-[var(--color-accent)]"
            : "hover:bg-[var(--color-bg-hover)]"
      }`}
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Favicon url={row.favIconUrl} title={row.title} />
          <span className="text-[12px] font-medium text-[var(--color-text-primary)] truncate">
            {row.title || "(untitled)"}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 max-w-[280px]">
        <span
          className="text-[11px] text-[var(--color-text-muted)] font-mono truncate block"
          title={row.url}
        >
          {row.domain || row.url || "—"}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className="text-[11px] tabular-nums text-[var(--color-text-secondary)]">
          {formatActiveDuration(row.activeMs)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center">
        {isFocused ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
            <Radio size={10} /> Active
          </span>
        ) : (
          <span className="text-[10px] text-[var(--color-text-muted)]">—</span>
        )}
      </td>
    </tr>
  );
}

export function ExtensionAnalyticsPanel({
  orgId,
  clientId,
  teamClients,
  signalingSessionToken,
  memberName,
  orgName,
  claimedOrgName,
  snapshot,
  signalingConnected,
  activityLogHref,
}: {
  orgId: number;
  clientId: number;
  /** Clients in this signaling org — used to switch the audited member. */
  teamClients: AuditLiveClient[];
  /** From signaling WebSocket login — required to load 7-day DB history via proxy API. */
  signalingSessionToken: string | null;
  memberName: string;
  orgName?: string | null;
  claimedOrgName?: string | null;
  snapshot: BrowserTabAnalyticsSnapshot | undefined;
  signalingConnected: boolean;
  /** When set, shows a button to the full timeline (tabs + copy/paste/type with timestamps). */
  activityLogHref?: string;
}) {
  const now = Date.now();
  const ageMs = snapshot ? now - snapshot.updatedAtMs : null;
  const isFresh = ageMs != null && ageMs < 8000;
  const tabs = snapshot?.tabs ?? [];

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedRow = useMemo(() => {
    if (!selectedKey || !snapshot) return null;
    const idx = tabs.findIndex((t, i) => tabRowKey(t, i) === selectedKey);
    if (idx < 0) return null;
    return tabs[idx];
  }, [selectedKey, snapshot, tabs]);

  const sidebarOpen = !!(snapshot && selectedRow);

  return (
    <div className="relative flex w-full flex-col gap-0 md:flex-row md:items-stretch">
      <motion.div
        layout
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className={`flex min-w-0 flex-1 flex-col gap-6 transition-[padding] duration-300 ease-out ${
          sidebarOpen ? "md:pr-[min(28rem,40vw)]" : ""
        }`}
      >
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-4 shadow-[var(--shadow-sm)] sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
                Browser analytics
              </h1>
              <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
                Live feed and stored 7-day trail for{" "}
                <MemberOrgLabel
                  fullName={memberName}
                  claimedOrgName={claimedOrgName}
                  orgName={orgName}
                  orgId={orgId}
                  size="sm"
                  className="inline-flex max-w-full align-middle"
                />
                {" — "}
                <span className="text-[var(--color-text-muted)]">
                  Pick a member below, then review live tabs or scroll the audit trail for copy/paste and typing.
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activityLogHref ? (
                <Link
                  href={activityLogHref}
                  className="inline-flex h-9 items-center gap-2 rounded-[var(--input-radius)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-[12px] font-semibold text-[var(--color-accent)] shadow-[var(--shadow-xs)] transition-colors hover:bg-[var(--color-accent-subtle)] hover:border-[var(--color-accent-border)]"
                >
                  <ListTree size={14} aria-hidden />
                  Full activity log
                </Link>
              ) : null}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  signalingConnected
                    ? "border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700"
                }`}
              >
                <Activity size={12} />
                Signaling {signalingConnected ? "connected" : "disconnected"}
              </span>
              {snapshot ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    isFresh
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
                      : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]"
                  }`}
                >
                  <Radio size={12} className={isFresh ? "text-emerald-600" : undefined} />
                  {isFresh ? "Live feed" : "Last update"}
                  {ageMs != null && (
                    <span className="tabular-nums opacity-80">
                      {ageMs < 60_000
                        ? `${Math.max(0, Math.round(ageMs / 1000))}s ago`
                        : `${Math.round(ageMs / 60_000)}m ago`}
                    </span>
                  )}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3 sm:px-5">
          <MemberClientPicker orgId={orgId} currentClientId={clientId} teamClients={teamClients} />
        </div>

        {!snapshot ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-surface)] px-6 py-14 text-center">
            <p className="text-[13px] font-medium text-[var(--color-text-secondary)]">No extension data yet</p>
            <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-[var(--color-text-muted)]">
              When the member&apos;s AnyWhere client is running with the BrowserScope extension and activity
              telemetry is enabled on the signaling server, open tabs and dwell time appear here in real time.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Browser
                </p>
                <p className="mt-1 text-[15px] font-semibold text-[var(--color-text-primary)]">
                  {snapshot.browserName}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Open tabs
                </p>
                <p className="mt-1 text-[15px] font-semibold tabular-nums text-[var(--color-text-primary)]">
                  {tabs.length}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Events ingested (batch)
                </p>
                <p className="mt-1 text-[15px] font-semibold tabular-nums text-[var(--color-text-primary)]">
                  {snapshot.batchAccepted}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
              <div className="border-b border-[var(--color-border)] px-4 py-2.5">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Tabs & time on tab (live)
                </h2>
                <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                  Current open tabs from the latest extension batch — select a row for per-tab captured text.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]/50">
                      <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                        Title
                      </th>
                      <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                        Host / URL
                      </th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                        Active dwell
                      </th>
                      <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                        Focus
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabs.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-8 text-center text-[12px] text-[var(--color-text-muted)]"
                        >
                          No open tabs in the last snapshot.
                        </td>
                      </tr>
                    ) : (
                      tabs.map((row, i) => {
                        const k = tabRowKey(row, i);
                        return (
                          <TabRow
                            key={k}
                            row={row}
                            activeTabId={snapshot.activeTabId}
                            selected={selectedKey === k}
                            onSelect={() => setSelectedKey((prev) => (prev === k ? null : k))}
                          />
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <ExtensionHistoryTimeline
          orgId={orgId}
          clientId={clientId}
          memberLabel={memberName}
          signalingSessionToken={signalingSessionToken}
          days={7}
        />
      </motion.div>

      <AnimatePresence initial={false}>
        {snapshot && selectedRow && sidebarOpen ? (
          <BrowserTabDetailSidebar
            snapshot={snapshot}
            tab={selectedRow}
            onClose={() => setSelectedKey(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
