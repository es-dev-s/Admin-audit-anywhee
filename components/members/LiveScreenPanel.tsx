"use client";

import { BadgeCheck, PauseCircle, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlagModal } from "@/components/audit/FlagModal";
import { MemberOrgLabel } from "@/components/audit/MemberOrgLabel";
import { FocusClientAppButton } from "@/components/audit/FocusClientAppButton";
import { StreamToolbar } from "@/components/audit/StreamToolbar";
import { useRecentStore } from "@/store/recentStore";
import type { AuditLiveClient } from "@/lib/auditTypes";
import { cn } from "@/lib/utils";

type LiveScreenPanelProps = {
  title: string;
  memberName: string;
  teamId: number;
  memberId: number;
  /** Signaling org row name (fallback). */
  orgLabel?: string | null;
  /** Org string from client-dashboard enrollment. */
  claimedOrgName?: string | null;
  compact?: boolean;
  isStreaming?: boolean;
  mediaStream?: MediaStream | null;
  fillContainer?: boolean;
  className?: string;
  screenSources?: AuditLiveClient["screenSources"];
  displayIndex?: number;
  onDisplayChange?: (sourceId: string, index: number) => void;
  /** Tight surveillance tile: edge-to-edge video, minimal chrome */
  surveillanceTile?: boolean;
  /** Live feed tiles: static connecting state (no spinner animation). */
  surveillanceConnectingStatic?: boolean;
};

