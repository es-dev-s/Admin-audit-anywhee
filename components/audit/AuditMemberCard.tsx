"use client";

import Link from "next/link";
import { ChevronRight, Monitor } from "lucide-react";
import type { AuditLiveClient } from "@/lib/auditTypes";
import { auditMemberScreenPath } from "@/lib/auditNav";
import { resolveClientEnrollmentOrg } from "@/lib/memberOrgDisplay";
import {
  ClientRosterStatusBadge,
  ClientRosterStatusDot,
} from "@/components/audit/ClientRosterStatusBadge";

export function AuditMemberCard({ client }: { client: AuditLiveClient }) {
  const displayOrg = resolveClientEnrollmentOrg({
    claimedOrgName: client.claimedOrgName,
    orgName: client.orgName,
    orgId: client.orgId,
  });

  return (
    <Link
      href={auditMemberScreenPath(client.orgId, client.id, "dashboard")}
      className="block outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-page)]"
    >
      <article className="audit-member-card group">
        <div className="audit-member-card__avatar">
          <Monitor size={19} className="text-[var(--color-text-tertiary)]" strokeWidth={1.65} />
          <ClientRosterStatusDot
            status={client.status}
            className="absolute -right-0.5 -top-0.5"
          />
        </div>
        <div className="min-w-0 flex-1">
          {displayOrg ? (
            <p className="audit-member-card__org">{displayOrg}</p>
          ) : null}
          <p className="audit-member-card__name">{client.fullName}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 self-center">
          <ClientRosterStatusBadge status={client.status} />
          <ChevronRight
            size={15}
            className="text-[var(--color-text-tertiary)] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            aria-hidden
          />
        </div>
      </article>
    </Link>
  );
}
