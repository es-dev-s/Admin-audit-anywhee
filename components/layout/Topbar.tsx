"use client";

import { Bell, Search, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CommandSearch } from "@/components/ui/CommandSearch";
import { NotificationDrawer } from "@/components/ui/NotificationDrawer";
import { ProfileMenuPanel } from "@/components/ui/ProfileMenuPanel";
import { useOptionalAuditSignaling } from "@/context/audit-signaling-context";
import { useAuditStore } from "@/store/auditStore";
import { useAuth } from "@/context/auth-context";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { state: authState } = useAuth();
  const Object_statuses = useAuditStore((state) => state.auditStatuses);

  const auditSig = useOptionalAuditSignaling();
  const pendingCount = Object.values(Object_statuses).filter(
    (s) => s === "pending"
  ).length;

  const [commandOpen, setCommandOpen] = useState(false);
  const [commandNonce, setCommandNonce] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((o) => {
          const next = !o;
          if (next) setCommandNonce((n) => n + 1);
          return next;
        });
        setDrawerOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      )
        setProfileOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { pageTitle, pageSubtitle } = useUIStore();

  const user =
    authState.status === "authenticated" ? authState.user : null;
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "AU";

  return (
    <>
      <header className="sticky top-0 z-[var(--z-topbar)] w-full shrink-0 border-b border-[var(--color-border-subtle)] glass-topbar">
        <div className="relative flex h-[var(--topbar-height)] w-full items-center justify-between px-4 sm:px-6">
          {/* Left: mobile menu + signal status */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="ui-icon-btn grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] lg:hidden"
              onClick={onOpenMobile}
            >
              <Menu size={18} strokeWidth={2} />
            </button>
            {pageTitle && (
              <div className="ml-3 hidden h-auto min-h-[2.5rem] flex-col justify-center border-l border-[var(--color-border-subtle)] pl-4 sm:flex">
                <span className="text-[15px] font-semibold leading-tight tracking-tight text-[var(--color-text-primary)]">
                  {pageTitle}
                </span>
                {pageSubtitle && (
                  <span className="mt-0.5 text-[12px] font-medium leading-snug tracking-tight text-[var(--color-text-secondary)]">
                    {pageSubtitle}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Open command search"
              className="ui-icon-btn grid h-8 min-h-[32px] shrink-0 place-items-center rounded-[var(--input-radius)] text-[13px] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
              onClick={() => {
                setCommandNonce((n) => n + 1);
                setCommandOpen(true);
                setDrawerOpen(false);
                setProfileOpen(false);
              }}
            >
              <Search size={15} strokeWidth={2} />
            </button>

            <button
              type="button"
              aria-label="Open notifications"
              className="ui-icon-btn relative grid h-9 w-9 shrink-0 place-items-center rounded-[var(--input-radius)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
              onClick={() => {
                setDrawerOpen(true);
                setCommandOpen(false);
                setProfileOpen(false);
              }}
            >
              <Bell size={16} strokeWidth={2} />
              {pendingCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[10px] font-bold text-[var(--color-text-inverse)]">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              ) : null}
            </button>

            <div className="relative ml-1" ref={profileRef}>
              <button
                type="button"
                aria-label="Open profile menu"
                aria-expanded={profileOpen}
                className={cn(
                  "ui-icon-btn flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-accent-subtle)] text-[10px] font-bold text-[var(--color-accent)] transition-all duration-200 hover:border-[var(--color-accent-border)] hover:shadow-[var(--shadow-xs)]",
                  profileOpen &&
                    "ring-2 ring-[var(--color-accent)]/25 ring-offset-2 ring-offset-[var(--color-bg-page)]",
                )}
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setDrawerOpen(false);
                }}
              >
                {initials}
              </button>
              <ProfileMenuPanel
                open={profileOpen}
                onClose={() => setProfileOpen(false)}
                placement="topbar"
              />
            </div>
          </div>
        </div>
      </header>

      <CommandSearch
        key={commandNonce}
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        orgs={auditSig?.orgs ?? []}
        clients={auditSig?.clients ?? []}
      />
      <NotificationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pendingCount={pendingCount}
      />
    </>
  );
}
