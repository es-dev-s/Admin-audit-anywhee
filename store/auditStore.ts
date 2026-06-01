"use client";

import { create } from "zustand";
import { type AuditStatus, teams } from "@/lib/mockData";

type AuditState = {
  auditStatuses: Record<string, AuditStatus>;
  requestedAt: Record<string, string>;
  declineReasons: Record<string, string>;
  requestAudit: (teamId: string) => void;
  cancelRequest: (teamId: string) => void;
  acceptAudit: (teamId: string) => void;
  declineAudit: (teamId: string, reason: string) => void;
};

const initialStatuses = Object.fromEntries(teams.map((t) => [t.id, t.auditStatus]));

export const useAuditStore = create<AuditState>((set) => ({
  auditStatuses: initialStatuses,
  requestedAt: {},
  declineReasons: {},
  requestAudit: (teamId) =>
    set((s) => ({
      auditStatuses: { ...s.auditStatuses, [teamId]: "pending" },
      requestedAt: { ...s.requestedAt, [teamId]: new Date().toISOString() },
      declineReasons: { ...s.declineReasons, [teamId]: "" },
    })),
  cancelRequest: (teamId) => set((s) => ({ auditStatuses: { ...s.auditStatuses, [teamId]: "idle" } })),
  acceptAudit: (teamId) => set((s) => ({ auditStatuses: { ...s.auditStatuses, [teamId]: "accepted" } })),
  declineAudit: (teamId, reason) =>
    set((s) => ({
      auditStatuses: { ...s.auditStatuses, [teamId]: "declined" },
      declineReasons: { ...s.declineReasons, [teamId]: reason },
    })),
}));
