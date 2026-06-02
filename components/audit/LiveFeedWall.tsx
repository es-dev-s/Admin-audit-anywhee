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
import { LiveFeedDisplaySelect } from "@/components/audit/LiveFeedDisplaySelect";
import { memberOrgPlainTextFromClient } from "@/lib/memberOrgDisplay";
import { isClientStreamable } from "@/lib/auditClientStatus";
import { auditStreamViewOpts } from "@/lib/auditStreamViewKey";
import { auditMemberScreenPath } from "@/lib/auditNav";
import {
  getLiveFeedLayout,
  isSideBySideLiveFeedLayout,
  LIVE_FEED_LAYOUTS,
  resizeSlotAssignments,
} from "@/lib/liveFeedWallLayouts";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutGrid,
  Maximize2,
  Minimize2,
  Radio,
  X,
} from "lucide-react";
import type { AuditLiveClient } from "@/lib/auditTypes";
import { LiveFeedMemberPicker } from "@/components/audit/LiveFeedMemberPicker";
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

  return (
    <>
      <div className="live-feed-slot-stage">
        <span className="live-feed-cam-badge">{slotLabel}</span>
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#080808] p-3">
          <LayoutGrid size={18} className="text-white/12" aria-hidden />
          {sideBySide ? (
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/35">
              {slotIndex === 0 ? "Left screen" : "Right screen"}
            </span>
          ) : null}
          <LiveFeedMemberPicker
            className="w-full max-w-[240px]"
            clients={streamableClients}
            usedClientIds={usedClientIds}
            activeStreamCount={activeStreamCount}
            sideBySide={sideBySide}
            placeholder="Assign member"
            onSelect={onAssign}
            variant="slot"
          />
        </div>
      </div>
      <div className="live-feed-slot-hud live-feed-slot-hud--empty" aria-hidden />
    </>
  );
}

// ─── Filled slot — owns stream lifecycle ──────────────────────────────────────
function sourcesKey(sources: AuditLiveClient["screenSources"]): string {
  return (sources ?? []).map((s) => s.id).join(",");
}

