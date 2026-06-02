import { cn } from "@/lib/utils";

export type StatusType =
  | "online"
  | "live"
  | "offline"
  | "pending"
  | "done"
  | "error"
  | "warning";

const CONFIG: Record<
  StatusType,
  {
    label: string;
    dot: string;
    bg: string;
    border: string;
    text: string;
  }
> = {
  online: {
    label: "Online",
    dot: "bg-[var(--color-status-online)]",
    bg: "bg-[var(--color-status-online-bg)]",
    border: "border-[var(--color-status-online-border)]",
    text: "text-[var(--color-status-online-text)]",
  },
  live: {
    label: "Live",
    dot: "bg-[var(--color-status-live)]",
    bg: "bg-[var(--color-status-live-bg)]",
    border: "border-[var(--color-status-live-border)]",
    text: "text-[var(--color-status-live-text)]",
  },
  pending: {
    label: "Pending",
    dot: "bg-[var(--color-status-pending)]",
    bg: "bg-[var(--color-status-pending-bg)]",
    border: "border-[var(--color-status-pending-border)]",
    text: "text-[var(--color-status-pending-text)]",
  },
  offline: {
    label: "Offline",
    dot: "bg-[var(--color-status-offline)]",
    bg: "bg-[var(--color-status-offline-bg)]",
    border: "border-[var(--color-status-offline-border)]",
    text: "text-[var(--color-status-offline-text)]",
  },
  done: {
    label: "Done",
    dot: "bg-[var(--color-status-done)]",
    bg: "bg-[var(--color-status-done-bg)]",
    border: "border-[var(--color-status-done-border)]",
    text: "text-[var(--color-status-done-text)]",
  },
  error: {
    label: "Error",
    dot: "bg-[var(--color-status-error)]",
    bg: "bg-[var(--color-status-error-bg)]",
    border: "border-[var(--color-status-error-border)]",
    text: "text-[var(--color-status-error-text)]",
  },
  warning: {
    label: "Unknown",
    dot: "bg-[var(--color-status-unknown)]",
    bg: "bg-[var(--color-status-unknown-bg)]",
    border: "border-[var(--color-status-unknown-border)]",
    text: "text-[var(--color-status-unknown-text)]",
  },
};

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  showDot?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({
  status,
  label,
  showDot = true,
  size = "md",
  className,
}: StatusBadgeProps) {
  const c = CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors duration-200",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        c.bg,
        c.border,
        c.text,
        className,
      )}
    >
      {showDot && (
        <span
          className={cn(
            "shrink-0 rounded-full",
            size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
            c.dot,
            status === "live" && "animate-pulse",
          )}
        />
      )}
      {label ?? c.label}
    </span>
  );
}
