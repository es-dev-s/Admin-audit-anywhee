"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Briefcase,
  ChevronRight,
  HelpCircle,
  LogOut,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";

export function ProfileMenuPanel({
  open, onClose, placement,
}: {
  open: boolean;
  onClose: () => void;
  placement: "topbar" | "sidebar";
}) {
  const reduceMotion = useReducedMotion();
  const { state, logout } = useAuth();

  const pos =
    placement === "topbar"
      ? "right-0 top-full mt-2"
      : "bottom-full left-0 right-0 mb-2";

  const user = state.status === "authenticated" ? state.user : null;
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "AU";

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  const menuItem =
    "flex h-8 w-full items-center gap-2.5 rounded-[var(--radius-md)] px-3 text-left text-[12px] font-medium text-[var(--color-text-secondary)] transition-all duration-200 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] active:scale-[0.99]";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.98, y: placement === "topbar" ? 4 : -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: placement === "topbar" ? 4 : -4 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: [0.32, 0.72, 0, 1] }}
          className={`absolute z-[calc(var(--z-topbar)+1)] w-[260px] rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-1.5 shadow-[var(--shadow-panel)] ring-1 ring-[var(--color-border-subtle)] ${pos}`}
          role="menu"
        >
          {/* User info */}
          <div className="mx-1 mb-1 flex items-center gap-2.5 border-b border-[var(--color-border)] p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] text-[10px] font-bold text-[var(--color-text-secondary)]">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                {user?.name ?? "User"}
              </h3>
              <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                {user?.email ?? ""}
              </p>
              {user?.role && (
                <p className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mt-0.5">
                  {user.role.replace("_", " ")}
                </p>
              )}
            </div>
          </div>

          <div className="px-1 py-0.5">
            <p className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
              Organization
            </p>
            <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-[12px] font-medium text-[var(--color-text-secondary)]">
              <Briefcase size={13} className="text-[var(--color-text-muted)]" aria-hidden />
              AnyWhere OS Global
            </div>
            <button type="button" className={menuItem + " mt-0.5"}>
              <Users size={13} aria-hidden />
              Switch org
            </button>
          </div>

          <hr className="my-1 border-[var(--color-border)]" />

          <div className="space-y-0.5 px-1">
            <button type="button" className={menuItem}>
              <Settings size={13} aria-hidden />
              Account Settings
            </button>
            <button type="button" className={menuItem}>
              <SlidersHorizontal size={13} aria-hidden />
              Preferences
            </button>
            <button type="button" className={menuItem}>
              <HelpCircle size={13} aria-hidden />
              Help &amp; Support
            </button>
          </div>

          <hr className="my-1 border-[var(--color-border)]" />

          <div className="px-1 pb-0.5">
            <button
              type="button"
              className="flex h-8 w-full items-center justify-between rounded-[var(--radius-md)] px-3 text-left text-[12px] font-semibold text-[var(--color-danger)] transition-all duration-200 hover:bg-[var(--color-danger-muted)] active:scale-[0.99]"
              onClick={handleLogout}
            >
              <span className="flex items-center gap-2.5">
                <LogOut size={13} aria-hidden />
                Sign Out
              </span>
              <ChevronRight size={12} className="text-[var(--color-text-muted)]" aria-hidden />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
