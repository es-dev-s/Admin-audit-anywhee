"use client";

import {
  memberOrgPlainText,
  resolveClientEnrollmentOrg,
} from "@/lib/memberOrgDisplay";

export type MemberOrgLabelProps = {
  fullName: string;
  orgName?: string | null;
  /** Org from client app install (`claimed_org_name` on signaling). */
  claimedOrgName?: string | null;
  orgId?: number;
  /** Visual size for org pill + name text. */
  size?: "xs" | "sm" | "md";
  /** Light UI vs stream overlay (dark). */
  tone?: "default" | "on-dark";
  className?: string;
  title?: string;
};

const sizeStyles = {
  xs: {
    wrap: "gap-1",
    org: "px-1 py-0.5 text-[9px]",
    name: "text-[11px]",
  },
  sm: {
    wrap: "gap-1.5",
    org: "px-1.5 py-0.5 text-[10px]",
    name: "text-[12px]",
  },
  md: {
    wrap: "gap-2",
    org: "px-2 py-0.5 text-[11px]",
    name: "text-[13px]",
  },
} as const;

/**
 * Organization + member name shown as one unit (highlighted org, always paired).
 */
export function MemberOrgLabel({
  fullName,
  orgName,
  claimedOrgName,
  orgId,
  size = "sm",
  tone = "default",
  className = "",
  title,
}: MemberOrgLabelProps) {
  const org = resolveClientEnrollmentOrg({ claimedOrgName, orgName, orgId });
  const name = fullName.trim() || "Member";
  const s = sizeStyles[size];
  const onDark = tone === "on-dark";

  const orgClass = onDark
    ? "rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/20 font-bold uppercase tracking-wide text-[var(--color-accent)]"
    : "rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-accent-muted)] font-bold uppercase tracking-wide text-[var(--color-accent)]";

  const nameClass = onDark
    ? "font-semibold text-white/90"
    : "font-semibold text-[var(--color-text-primary)]";

  return (
    <span
      className={`inline-flex max-w-full min-w-0 flex-nowrap items-center ${s.wrap} ${className}`}
      title={title ?? memberOrgPlainText(name, orgName, orgId, claimedOrgName)}
    >
      <span className={`shrink-0 ${s.org} ${orgClass}`}>{org}</span>
      <span className={`min-w-0 truncate ${s.name} ${nameClass}`}>{name}</span>
    </span>
  );
}