export function LiveScreenPanel({
  title,
  memberName,
  teamId,
  memberId,
  orgLabel,
  claimedOrgName,
  compact = false,
  isStreaming = true,
  mediaStream,
  fillContainer = false,
  className = "",
  screenSources = [],
  displayIndex = 0,
  onDisplayChange,
  surveillanceTile = false,
  surveillanceConnectingStatic = false,
}: LiveScreenPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [sessionFlagged, setSessionFlagged] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagSnapshot, setFlagSnapshot] = useState<string | null>(null);
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [fps, setFps] = useState(0);
  const vfcRef = useRef<number>(0);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (mediaStream) {
      el.srcObject = mediaStream;
      void el.play().catch(() => {});
    } else {
      el.srcObject = null;
      try { el.load(); } catch { /* ignore */ }
    }
    return () => { el.srcObject = null; };
  }, [mediaStream]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !mediaStream) {
      setLastFrameAt(null);
      setFrozen(false);
      return;
    }

    const onMeta = () => {
      if (v.videoWidth && v.videoHeight) setDims({ w: v.videoWidth, h: v.videoHeight });
    };
    const onWaiting = () => setReconnecting(true);
    const onPlaying = () => setReconnecting(false);
    const onStalled = () => setReconnecting(true);

    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("stalled", onStalled);

    let frames = 0;
    let lastTick = performance.now();
    const tick: VideoFrameRequestCallback = () => {
      setLastFrameAt(Date.now());
      frames++;
      const now = performance.now();
      if (now - lastTick >= 1000) {
        setFps(frames);
        frames = 0;
        lastTick = now;
      }
      vfcRef.current = v.requestVideoFrameCallback(tick);
    };
    vfcRef.current = v.requestVideoFrameCallback(tick);

    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("stalled", onStalled);
      v.cancelVideoFrameCallback(vfcRef.current);
    };
  }, [mediaStream]);

  useEffect(() => {
    if (!mediaStream || userPaused) { setFrozen(false); return; }
    const id = window.setInterval(() => {
      if (!lastFrameAt) return;
      setFrozen(Date.now() - lastFrameAt > 5000);
    }, 500);
    return () => clearInterval(id);
  }, [mediaStream, userPaused, lastFrameAt]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (userPaused) void v.pause();
    else void v.play().catch(() => {});
  }, [userPaused]);

  useEffect(() => {
    if (isStreaming && mediaStream && !userPaused) {
      useRecentStore.getState().addRecentStream(memberId, title);
    }
  }, [isStreaming, mediaStream, userPaused, memberId, title]);

  // Auto-hide toolbar
  useEffect(() => {
    if (compact) return;
    const panel = panelRef.current;
    if (!panel) return;
    const show = () => {
      setToolbarVisible(true);
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setToolbarVisible(false), 3000);
    };
    panel.addEventListener("mousemove", show);
    panel.addEventListener("mouseenter", show);
    hideTimerRef.current = setTimeout(() => setToolbarVisible(false), 3000);
    return () => {
      panel.removeEventListener("mousemove", show);
      panel.removeEventListener("mouseenter", show);
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    };
  }, [compact, mediaStream]);

  const togglePause = useCallback(() => { setUserPaused((p) => !p); }, []);

  const captureSnapshotDataUrl = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || v.videoWidth <= 0 || v.videoHeight <= 0) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0);
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }, []);

  const openFlagModal = useCallback(() => {
    setFlagSnapshot(captureSnapshotDataUrl());
    setFlagOpen(true);
  }, [captureSnapshotDataUrl]);

  const closeFlagModal = useCallback(() => {
    setFlagOpen(false);
    setFlagSnapshot(null);
  }, []);

  const showVideo = !!mediaStream && isStreaming && !userPaused;
  const connecting = isStreaming && !mediaStream;
  const offline = !isStreaming;

  // Surveillance tile: the caller's absolute-inset-0 wrapper already provides
  // the positioned context. The panel fills it completely.
  const rootClass = surveillanceTile
    ? ["absolute inset-0 overflow-hidden bg-black", className].filter(Boolean).join(" ")
    : [
        "cinema-container flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-lg)]",
        fillContainer ? "h-full min-h-0" : "min-h-0",
        className,
      ].filter(Boolean).join(" ");

  // Stage class: in surveillance tile mode use absolute inset-0 so the video
  // stage fills the root regardless of flex-chain height issues.
  const stageClass = surveillanceTile
    ? "absolute inset-0"
    : compact
      ? "min-h-[140px] sm:min-h-[160px]"
      : "min-h-[min(52dvh,520px)] sm:min-h-[min(56dvh,580px)] lg:min-h-0 lg:flex-1";

  return (
    <>
      <div ref={panelRef} className={rootClass}>
        {/* ── Minimal header bar ── */}
        {!surveillanceTile ? (
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
          <div className="flex items-center gap-2.5 pointer-events-auto">
            <div className="relative shrink-0">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/10">
                <span className="text-[9px] font-bold text-white/70">
                  {memberName.charAt(0).toUpperCase()}
                </span>
              </div>
              {!offline ? (
                <span
                  className="absolute -bottom-0.5 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-success)] text-white shadow-sm ring-1 ring-black/60"
                  title="Verified audit channel"
                  aria-label="Verified audit channel"
                >
                  <BadgeCheck
                    className="h-2.5 w-2.5"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                </span>
              ) : null}
            </div>
            <MemberOrgLabel
              fullName={memberName}
              claimedOrgName={claimedOrgName}
              orgName={orgLabel}
              orgId={teamId}
              size="sm"
              tone="on-dark"
              className="max-w-[min(100%,18rem)]"
            />
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            {compact && mediaStream && !offline ? (
              <FocusClientAppButton clientId={memberId} variant="header" />
            ) : null}
            {offline ? (
              <div className="flex items-center gap-1.5 rounded-full bg-white/[0.08] border border-white/[0.08] px-2.5 py-1 text-[10px] font-semibold tracking-wider text-white/50">
                <WifiOff size={10} aria-hidden />
                OFFLINE
              </div>
            ) : connecting ? (
              <div className="flex items-center gap-1.5 rounded-full bg-[var(--color-warning-muted)] border border-[var(--color-warning)]/20 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-[var(--color-warning)]">
                <span className="h-2 w-2 shrink-0 animate-spin rounded-full border border-white/20 border-t-[var(--color-warning)]" aria-hidden />
                CONNECTING
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-full bg-[var(--color-success-muted)] border border-[var(--color-success)]/20 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-[var(--color-success)]">
                <span className="live-dot-sm" aria-hidden />
                LIVE
              </div>
            )}
          </div>
        </div>
        ) : null}

        {/* ── Video stage ── */}
        <div className={`overflow-hidden bg-black ${surveillanceTile ? stageClass : `relative flex min-h-0 w-full flex-1 flex-col ${stageClass}`}`}>
          {isStreaming ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label={`${memberName}'s screen share`}
              className={cn(
                "absolute inset-0 h-full w-full bg-black",
                surveillanceTile
                  ? "object-cover object-center"
                  : "object-contain object-center transition-opacity duration-300 ease-out",
              )}
              style={{ opacity: showVideo ? 1 : 0 }}
            />
          ) : null}

          {connecting ? (
            <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3 bg-black/50">
              {surveillanceConnectingStatic ? (
                <span className="h-2 w-2 shrink-0 rounded-full bg-white/35" aria-hidden />
              ) : (
                <span
                  className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-white/70"
                  aria-hidden
                />
              )}
              <p className="text-[12px] font-medium text-white/45">Establishing stream…</p>
            </div>
          ) : null}

          {offline ? (
            <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 px-6 text-center">
              <WifiOff size={40} className="text-white/[0.08]" aria-hidden />
              <p className="text-[15px] font-medium text-white/40">Stream unavailable</p>
              <p className="max-w-xs text-[12px] text-white/20">
                This member is currently offline or not sharing.
              </p>
              <button
                type="button"
                className="mt-3 rounded-[var(--radius-md)] border border-white/15 px-4 py-2 text-[12px] font-medium text-white/50 transition-colors hover:border-white/30 hover:text-white/70"
              >
                Request stream
              </button>
            </div>
          ) : null}

          {userPaused && mediaStream ? (
            <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
              <PauseCircle size={48} className="text-white/60" aria-hidden />
              <p className="text-[13px] font-medium text-white/80">Paused</p>
              <button
                type="button"
                className="text-[12px] font-semibold text-[var(--color-accent)] transition-colors duration-200 hover:text-[var(--color-accent-hover)]"
                onClick={() => setUserPaused(false)}
              >
                Resume
              </button>
            </div>
          ) : null}

          {frozen && !userPaused && mediaStream ? (
            <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black/50">
              <p className="text-[12px] font-medium text-white/60">Stream frozen</p>
            </div>
          ) : null}

          {reconnecting && mediaStream && !userPaused ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-16 z-[4] flex justify-center px-3">
              <div className="rounded-full border border-[var(--color-warning)]/30 bg-black/80 px-3 py-1.5 text-[11px] text-[var(--color-warning)] backdrop-blur-sm">
                Reconnecting…
              </div>
            </div>
          ) : null}

          {/* Resolution + FPS overlay */}
          {mediaStream && dims && !offline ? (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[5] flex items-end justify-between px-4 pb-2 font-mono text-[10px] text-white/25 transition-opacity"
              style={{ opacity: toolbarVisible ? 1 : 0 }}
            >
              <span>{dims.w}×{dims.h}</span>
              <span>~{fps} fps</span>
            </div>
          ) : null}

          {/* ── Floating toolbar (full-width flex strip = true horizontal center) ── */}
          {!compact && !offline && mediaStream ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-5 z-[6] flex justify-center px-3 transition-opacity duration-300"
              style={{ opacity: toolbarVisible ? 1 : 0 }}
            >
              <div
                className="pointer-events-auto transition-transform duration-300"
                style={{
                  transform: toolbarVisible ? "translateY(0)" : "translateY(12px)",
                }}
              >
                <StreamToolbar
                  videoRef={videoRef}
                  panelRef={panelRef}
                  mediaStream={mediaStream ?? null}
                  userPaused={userPaused}
                  onTogglePause={togglePause}
                  onOpenFlag={openFlagModal}
                  sessionFlagged={sessionFlagged}
                  screenSources={screenSources}
                  displayIndex={displayIndex}
                  onDisplayChange={onDisplayChange ?? (() => {})}
                  streamContext={{
                    teamId,
                    memberId,
                    memberName,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <FlagModal
        open={flagOpen}
        onClose={closeFlagModal}
        onSubmitted={() => setSessionFlagged(true)}
        teamId={teamId}
        memberId={memberId}
        memberName={memberName}
        snapshotDataUrl={flagSnapshot}
      />
    </>
  );
}
