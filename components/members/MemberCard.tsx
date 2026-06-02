"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Monitor, User, WifiOff } from "lucide-react";
import { MemberOrgLabel } from "@/components/audit/MemberOrgLabel";
import type { AuditLiveClient } from "@/lib/auditTypes";
import {
  classifyClientRosterStatus,
  clientRosterStatusLabel,
} from "@/lib/auditClientStatus";
import { ClientRosterStatusDot } from "@/components/audit/ClientRosterStatusBadge";

function statusRingColor(status: string | undefined): string {
  const kind = classifyClientRosterStatus(status);
  if (kind === "online") return "var(--color-status-online)";
  if (kind === "offline") return "var(--color-status-offline)";
  return "var(--color-status-unknown)";
}

export function MemberCard({ client, orgId }: { client: AuditLiveClient; orgId: number }) {
  const kind = classifyClientRosterStatus(client.status);
  const offline = kind === "offline";
  const ring = statusRingColor(client.status);
  const initials = client.fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: offline ? 0.5 : 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      className={`ui-stable-card group flex min-h-[160px] flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4 shadow-[var(--shadow-xs)] ${offline ? "" : "cursor-pointer hover:bg-[var(--color-bg-elevated)]"}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-elevated)] border-2 text-[10px] font-bold text-[var(--color-text-secondary)]"
          style={{ borderColor: ring }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <MemberOrgLabel
            fullName={client.fullName}
            claimedOrgName={client.claimedOrgName}
            orgName={client.orgName}
            orgId={client.orgId}
            size="md"
            className="w-full"
          />
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
            <ClientRosterStatusDot status={client.status} className="!border-transparent h-2 w-2" />
            {clientRosterStatusLabel(client.status)}
          </p>
        </div>
      </div>

      {client.screenSources.length > 1 ? (
        <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-2.5 py-1.5 text-[10px] text-[var(--color-text-muted)]">
          <Monitor size={12} aria-hidden />
          {client.screenSources.length} displays
        </div>
      ) : null}

      <div className="mt-auto pt-3 flex items-center justify-between border-t border-[var(--color-border-subtle)]">
        {offline ? (
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
            <WifiOff size={12} /> Offline
          </span>
        ) : (
          <Link
            href={`/audit/${orgId}/${client.id}`}
            className="ui-link inline-flex items-center gap-1.5 text-[12px]"
          >
            View Live{" "}
            <ArrowRight
              size={12}
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
        )}
      </div>
    </motion.div>
  );
}
