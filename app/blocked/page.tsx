"use client";

import { useEffect } from "react";
import { Lock } from "lucide-react";

/**
 * Shown only when the client IP is outside the enterprise allowlist.
 * Context menu / common devtools shortcuts are discouraged (not a security boundary).
 */
export default function EnterpriseBlockedPage() {
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", onContextMenu);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F12") {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey && e.shiftKey && ["I", "J", "C", "K"].includes(e.key)) {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-0 flex min-h-[100dvh] w-screen flex-col overflow-hidden bg-[var(--color-bg-page)]"
      style={{ userSelect: "none" }}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
        <div className="grid h-[120px] w-[120px] place-items-center rounded-full bg-[var(--color-accent-subtle)]">
          <Lock
            className="h-12 w-12 text-[var(--color-accent)]"
            strokeWidth={1.75}
            aria-hidden
          />
        </div>
        <div className="max-w-[400px] text-center">
          <h1 className="text-[28px] font-bold tracking-tight text-[var(--color-text-primary)]">
            Access restricted
          </h1>
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--color-text-secondary)]">
            Your network is not on the approved list for this application. Connect from an allowed
            company network or contact your administrator.
          </p>
          <p className="mt-4 text-[14px] text-[var(--color-text-tertiary)]">
            Need help?{" "}
            <span className="font-medium text-[var(--color-text-link)]">Contact IT support</span>
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- optional brand artwork */}
        <img
          src="/404-page.png"
          alt=""
          className="pointer-events-auto mt-4 max-h-[28vh] w-auto max-w-full object-contain opacity-90"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
}
