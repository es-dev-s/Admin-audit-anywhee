"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "@/store/uiStore";
import {
  getLiveFeedLayout,
  resizeSlotAssignments,
} from "@/lib/liveFeedWallLayouts";

export type LiveFeedWallPhase = "setup" | "wall";

const DEFAULT_LAYOUT_ID = "4";

/**
 * Manages the immersive full-screen surveillance wall lifecycle.
 *
 * KEY RULE: requestFullscreen() must be called synchronously from a user-gesture
 * event handler. We achieve this by calling it directly inside enterImmersive(),
 * which is invoked from an onClick. We fullscreen document.documentElement so we
 * don't need a pre-mounted ref element.
 */
export function useLiveFeedWallSession() {
  const setLiveFeedWallFullscreen = useUIStore(
    (s) => s.setLiveFeedWallFullscreen,
  );
  const [isImmersive, setIsImmersive] = useState(false);
  const [phase, setPhase] = useState<LiveFeedWallPhase>("setup");
  const [layoutId, setLayoutId] = useState(DEFAULT_LAYOUT_ID);
  const [assignments, setAssignments] = useState<(number | null)[]>([]);
  const [portalMounted, setPortalMounted] = useState(false);

  // Track immersive in a ref so the fullscreenchange listener is always fresh
  const immersiveRef = useRef(false);
  immersiveRef.current = isImmersive;

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  /** Exit without touching fullscreen API (used when fullscreen already ended). */
  const resetState = useCallback(() => {
    setIsImmersive(false);
    setLiveFeedWallFullscreen(false);
    setPhase("setup");
    setAssignments([]);
  }, [setLiveFeedWallFullscreen]);

  /**
   * Call this DIRECTLY from a button onClick — synchronously — so the browser
   * accepts the requestFullscreen call as originating from a user gesture.
   */
  const enterImmersive = useCallback(() => {
    // Synchronous call — this is the only correct place.
    void document.documentElement
      .requestFullscreen({ navigationUI: "hide" })
      .catch(() => {
        // Blocked (e.g. iframe without allowfullscreen) — wall still shows as
        // a fixed overlay covering the viewport.
      });

    setIsImmersive(true);
    setLiveFeedWallFullscreen(true);
    setPhase("setup");
    setLayoutId(DEFAULT_LAYOUT_ID);
    setAssignments([]);
  }, [setLiveFeedWallFullscreen]);

  const exitImmersive = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    resetState();
  }, [resetState]);

  // Detect when the user exits fullscreen via Esc (browser-native) without
  // our exitImmersive being called.
  useEffect(() => {
    const onFsChange = () => {
      if (!immersiveRef.current) return;
      if (!document.fullscreenElement) {
        // Browser exited fullscreen (Esc or OS gesture) — mirror the state.
        resetState();
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [resetState]);

  // Our own Escape key: exit wall and fullscreen together.
  useEffect(() => {
    if (!isImmersive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Let the browser handle fullscreenchange; exitImmersive covers both.
        exitImmersive();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isImmersive, exitImmersive]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
      setLiveFeedWallFullscreen(false);
    };
  }, [setLiveFeedWallFullscreen]);

  const applyLayout = useCallback((id: string, startWall: boolean) => {
    const layout = getLiveFeedLayout(id);
    setLayoutId(id);
    setAssignments((prev) => resizeSlotAssignments(prev, layout.slots));
    if (startWall) setPhase("wall");
  }, []);

  const startWall = useCallback(() => {
    setAssignments((prev) => {
      const layout = getLiveFeedLayout(layoutId);
      return resizeSlotAssignments(prev, layout.slots);
    });
    setPhase("wall");
  }, [layoutId]);

  const setSlotAssignment = useCallback(
    (slotIndex: number, clientId: number | null, slotCount: number) => {
      setAssignments((prev) => {
        const next = resizeSlotAssignments(prev, slotCount);
        if (clientId != null && clientId > 0) {
          const dup = next.findIndex(
            (id, i) => i !== slotIndex && id === clientId,
          );
          if (dup !== -1) next[dup] = null;
        }
        next[slotIndex] = clientId;
        return next;
      });
    },
    [],
  );

  const clearAllAssignments = useCallback((slotCount: number) => {
    setAssignments(resizeSlotAssignments([], slotCount));
  }, []);

  return {
    isImmersive,
    phase,
    layoutId,
    assignments,
    portalMounted,
    enterImmersive,
    exitImmersive,
    applyLayout,
    startWall,
    setSlotAssignment,
    clearAllAssignments,
    setPhase,
  };
}
