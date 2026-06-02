"use client";

import {
  classifyClientRosterStatus,
  clientRosterStatusLabel,
  clientRosterToBadgeStatus,
} from "@/lib/auditClientStatus";
import { StatusBadge } from "@/components/audit/StatusBadge";
import { cn } from "@/lib/utils";

type ClientRosterStatusBadgeProps = {
  status: string | undefined;
  size?: "sm" | "md";
  className?: string;
};

/** Member roster status: green online, red offline, yellow unknown. */
export function ClientRosterStatusBadge({
  status,
  size = "sm",
  className,
}: ClientRosterStatusBadgeProps) {
  const kind = classifyClientRosterStatus(status);
  return (
    <StatusBadge
      status={clientRosterToBadgeStatus(kind)}
      label={clientRosterStatusLabel(status)}
      size={size}
      className={className}
    />
  );
}

/** Small dot for avatars / pickers — uses semantic CSS vars. */
export function ClientRosterStatusDot({
  status,
  className,
}: {
  status: string | undefined;
  className?: string;
}) {
  const kind = classifyClientRosterStatus(status);
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border-2 border-[var(--color-bg-surface)]",
        "h-2.5 w-2.5",
        kind === "online" && "bg-[var(--color-status-online)]",
        kind === "offline" && "bg-[var(--color-status-offline)]",
        kind === "unknown" && "bg-[var(--color-status-unknown)]",
        className,
      )}
      aria-hidden
    />
  );
}
