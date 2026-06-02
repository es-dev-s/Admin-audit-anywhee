"use client";

import { useMemo } from "react";
import { useAssignedGroups } from "@/context/audit-signaling-context";
import {
  auditMemberBackHref,
  auditMemberBackLabel,
} from "@/lib/auditNav";

export function useAuditBackNav(orgId: number, from: string | null | undefined) {
  const assignedGroups = useAssignedGroups();
  const hasGroupScope = assignedGroups.length > 0;

  const backHref = useMemo(
    () => auditMemberBackHref(orgId, from, hasGroupScope),
    [orgId, from, hasGroupScope],
  );

  const backLabel = useMemo(
    () => auditMemberBackLabel(from, hasGroupScope),
    [from, hasGroupScope],
  );

  return { backHref, backLabel, hasGroupScope };
}
