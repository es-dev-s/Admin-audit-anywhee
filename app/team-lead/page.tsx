"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { AnimatedPage } from "@/components/ui/AnimatedPage";
import { teams } from "@/lib/mockData";
import { useAuditStore } from "@/store/auditStore";

export default function TeamLeadPage() {
  const { auditStatuses, requestedAt, acceptAudit, declineAudit } = useAuditStore();
  const pending = useMemo(
    () => teams.filter((team) => auditStatuses[team.id] === "pending"),
    [auditStatuses],
  );
  const [reasonBy, setReasonBy] = useState<Record<string, string>>({});
  const [exiting, setExiting] = useState<Record<string, "approved" | "declined">>({});

  const toggleReasonInput = (teamId: string) => {
    setReasonBy((state) => {
      if (state[teamId] === undefined) return { ...state, [teamId]: "" };
      const copy = { ...state };
      delete copy[teamId];
      return copy;
    });
  };

  const pendingCount = pending.length;

  return (
    <AnimatedPage>
      <div className="mx-auto max-w-[680px]">
        <div className="border-b border-[var(--color-border-subtle)] pb-6 mb-8">
          <h2 className="text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            Approvals
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">
            {pendingCount} pending authorisation{pendingCount === 1 ? "" : "s"}
          </p>
        </div>

        {pending.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)]">
            <ShieldCheck size={36} className="text-[var(--color-success)] opacity-60" aria-hidden />
            <p className="mt-4 text-[15px] font-semibold text-[var(--color-text-primary)]">All clear</p>
            <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">No pending approval requests.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((team, index) => {
              const requestedText = requestedAt[team.id]
                ? new Date(requestedAt[team.id]).toLocaleTimeString()
                : "Not available";
              const phase = exiting[team.id];

              return (
                <motion.div
                  key={team.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    opacity: phase ? 0.6 : 1,
                    x: phase ? 12 : 0,
                  }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ delay: index * 0.05, duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                  className={`rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] border-l-2 bg-[var(--color-bg-surface)] px-5 py-4 shadow-[var(--shadow-xs)] ${
                    phase === "approved"
                      ? "border-l-[var(--color-success)]"
                      : phase === "declined"
                        ? "border-l-[var(--color-danger)]"
                        : "border-l-[var(--color-pending)]"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">{team.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-[var(--color-text-muted)]">{requestedText}</p>
                      <p className="mt-1.5 text-[12px] text-[var(--color-text-secondary)]">
                        Telemetry + live desktop audit
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                      <AnimatePresence mode="wait">
                        {phase === "approved" ? (
                          <motion.span
                            key="ap"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="rounded-[var(--radius-pill)] bg-[var(--color-success-muted)] border border-[var(--color-success)]/20 px-3 py-1 text-[11px] font-semibold text-[var(--color-success)]"
                          >
                            Approved
                          </motion.span>
                        ) : phase === "declined" ? (
                          <motion.span
                            key="de"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="rounded-[var(--radius-pill)] bg-[var(--color-danger-muted)] border border-[var(--color-danger)]/20 px-3 py-1 text-[11px] font-semibold text-[var(--color-danger)]"
                          >
                            Declined
                          </motion.span>
                        ) : (
                          <motion.div key="act" className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 px-3 py-1.5 text-[12px] font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] transition-colors"
                              onClick={() => toggleReasonInput(team.id)}
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              className="rounded-[var(--radius-md)] border border-[var(--color-status-done-border)] bg-[var(--color-status-done-bg)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-status-done-text)] transition-opacity hover:opacity-90"
                              onClick={() => {
                                setExiting((e) => ({ ...e, [team.id]: "approved" }));
                                window.setTimeout(() => {
                                  acceptAudit(team.id);
                                  setExiting((e) => { const n = { ...e }; delete n[team.id]; return n; });
                                }, 2000);
                              }}
                            >
                              Approve
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <AnimatePresence>
                    {reasonBy[team.id] !== undefined && !phase ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 overflow-hidden"
                      >
                        <textarea
                          className="mb-2 w-full rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-bg-input)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-danger)]/20"
                          onChange={(event) => {
                            const reason = event.target.value;
                            setReasonBy((state) => ({ ...state, [team.id]: reason }));
                          }}
                          placeholder="Decline reason"
                          value={reasonBy[team.id]}
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
                            onClick={() => toggleReasonInput(team.id)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="rounded-[var(--radius-md)] bg-[var(--color-danger)] px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
                            onClick={() => {
                              setExiting((e) => ({ ...e, [team.id]: "declined" }));
                              const reason = reasonBy[team.id] || "Policy conflict";
                              window.setTimeout(() => {
                                declineAudit(team.id, reason);
                                setExiting((e) => { const n = { ...e }; delete n[team.id]; return n; });
                              }, 2000);
                            }}
                          >
                            Confirm decline
                          </button>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}
