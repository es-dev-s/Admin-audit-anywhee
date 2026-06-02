"use client";

/**
 * LiveFeedWall – Audit-dashboard surveillance wall.
 *
 * Architecture matches admin-dashboard/LiveFeedWallView:
 *   wallRef.current.requestFullscreen()  ← called DIRECTLY from the button's
 *   onClick so the browser user-gesture check always passes.
 *
 * When the wall div is the fullscreen element the entire screen is the wall.
 * Sidebar, topbar, and every other UI element are naturally hidden behind it —
 * no portals, no AppShell store flags, no document-level fullscreen needed.
 */

import { useAuditSignaling } from "@/context/audit-signaling-context";
import { useSignalingStreamAuth } from "@/hooks/useSignalingStreamAuth";
import { LiveScreenPanel } from "@/components/members/LiveScreenPanel";
import { MultiDisplaySelector } from "@/components/audit/MultiDisplaySelector";
import { memberOrgPlainTextFromClient } from "@/lib/memberOrgDisplay";
import { MAX_CONCURRENT_ACTIVE_STREAMS } from "@/lib/auditStreamLimits";
import {
  getLiveFeedLayout,
  isSideBySideLiveFeedLayout,
  LIVE_FEED_LAYOUTS,
  resizeSlotAssignments,
} from "@/lib/liveFeedWallLayouts";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutGrid,
  Maximize2,
  Minimize2,
  Radio,
  X,
} from "lucide-react";
import type { AuditLiveClient } from "@/lib/auditTypes";
import "./live-feed-wall.css";

// ─── Persistence ─────────────────────────────────────────────────────────────
const STORAGE_KEY = "audit-live-feed-wall-v2";

function readPersisted(): { layoutId: string; assignments: (number | null)[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { layoutId?: string; assignments?: (number | null)[] };
    if (!p?.layoutId || !Array.isArray(p.assignments)) return null;
    return { layoutId: p.layoutId, assignments: p.assignments };
  } catch {
    return null;
  }
}

// ─── Empty slot ───────────────────────────────────────────────────────────────
function WallEmptySlot({
  slotIndex,
  streamableClients,
  usedClientIds,
  activeStreamCount,
  onAssign,
  sideBySide,
}: {
  slotIndex: number;
  streamableClients: AuditLiveClient[];
  usedClientIds: Set<number>;
  activeStreamCount: number;
  onAssign: (id: number) => void;
  sideBySide: boolean;
}) {
  const slotLabel = sideBySide ? (slotIndex === 0 ? "L" : "R") : String(slotIndex + 1).padStart(2, "0");
  const atLimit = activeStreamCount >= MAX_CONCURRENT_ACTIVE_STREAMS;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#080808] p-3">
      <span className="live-feed-cam-badge">{slotLabel}</span>
      <LayoutGrid size={18} className="text-white/12" aria-hidden />
      {sideBySide ? (
        <span className="text-[10px] font-medium uppercase tracking-widest text-white/35">
          {slotIndex === 0 ? "Left screen" : "Right screen"}
        </span>
      ) : null}
      <select
        className="w-full max-w-[220px] appearance-none rounded border border-white/10 bg-[#111] px-2.5 py-2 text-[11px] font-medium text-white/60 outline-none hover:border-white/20 focus-visible:border-[var(--color-accent)] focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]"
        value=""
        onChange={(e) => { if (e.target.value) onAssign(Number(e.target.value)); }}
        aria-label={`Camera ${slotIndex + 1} — assign a member`}
      >
        <option value="">— assign member —</option>
        {streamableClients.map((c) => {
          const taken = !sideBySide && usedClientIds.has(c.id);
          const blocked = !taken && c.status === "sharing" && atLimit;
          return (
            <option key={c.id} value={String(c.id)} disabled={taken || blocked}>
              {memberOrgPlainTextFromClient(c)}
              {c.status === "sharing" ? " · LIVE" : ` · ${c.status}`}
              {taken ? " (assigned)" : blocked ? " (limit)" : ""}
            </option>
          );
        })}
      </select>
    </div>
  );
}

