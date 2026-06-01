"use client";

import {
  BadgeCheck,
  Camera,
  Flag,
  Maximize2,
  Minimize2,
  Pause,
  Play,
} from "lucide-react";
import { useCallback, useEffect, useState, type RefObject } from "react";
import { FocusClientAppButton } from "@/components/audit/FocusClientAppButton";
import { MultiDisplaySelector } from "@/components/audit/MultiDisplaySelector";
import { useToast } from "@/components/ui/toast-context";
import type { AuditLiveClient } from "@/lib/auditTypes";

const btn =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition-all duration-150 hover:bg-white/[0.12] hover:text-white active:scale-[0.9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]";

export type StreamToolbarContext = {
  teamId: number;
  memberId: number;
  memberName: string;
};

export function StreamToolbar({
  videoRef,
  panelRef,
  mediaStream,
  userPaused,
  onTogglePause,
  onOpenFlag,
  sessionFlagged,
  screenSources,
  displayIndex,
  onDisplayChange,
  streamContext,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  mediaStream: MediaStream | null | undefined;
  userPaused: boolean;
  onTogglePause: () => void;
  onOpenFlag: () => void;
  sessionFlagged: boolean;
  screenSources: AuditLiveClient["screenSources"];
  displayIndex: number;
  onDisplayChange: (sourceId: string, index: number) => void;
  /** When set, screenshots are stored in R2 and listed under Captures. */
  streamContext?: StreamToolbarContext | null;
}) {
  const [fs, setFs] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const onScreenshot = useCallback(async () => {
    const v = videoRef.current;
    if (!v || v.videoWidth <= 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        ctx.drawImage(v, 0, 0);
      } catch {
        resolve(null);
        return;
      }
      canvas.toBlob((b) => resolve(b), "image/png");
    });

    if (!blob) {
      showToast("Could not capture frame", "error");
      return;
    }

    setCaptureBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, "screenshot.png");
      fd.append("captureType", "screenshot");
      if (streamContext) {
        fd.append("teamId", String(streamContext.teamId));
        fd.append("memberId", String(streamContext.memberId));
        fd.append("memberName", streamContext.memberName);
      }

      const res = await fetch("/api/audit-captures", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        showToast(j.error ?? "Upload failed", "error");
        return;
      }
      showToast("Screenshot saved to Captures", "success");
    } catch {
      showToast("Upload failed", "error");
    } finally {
      setCaptureBusy(false);
    }
  }, [videoRef, streamContext, showToast]);

  const onFullscreen = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  }, [panelRef]);

  return (
    <div className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-black/60 px-2 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success)]/15 text-[var(--color-success)]"
        title="Verified audit channel"
        aria-label="Verified audit channel"
        role="img"
      >
        <BadgeCheck size={16} strokeWidth={2.25} aria-hidden />
      </span>
      {streamContext ? (
        <FocusClientAppButton
          clientId={streamContext.memberId}
          disabled={!mediaStream}
        />
      ) : null}
      <MultiDisplaySelector
        sources={screenSources}
        valueIndex={displayIndex}
        onChange={onDisplayChange}
      />
      <button
        type="button"
        className={`${btn} ${userPaused ? "bg-[var(--color-warning-muted)] text-[var(--color-warning)]" : ""}`}
        aria-label={userPaused ? "Resume stream" : "Pause stream"}
        onClick={onTogglePause}
        disabled={!mediaStream}
      >
        {userPaused ? <Play size={15} /> : <Pause size={15} />}
      </button>
      <button
        type="button"
        className={btn}
        aria-label={captureBusy ? "Saving screenshot…" : "Save screenshot to Captures"}
        onClick={() => void onScreenshot()}
        disabled={!mediaStream || captureBusy}
      >
        <Camera size={15} />
      </button>

      <span className="mx-0.5 h-4 w-px bg-white/[0.08]" aria-hidden />

      <button
        type="button"
        className={btn}
        aria-label={fs ? "Exit fullscreen" : "Enter fullscreen"}
        onClick={onFullscreen}
      >
        {fs ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
      <button
        type="button"
        className={`${btn} ${sessionFlagged ? "bg-[var(--color-danger-muted)] text-[var(--color-danger)]" : ""}`}
        aria-label="Flag activity"
        onClick={onOpenFlag}
      >
        <Flag size={15} />
      </button>
    </div>
  );
}
