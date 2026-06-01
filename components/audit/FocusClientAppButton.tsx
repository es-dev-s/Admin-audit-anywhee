"use client";

import { useAuditSignaling } from "@/context/audit-signaling-context";
import { AppWindow } from "lucide-react";

const dockBtn =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition-all duration-150 hover:bg-white/[0.12] hover:text-white active:scale-[0.9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] disabled:opacity-40";

const headerBtn =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-white/75 transition-all hover:bg-white/[0.14] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40";

/** Signals the member’s Electron app to show/focus (via signaling server). */
export function FocusClientAppButton({
  clientId,
  disabled,
  variant = "dock",
}: {
  clientId: number;
  disabled?: boolean;
  variant?: "dock" | "header";
}) {
  const { requestClientAppFocus } = useAuditSignaling();

  return (
    <button
      type="button"
      className={variant === "dock" ? dockBtn : headerBtn}
      aria-label="Bring client app to front"
      title="Bring client app to front"
      disabled={disabled}
      onClick={() => requestClientAppFocus(clientId)}
    >
      <AppWindow size={variant === "dock" ? 15 : 14} aria-hidden />
    </button>
  );
}