// ─── Filled slot — owns stream lifecycle ──────────────────────────────────────
function WallFilledSlot({
  client,
  slotIndex,
  streamableClients,
  usedClientIds,
  onAssign,
  onClear,
  sideBySide,
}: {
  client: AuditLiveClient;
  slotIndex: number;
  streamableClients: AuditLiveClient[];
  usedClientIds: Set<number>;
  onAssign: (id: number | null) => void;
  onClear: () => void;
  sideBySide: boolean;
}) {
  const { getStream, acquireStream, releaseStream } = useAuditSignaling();
  const auth = useSignalingStreamAuth(client.orgId, client.id);
  const sources = client.screenSources ?? [];
  const pinnedDisplayIdx =
    sideBySide && sources.length > 0
      ? Math.min(slotIndex, sources.length - 1)
      : 0;
  const [displayIdx, setDisplayIdx] = useState(pinnedDisplayIdx);
  const activeDisplayIdx = sideBySide ? pinnedDisplayIdx : displayIdx;
  const activeSource = sources[activeDisplayIdx] ?? sources[0];
  const streamOpts = useMemo(
    () => ({
      preferredSourceId: activeSource?.id ?? null,
      preferredSourceIndex: activeDisplayIdx,
    }),
    [activeSource?.id, activeDisplayIdx],
  );
  const stream = getStream(client.id, streamOpts);
  const sharing = client.status === "sharing";

  useEffect(() => {
    if (sideBySide) setDisplayIdx(pinnedDisplayIdx);
  }, [sideBySide, pinnedDisplayIdx]);

  useEffect(() => {
    if (!sharing || auth.status !== "authorized") return;
    acquireStream(client.id, streamOpts);
    return () => releaseStream(client.id, streamOpts);
  }, [
    client.id,
    sharing,
    auth.status,
    activeSource?.id,
    activeDisplayIdx,
    acquireStream,
    releaseStream,
    streamOpts,
  ]);

  const onDisplayChange = useCallback(
    (sourceId: string, idx: number) => {
      if (sideBySide) return;
      const prevOpts = {
        preferredSourceId: sources[displayIdx]?.id ?? null,
        preferredSourceIndex: displayIdx,
      };
      setDisplayIdx(idx);
      releaseStream(client.id, prevOpts);
      queueMicrotask(() =>
        acquireStream(client.id, {
          preferredSourceId: sourceId,
          preferredSourceIndex: idx,
        }),
      );
    },
    [client.id, displayIdx, sources, sideBySide, acquireStream, releaseStream],
  );

  const orgLabel   = (client.claimedOrgName || client.orgName || "").trim();
  const deviceName = client.fullName.trim();
  const isLive     = sharing && auth.status === "authorized" && !!stream;

  // The outer motion.div grid cell already has position:relative (from .live-feed-slot-cell).
  // We use absolute inset-0 here so we fill it without collapsing to zero height.
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {/* Camera number */}
      <span className="live-feed-cam-badge">
        {sideBySide ? (slotIndex === 0 ? "L" : "R") : String(slotIndex + 1).padStart(2, "0")}
      </span>

      {/* Live indicator */}
      {isLive && (
        <span className="absolute right-2 top-2 z-30 flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 backdrop-blur-sm">
          <span className="live-dot" />
          <span className="text-[8px] font-bold uppercase tracking-widest text-green-400/80">live</span>
        </span>
      )}

      {/* Stream / state — fills full cell */}
      {auth.status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#080808]">
          <span className="text-[11px] text-white/40">Authorizing…</span>
        </div>
      )}
      {auth.status === "denied" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#080808] p-3 text-center">
          <span className="text-[12px] font-medium text-red-400">Access denied</span>
          <button type="button" className="text-[10px] text-white/40 underline hover:text-white/70" onClick={onClear}>
            Clear slot
          </button>
        </div>
      )}
      {auth.status === "authorized" && !sharing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[#080808] p-3 text-center">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400/60" />
          <span className="text-[11px] text-white/50">Awaiting broadcast</span>
          <span className="text-[9px] text-white/30">Online but not sharing</span>
        </div>
      )}
      {auth.status === "authorized" && sharing && (
        <LiveScreenPanel
          title={client.fullName}
          memberName={client.fullName}
          teamId={client.orgId}
          memberId={client.id}
          orgLabel={client.orgName}
          claimedOrgName={client.claimedOrgName}
          isStreaming
          mediaStream={stream ?? null}
          compact
          fillContainer
          surveillanceTile
          screenSources={sources}
          displayIndex={activeDisplayIdx}
          onDisplayChange={onDisplayChange}
        />
      )}

      {/* Always-visible identity strip (org name + device name) */}
      {(orgLabel || deviceName) && (
        <div className="live-feed-identity">
          {orgLabel && <div className="live-feed-identity__org">{orgLabel}</div>}
          {deviceName && <div className="live-feed-identity__device">{deviceName}</div>}
        </div>
      )}

      {/* Hover HUD */}
      <div className="live-feed-slot-hud">
        <select
          className="min-w-0 flex-1 rounded border border-white/10 bg-black/75 px-2 py-1 text-[10px] text-white outline-none"
          value={String(client.id)}
          onChange={(e) => {
            const v = e.target.value;
            if (v && Number(v) !== client.id) onAssign(Number(v));
          }}
        >
          {streamableClients.map((c) => {
            const taken =
              !sideBySide && usedClientIds.has(c.id) && c.id !== client.id;
            return (
              <option key={c.id} value={String(c.id)} disabled={taken}>
                {memberOrgPlainTextFromClient(c)}
              </option>
            );
          })}
        </select>
        {!sideBySide && sources.length > 1 && auth.status === "authorized" && sharing && (
          <MultiDisplaySelector sources={sources} valueIndex={displayIdx} onChange={onDisplayChange} />
        )}
        <Link
          href={`/audit/${client.orgId}/${client.id}`}
          className="shrink-0 rounded border border-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white/70 hover:bg-white/10"
        >
          Focus
        </Link>
        <button
          type="button"
          onClick={onClear}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Main wall component ───────────────────────────────────────────────────────
