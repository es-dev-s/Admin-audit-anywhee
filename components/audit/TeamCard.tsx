"use client";

import Link from "next/link";
import { ChevronRight, Users, Radio } from "lucide-react";

export type LiveTeamCardProps = {
  orgId: number;
  name: string;
  memberCount: number;
  onlineCount: number;
  sharingCount: number;
};

export function TeamCard({
  orgId, name, memberCount, onlineCount, sharingCount,
}: LiveTeamCardProps) {
  return (
    <Link href={`/audit/${orgId}`} className="block rounded-[var(--radius-xl)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-base)]">
      <article className="ui-stable-card group relative flex cursor-pointer flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5 shadow-[var(--shadow-xs)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] transition-colors duration-300 group-hover:border-[var(--color-border-strong)] group-hover:bg-[var(--color-bg-surface)]">
              <span className="text-[13px] font-bold text-[var(--color-text-secondary)]">
                {name.substring(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-[14px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                {name}
              </h3>
              <p className="mt-0.5 text-[11px] font-mono text-[var(--color-text-muted)]">ID · {orgId}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[12px] font-mono text-[var(--color-text-muted)]">
            <div className="flex items-center gap-1.5">
              <Users size={12} />
              <span>{memberCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Radio size={12} className={sharingCount > 0 ? "text-[var(--color-accent)]" : ""} />
              <span className={sharingCount > 0 ? "text-[var(--color-accent)]" : ""}>{sharingCount}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  onlineCount > 0
                    ? "bg-[var(--color-status-online)]"
                    : memberCount > 0
                      ? "bg-[var(--color-status-offline)]"
                      : "bg-[var(--color-status-unknown)]"
                }`}
              />
              <span className="text-[11px] text-[var(--color-text-muted)]">{onlineCount} online</span>
            </div>
          </div>

          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] transition-colors group-hover:bg-[var(--color-bg-active)] group-hover:text-[var(--color-text-primary)]">
            <ChevronRight size={14} strokeWidth={2} />
          </div>
        </div>
      </article>
    </Link>
  );
}