const WallFilledSlot = function WallFilledSlot({
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
    () =>
      auditStreamViewOpts(
        activeDisplayIdx,
        activeSource?.id ?? null,
        sideBySide,
      ),
    [activeSource?.id, activeDisplayIdx, sideBySide],
  );
  const stream = getStream(client.id, streamOpts);
  const streamable = isClientStreamable(client.status);
  const isLive = streamable && auth.status === "authorized" && !!stream;

  useEffect(() => {
    if (sideBySide) setDisplayIdx(pinnedDisplayIdx);
  }, [sideBySide, pinnedDisplayIdx]);

  useEffect(() => {
    if (!streamable || auth.status !== "authorized") return;
    acquireStream(client.id, streamOpts);
    return () => releaseStream(client.id, streamOpts);
  }, [
    client.id,
    streamable,
    auth.status,
    activeSource?.id,
    activeDisplayIdx,
    acquireStream,
    releaseStream,
    streamOpts,
  ]);

  const onDisplayChange = useCallback(
    (_sourceId: string, idx: number) => {
      if (sideBySide) return;
      setDisplayIdx(idx);
    },
    [sideBySide],
  );

  const camLabel = sideBySide ? (slotIndex === 0 ? "L" : "R") : String(slotIndex + 1).padStart(2, "0");
  return (
    <>
      <div className="live-feed-slot-stage">
        <span className="live-feed-cam-badge">{camLabel}</span>

        <span
          className={cn(
            "live-feed-live-pill",
            isLive && "live-feed-live-pill--on",
          )}
        >
          <span className="live-dot" />
          <span className="text-[8px] font-bold uppercase tracking-widest text-green-400/80">
            live
          </span>
        </span>

        <div className="live-feed-slot-layer">
          {auth.status === "loading" && (
            <div className="live-feed-slot-overlay">
              <span className="text-[11px] text-white/40">Authorizing…</span>
            </div>
          )}
          {auth.status === "denied" && (
            <div className="live-feed-slot-overlay">
              <span className="text-[12px] font-medium text-red-400">Access denied</span>
              <button
                type="button"
                className="text-[10px] text-white/40 underline hover:text-white/70"
                onClick={onClear}
              >
                Clear slot
              </button>
            </div>
          )}
          {auth.status === "authorized" && !streamable && (
            <div className="live-feed-slot-overlay">
              <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
              <span className="text-[11px] font-medium text-white/50">Member offline</span>
            </div>
          )}
          {auth.status === "authorized" && streamable && (
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
              surveillanceConnectingStatic
              screenSources={sources}
              displayIndex={activeDisplayIdx}
              onDisplayChange={onDisplayChange}
            />
          )}
        </div>
      </div>

      <div className="live-feed-slot-hud">
        <LiveFeedMemberPicker
          className="min-w-0 flex-1"
          clients={streamableClients}
          usedClientIds={usedClientIds}
          activeStreamCount={0}
          sideBySide={sideBySide}
          currentClientId={client.id}
          placeholder="Switch member"
          onSelect={(id) => {
            if (id !== client.id) onAssign(id);
          }}
          variant="slot"
        />
        <LiveFeedDisplaySelect
          sources={sources}
          valueIndex={displayIdx}
          onChange={onDisplayChange}
        />
        <Link
          href={auditMemberScreenPath(client.orgId, client.id, "live")}
          className="live-feed-slot-hud-btn"
        >
          Focus
        </Link>
        <button type="button" onClick={onClear} className="live-feed-slot-hud-icon" aria-label="Clear slot">
          <X size={12} />
        </button>
      </div>
    </>
  );
};

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
        .filter((c) => isClientStreamable(c.status))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
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
      if (id != null && isClientStreamable(clientById.get(id)?.status)) n++;
    }
    return n;
  }, [assignments, clientById]);

  const onlineCount = useMemo(
    () => clients.filter((c) => isClientStreamable(c.status)).length,
    [clients],
  );

  const handleLayoutPick = (id: string) => {
    if (id === layoutId) return;
    startTransition(() => {
      setLayoutId(id);
      setAssignments((prev) => resizeSlotAssignments(prev, getLiveFeedLayout(id).slots));
    });
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
  const dualMonitorClients = useMemo(
    () =>
      streamableClients.filter(
        (c) => (c.screenSources?.length ?? 0) >= 2 && isClientStreamable(c.status),
      ),
    [streamableClients],
  );

  const toolbar = (
    <div className="live-feed-toolbar-wrap">
      <div className="live-feed-toolbar">
        <div className="lf-toolbar__block lf-toolbar__block--status">
          <span className={cn("lf-toolbar__title", isFs && "lf-toolbar__title--fs")}>
            Live wall
          </span>
          <span className={cn("lf-toolbar__meta", isFs && "lf-toolbar__meta--fs")}>
            {activeCount}/{layout.slots} slots · {activeStreamCount} live
          </span>
        </div>

        <div className="live-feed-layout-pills" role="group" aria-label="Layout">
          {LIVE_FEED_LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => handleLayoutPick(l.id)}
              className={cn(
                "live-feed-layout-pill",
                l.id === layoutId && "live-feed-layout-pill--active",
                isFs && "live-feed-layout-pill--fs",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="lf-toolbar__block lf-toolbar__block--actions">
          <button
            type="button"
            onClick={clearAll}
            className={cn("lf-toolbar__btn", isFs && "lf-toolbar__btn--fs")}
          >
            Clear
          </button>
          {!isFs ? (
            <button type="button" onClick={goFullscreen} className="lf-toolbar__btn lf-toolbar__btn--primary">
              <Maximize2 size={14} />
              Full screen
            </button>
          ) : (
            <button type="button" onClick={exitFs} className={cn("lf-toolbar__btn", isFs && "lf-toolbar__btn--fs")}>
              <Minimize2 size={12} />
              Exit
            </button>
          )}
        </div>
      </div>

      <div className="live-feed-toolbar-sub">
        <span className="live-feed-toolbar-sub__label">Dual display</span>
        {sideBySide ? (
          <LiveFeedMemberPicker
            className="live-feed-toolbar-sub__picker"
            clients={dualMonitorClients}
            usedClientIds={usedClientIds}
            activeStreamCount={activeStreamCount}
            sideBySide
            placeholder="Select member for left & right"
            onSelect={assignDualMonitors}
            variant="toolbar"
          />
        ) : (
          <span className="live-feed-toolbar-sub__hint">Select the 1×2 layout above</span>
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
        "live-feed-wall-root flex w-full flex-col",
        isFs ? "is-fullscreen min-h-0 overflow-hidden" : "min-h-0 flex-1 overflow-hidden lf-wall--embedded",
      )}
    >
      {/* ── Normal mode: toolbar in normal document flow, grid below ── */}
      {!isFs ? toolbar : null}

      {isFs ? (
        <div className="live-feed-top-trigger">
          {toolbar}
        </div>
      ) : null}

      {/* ── Grid ── */}
      {/*
        In normal mode the grid must have an explicit height so
        gridTemplateRows 1fr resolves correctly. We use a calc()
        min-height that guarantees useful row height even when the
        flex chain above doesn't provide a definite pixel size.
        In fullscreen the CSS rule `position:absolute;inset:0` takes over.
      */}
      <div
        className={cn(
          "live-feed-grid min-h-0",
          sideBySide && "live-feed-grid--lr",
          !isFs && "flex-1",
        )}
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: layout.slots }, (_, i) => {
          const clientId = assignments[i] ?? null;
          const client   = clientId != null ? clientById.get(clientId) ?? null : null;

          return (
            <div
              key={`slot-${i}`}
              className="live-feed-slot-cell min-h-0 min-w-0"
            >
              {clientId != null && !client ? (
                <>
                  <div className="live-feed-slot-stage">
                    <span className="live-feed-cam-badge">
                      {sideBySide ? (i === 0 ? "L" : "R") : String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="live-feed-slot-overlay">
                      <span className="text-[11px] text-white/40">Member offline</span>
                      <button
                        type="button"
                        className="text-[10px] text-white/30 underline hover:text-white/65"
                        onClick={() => setSlot(i, null)}
                      >
                        Clear slot
                      </button>
                    </div>
                  </div>
                  <div className="live-feed-slot-hud live-feed-slot-hud--empty" aria-hidden />
                </>
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
            </div>
          );
        })}
      </div>

      {/* Fullscreen hint bar at bottom */}
      {isFs && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-40 flex justify-center opacity-0 [.live-feed-wall-root.is-fullscreen:hover_&]:opacity-100">
          <p className="rounded-full border border-white/8 bg-black/50 px-3 py-1 text-[9px] text-white/25 backdrop-blur-sm">
            Hover top edge for controls · <kbd className="rounded border border-white/15 px-1 font-mono">Esc</kbd> to exit
          </p>
        </div>
      )}
    </div>
  );
}
