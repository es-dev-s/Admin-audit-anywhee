"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BellOff, X } from "lucide-react";
import { useEffect } from "react";

export function NotificationDrawer({
  open, onClose, pendingCount,
}: {
  open: boolean;
  onClose: () => void;
  pendingCount: number;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const teamWord = pendingCount === 1 ? "team" : "teams";

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-[calc(var(--z-modal)-1)] bg-[var(--color-scrim)] backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="notif-drawer-title"
            initial={reduceMotion ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            transition={{ duration: reduceMotion ? 0.01 : 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="fixed right-0 top-0 z-[var(--z-modal)] flex h-full w-[min(340px,100vw)] flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-surface)] shadow-[-8px_0_40px_rgba(15,23,42,0.08)] ring-1 ring-[var(--color-border-subtle)]"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
              <h2 id="notif-drawer-title" className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                Notifications
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="ui-link text-[12px]"
                  onClick={onClose}
                >
                  Mark all read
                </button>
                <button
                  type="button" aria-label="Close"
                  className="ui-icon-btn grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
                  onClick={onClose}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {pendingCount > 0 ? (
                <div className="border-b border-[var(--color-border)] px-4 py-4">
                  <div className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-pending)]" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[var(--color-text-primary)]">
                        Pending audit approvals
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                        {pendingCount} {teamWord} awaiting authorisation
                      </p>
                      <p className="mt-1.5 text-[10px] text-[var(--color-text-muted)]">Just now</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
                  <BellOff size={32} className="text-[var(--color-text-muted)] opacity-30" aria-hidden />
                  <p className="text-[12px] text-[var(--color-text-muted)]">
                    No pending notifications
                  </p>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