export function LiveFeedWall({ clients }: { clients: AuditLiveClient[] }) {
  const wallRef = useRef<HTMLDivElement | null>(null);
  const [isFs, setIsFs] = useState(false);

  // Restore persisted layout + assignments on first mount.
  const persisted = useMemo(() => readPersisted(), []);
  const [layoutId, setLayoutId] = useState(persisted?.layoutId ?? "2");
  const [assignments, setAssignments] = useState<(number | null)[]>(() => {
    const layout = getLiveFeedLayout(persisted?.layoutId ?? "2");
    return resizeSlotAssignments(persisted?.assignments ?? [], layout.slots);
  });

  // Track whether our specific wall element is the current fullscreen element.
  useEffect(() => {
    const onFsChange = () => {
      setIsFs(document.fullscreenElement === wallRef.current);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Escape key — exit fullscreen (browser also handles this natively).
  useEffect(() => {
    if (!isFs) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void document.exitFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFs]);

  // Persist layout + assignments.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ layoutId, assignments }));
    } catch { /* ignore */ }
  }, [layoutId, assignments]);

  const layout = useMemo(() => getLiveFeedLayout(layoutId), [layoutId]);
  const sideBySide = isSideBySideLiveFeedLayout(layout);

  const clientById = useMemo(() => {
    const m = new Map<number, AuditLiveClient>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const streamableClients = useMemo(
    () =>
      [...clients]
        .filter((c) => c.status !== "offline")
        .sort((a, b) => {
          if (a.status === "sharing" && b.status !== "sharing") return -1;
          if (a.status !== "sharing" && b.status === "sharing") return 1;
          return a.fullName.localeCompare(b.fullName);
        }),
    [clients],
  );

  const usedClientIds = useMemo(() => {
    const s = new Set<number>();
    for (const id of assignments) if (id != null) s.add(id);
    return s;
  }, [assignments]);

  const activeStreamCount = useMemo(() => {
    let n = 0;
    for (const id of assignments) {
      if (id != null && clientById.get(id)?.status === "sharing") n++;
    }
    return n;
  }, [assignments, clientById]);

  const sharingCount = useMemo(
    () => clients.filter((c) => c.status === "sharing").length,
    [clients],
  );

  const handleLayoutPick = (id: string) => {
    setLayoutId(id);
    setAssignments((prev) => resizeSlotAssignments(prev, getLiveFeedLayout(id).slots));
  };

  const setSlot = useCallback(
    (slotIndex: number, clientId: number | null) => {
      setAssignments((prev) => {
        const next = resizeSlotAssignments(prev, layout.slots);
        if (clientId != null && !sideBySide) {
          const dup = next.findIndex((id, i) => i !== slotIndex && id === clientId);
          if (dup !== -1) next[dup] = null;
        }
        next[slotIndex] = clientId;
        return next;
      });
    },
    [layout.slots, sideBySide],
  );

  const assignDualMonitors = useCallback(
    (clientId: number) => {
      if (!sideBySide) return;
      setAssignments([clientId, clientId]);
    },
    [sideBySide],
  );

  const clearAll = () => setAssignments(resizeSlotAssignments([], layout.slots));

  /*
    ── goFullscreen: MUST be called directly from an onClick handler ──
    The browser requires requestFullscreen to originate from a synchronous
    user-gesture event (click, keypress). Moving this call into a useEffect,
    setTimeout, or any async wrapper will silently fail.
  */
  const goFullscreen = () => {
    void wallRef.current?.requestFullscreen().catch(() => {});
  };

  const exitFs = () => {
    void document.exitFullscreen().catch(() => {});
  };

  const activeCount = assignments.filter((id) => id != null).length;

  // ─── Toolbar content (same for both modes, styled differently via CSS) ───
  const toolbar = (
    <div className="live-feed-toolbar">
      {/* Status */}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className={cn("text-[9px] font-bold uppercase tracking-[0.12em]", isFs ? "text-white/35" : "text-[var(--color-text-tertiary)]")}>
          Surveillance wall
        </span>
        <span className={cn("text-[11px]", isFs ? "text-white/50" : "text-[var(--color-text-secondary)]")}>
          {activeCount} / {layout.slots} assigned · {activeStreamCount} live
          {sharingCount > activeStreamCount && !isFs && (
            <span className="ml-2 text-green-500">· {sharingCount} broadcasting</span>
          )}
        </span>
      </div>

      {sideBySide ? (
        <select
          className={cn(
            "max-w-[240px] rounded border px-2 py-1.5 text-[11px] font-medium outline-none",
            isFs
              ? "border-white/12 bg-black/60 text-white/80"
              : "border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]",
          )}
          value=""
          onChange={(e) => {
            const id = Number(e.target.value);
            if (Number.isFinite(id) && id > 0) assignDualMonitors(id);
          }}
          aria-label="Assign one member to left and right screens"
        >
          <option value="">Both monitors — pick member</option>
          {streamableClients
            .filter((c) => (c.screenSources?.length ?? 0) >= 2 && c.status === "sharing")
            .map((c) => (
              <option key={c.id} value={String(c.id)}>
                {memberOrgPlainTextFromClient(c)} · {c.screenSources.length} displays
              </option>
            ))}
        </select>
      ) : null}

      {/* Layout pills */}
      <div className="flex flex-1 flex-wrap justify-center gap-1.5" role="group" aria-label="Number of cameras">
        {LIVE_FEED_LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => handleLayoutPick(l.id)}
            className={cn(
              "live-feed-layout-pill",
              l.id === layoutId
                ? isFs
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                  : "border-[var(--color-accent)] bg-[var(--color-accent-muted,#312e81/20)] text-[var(--color-accent)]"
                : isFs
                  ? "border-white/12 bg-white/5 text-white/55 hover:border-white/25"
                  : "border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]",
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={clearAll}
          className={cn(
            "rounded border px-2.5 py-1.5 text-[11px] font-medium",
            isFs
              ? "border-white/12 text-white/55 hover:bg-white/8"
              : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]",
          )}
        >
          Clear all
        </button>

        {/* Full screen / exit — MUST call goFullscreen directly from onClick */}
        {!isFs ? (
          <button
            type="button"
            onClick={goFullscreen}
            className="inline-flex items-center gap-1.5 rounded bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.97]"
          >
            <Maximize2 size={14} />
            Full screen
          </button>
        ) : (
          <button
            type="button"
            onClick={exitFs}
            className="inline-flex items-center gap-1.5 rounded border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/15"
          >
            <Minimize2 size={12} />
            Exit
          </button>
        )}
      </div>
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      ref={wallRef}
      className={cn(
        // In normal mode: allow vertical scroll if min-height exceeds viewport.
        // In fullscreen: overflow is hidden by the fullscreen element itself.
        "live-feed-wall-root flex w-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)]",
        isFs ? "is-fullscreen min-h-0 overflow-hidden" : "min-h-0 flex-1 overflow-auto",
      )}
    >
      {/* ── Normal mode: toolbar in normal document flow, grid below ── */}
      {!isFs && toolbar}

      {/* ── Fullscreen mode: toolbar floats over grid (auto-hides) ── */}
      {isFs && (
        <div className="live-feed-top-trigger">
          {toolbar}
        </div>
      )}

      {/* ── Grid ── */}
      {/*
        In normal mode the grid must have an explicit height so
        gridTemplateRows 1fr resolves correctly. We use a calc()
        min-height that guarantees useful row height even when the
        flex chain above doesn't provide a definite pixel size.
        In fullscreen the CSS rule `position:absolute;inset:0` takes over.
      */}
      <motion.div
        layout
        className={cn(
          "live-feed-grid min-h-0",
          sideBySide && "live-feed-grid--lr",
          !isFs && "flex-1",
        )}
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
          // Guarantee each row has at least 180px of height in normal mode.
          // This ensures the flex chain produces a visible grid even when
          // an ancestor has no explicit height.
          minHeight: isFs ? undefined : `${layout.rows * (sideBySide ? 280 : 180)}px`,
        }}
        transition={{ layout: { duration: 0.4, ease: [0.32, 0.72, 0, 1] } }}
      >
        {Array.from({ length: layout.slots }, (_, i) => {
          const clientId = assignments[i] ?? null;
          const client   = clientId != null ? clientById.get(clientId) ?? null : null;

          return (
            <motion.div
              key={`slot-${i}`}
              layout
              className="live-feed-slot-cell min-h-0 min-w-0"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.26, delay: Math.min(i * 0.016, 0.24), ease: [0.32, 0.72, 0, 1] }}
            >
              {clientId != null && !client ? (
                /* Assigned ID but member not in list (went offline) */
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#080808] p-3 text-center">
                  <span className="text-[11px] text-white/40">Member offline</span>
                  <button
                    type="button"
                    className="text-[10px] text-white/30 underline hover:text-white/65"
                    onClick={() => setSlot(i, null)}
                  >
                    Clear slot
                  </button>
                </div>
              ) : !client ? (
                <WallEmptySlot
                  slotIndex={i}
                  streamableClients={streamableClients}
                  usedClientIds={usedClientIds}
                  activeStreamCount={activeStreamCount}
                  onAssign={(id) => setSlot(i, id)}
                  sideBySide={sideBySide}
                />
              ) : (
                <WallFilledSlot
                  client={client}
                  sideBySide={sideBySide}
                  slotIndex={i}
                  streamableClients={streamableClients}
                  usedClientIds={usedClientIds}
                  onAssign={(id) => setSlot(i, id)}
                  onClear={() => setSlot(i, null)}
                />
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Fullscreen hint bar at bottom */}
      {isFs && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-40 flex justify-center opacity-0 transition-opacity [.live-feed-wall-root.is-fullscreen:hover_&]:opacity-100">
          <p className="rounded-full border border-white/8 bg-black/50 px-3 py-1 text-[9px] text-white/25 backdrop-blur-sm">
            Hover top edge for controls · <kbd className="rounded border border-white/15 px-1 font-mono">Esc</kbd> to exit
          </p>
        </div>
      )}
    </div>
  );
}
