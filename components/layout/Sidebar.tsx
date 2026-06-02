"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  LayoutGrid,
  Building2,
  Radio,
  Clock,
  Users,
  Camera,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  KeyRound,
  ClipboardCheck,
} from "lucide-react";
import { useRecentStore } from "@/store/recentStore";
import { useMemberAccessPendingCount } from "@/hooks/useMemberAccessPendingCount";
import { useAuth } from "@/context/auth-context";
import { useState } from "react";

type SidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
  desktopCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

function isRouteActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/audit") {
    if (pathname === "/audit") return true;
    if (pathname.startsWith("/audit/members")) return false;
    if (pathname.startsWith("/audit/live")) return false;
    if (pathname.startsWith("/audit/timeline")) return false;
    if (pathname.startsWith("/audit/captures")) return false;
    if (pathname.startsWith("/audit/organizations")) return false;
    return pathname.startsWith("/audit/");
  }
  if (href === "/audit/members") return pathname.startsWith("/audit/members");
  if (href === "/audit/captures") return pathname.startsWith("/audit/captures");
  if (href === "/audit/access") return pathname.startsWith("/audit/access");
  if (href === "/team-lead") return pathname.startsWith("/team-lead");
  return pathname.startsWith(href);
}

export function Sidebar({
  mobileOpen,
  onClose,
  desktopCollapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const { state: authState, logout } = useAuth();
  const isTeamLead =
    authState.status === "authenticated" && authState.user.role === "team_lead";
  const { pendingCount } = useMemberAccessPendingCount(isTeamLead);
  const user = authState.status === "authenticated" ? authState.user : null;

  const [overviewOpen, setOverviewOpen] = useState(true);
  const [operationsOpen, setOperationsOpen] = useState(true);
  const [accessOpen, setAccessOpen] = useState(true);
  const recentStreams = useRecentStore((s) => s.recentStreams);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "AU";

  const collapseTextClass = desktopCollapsed
    ? "opacity-0 w-0 overflow-hidden pointer-events-none"
    : "opacity-100";

  const navBase =
    "flex items-center gap-2.5 min-h-10 rounded-[14px] text-[13px] font-medium text-[var(--color-text-secondary)] transition-all duration-[var(--transition-base)] hover:bg-white/55 hover:text-[var(--color-text-primary)] [&_svg]:text-[var(--color-text-tertiary)] hover:[&_svg]:text-[var(--color-text-secondary)]";
  const navActive =
    "bg-white/90 text-[var(--color-accent)] font-semibold shadow-[var(--shadow-xs)] ring-1 ring-[var(--color-border-subtle)] [&_svg]:text-[var(--color-accent)]";
  const navIdle = "font-medium";
  const navPad = desktopCollapsed ? "justify-center px-0 w-full min-w-0" : "px-3 py-2";

  const sectionLabel =
    "text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)] px-3 mt-4 mb-2";

  const isOverviewOpen = desktopCollapsed || overviewOpen;

  return (
    <>
      <AnimatePresence>
        {mobileOpen ? (
          <motion.button
            aria-label="Close sidebar"
            type="button"
            className="fixed inset-0 z-[calc(var(--z-sidebar)-1)] bg-[var(--color-bg-scrim)] backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
        ) : null}
      </AnimatePresence>

      <aside
        style={{
          width: desktopCollapsed
            ? "var(--sidebar-collapsed-width)"
            : "var(--sidebar-width)",
        }}
        className={`fixed inset-y-0 left-0 z-[var(--z-sidebar)] flex flex-col overflow-hidden border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-sidebar)] transition-[width,transform] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          mobileOpen
            ? "translate-x-0 !w-[var(--sidebar-width)]"
            : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="relative flex h-[var(--topbar-height)] shrink-0 items-center border-b border-[var(--color-border-subtle)] px-3 transition-all">
          <span
            className={`text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)] whitespace-nowrap transition-all duration-300 ${collapseTextClass}`}
          >
            Audit Desk
          </span>
        </div>

        <nav className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar-hide py-2 px-1">
          <div>
            <button
              type="button"
              onClick={() => setOverviewOpen(!overviewOpen)}
              className={`${sectionLabel} flex w-full items-center justify-between rounded-[var(--input-radius)] py-1 hover:bg-[var(--color-bg-surface-2)] ${desktopCollapsed ? "invisible opacity-0 h-0 mt-0 mb-0 p-0 overflow-hidden" : ""}`}
            >
              <span>Overview</span>
              <ChevronDown
                size={12}
                className={`shrink-0 transition-transform duration-200 ${overviewOpen ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence initial={false}>
              {isOverviewOpen && (
                <motion.div
                  initial={desktopCollapsed ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-0.5"
                >
                  <Link
                    href="/audit"
                    onClick={() => onClose()}
                    className={`${navBase} ${navPad} ${isRouteActive(pathname, "/audit") ? navActive : navIdle}`}
                    title="Dashboard"
                  >
                    <LayoutGrid size={15} strokeWidth={2.5} className="shrink-0" />
                    <span
                      className={`whitespace-nowrap transition-all duration-300 ${collapseTextClass}`}
                    >
                      Dashboard
                    </span>
                  </Link>
                  <Link
                    href="/audit/live"
                    onClick={() => onClose()}
                    className={`${navBase} ${navPad} ${isRouteActive(pathname, "/audit/live") ? navActive : navIdle}`}
                    title="Live Feed"
                  >
                    <Radio size={15} strokeWidth={2.5} className="shrink-0" />
                    <span
                      className={`whitespace-nowrap transition-all duration-300 ${collapseTextClass}`}
                    >
                      Live Feed
                    </span>
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {isTeamLead && (
            <>
              <div className="my-2 border-t border-[var(--color-border-subtle)]" />
              <div>
                <button
                  type="button"
                  onClick={() => setOperationsOpen(!operationsOpen)}
                  className={`${sectionLabel} flex w-full items-center justify-between rounded-[var(--input-radius)] py-1 hover:bg-[var(--color-bg-surface-2)] ${desktopCollapsed ? "invisible opacity-0 h-0 mt-0 mb-0 p-0 overflow-hidden" : ""}`}
                >
                  <span>Operations</span>
                  <div className="flex items-center gap-1.5">
                    {pendingCount > 0 && (
                      <span className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[9px] font-bold text-[var(--color-text-inverse)]">
                        {pendingCount}
                      </span>
                    )}
                    <ChevronDown
                      size={12}
                      className={`shrink-0 transition-transform duration-200 ${operationsOpen ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {(desktopCollapsed || operationsOpen) && (
                    <motion.div
                      initial={desktopCollapsed ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-0.5"
                    >
                      <Link
                        href="/audit/organizations"
                        onClick={() => onClose()}
                        className={`${navBase} ${navPad} ${isRouteActive(pathname, "/audit/organizations") ? navActive : navIdle}`}
                        title="Organizations"
                      >
                        <Building2 size={15} strokeWidth={2.5} className="shrink-0" />
                        <span
                          className={`whitespace-nowrap transition-all duration-300 ${collapseTextClass}`}
                        >
                          Organizations
                        </span>
                      </Link>
                      <Link
                        href="/audit/members"
                        onClick={() => onClose()}
                        className={`${navBase} ${navPad} ${isRouteActive(pathname, "/audit/members") ? navActive : navIdle}`}
                        title="Members"
                      >
                        <Users size={15} strokeWidth={2.5} className="shrink-0" />
                        <span
                          className={`whitespace-nowrap transition-all duration-300 ${collapseTextClass}`}
                        >
                          Members
                        </span>
                      </Link>
                      <Link
                        href="/team-lead"
                        onClick={() => onClose()}
                        className={`${navBase} ${navPad} ${isRouteActive(pathname, "/team-lead") ? navActive : navIdle}`}
                        title="Member requests"
                      >
                        <ClipboardCheck size={15} strokeWidth={2.5} className="shrink-0" />
                        <span
                          className={`whitespace-nowrap transition-all duration-300 ${collapseTextClass}`}
                        >
                          Approvals
                          {pendingCount > 0 ? ` (${pendingCount})` : ""}
                        </span>
                      </Link>
                      <Link
                        href="/audit/timeline"
                        onClick={() => onClose()}
                        className={`${navBase} ${navPad} ${isRouteActive(pathname, "/audit/timeline") ? navActive : navIdle}`}
                        title="Timeline"
                      >
                        <Clock size={15} strokeWidth={2.5} className="shrink-0" />
                        <span
                          className={`whitespace-nowrap transition-all duration-300 ${collapseTextClass}`}
                        >
                          Timeline
                        </span>
                      </Link>
                      <Link
                        href="/audit/captures"
                        onClick={() => onClose()}
                        className={`${navBase} ${navPad} ${isRouteActive(pathname, "/audit/captures") ? navActive : navIdle}`}
                        title="Captures"
                      >
                        <Camera size={15} strokeWidth={2.5} className="shrink-0" />
                        <span
                          className={`whitespace-nowrap transition-all duration-300 ${collapseTextClass}`}
                        >
                          Captures
                        </span>
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setAccessOpen(!accessOpen)}
                  className={`${sectionLabel} flex w-full items-center justify-between rounded-[var(--input-radius)] py-1 hover:bg-[var(--color-bg-surface-2)] ${desktopCollapsed ? "invisible opacity-0 h-0 mt-0 mb-0 p-0 overflow-hidden" : ""}`}
                >
                  <span>Access</span>
                  <ChevronDown
                    size={12}
                    className={`shrink-0 transition-transform duration-200 ${accessOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {(desktopCollapsed || accessOpen) && (
                    <motion.div
                      initial={desktopCollapsed ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-0.5"
                    >
                      <Link
                        href="/audit/access"
                        onClick={() => onClose()}
                        className={`${navBase} ${navPad} ${isRouteActive(pathname, "/audit/access") ? navActive : navIdle}`}
                        title="Access Matrix"
                      >
                        <KeyRound size={15} strokeWidth={2.5} className="shrink-0" />
                        <span
                          className={`whitespace-nowrap transition-all duration-300 ${collapseTextClass}`}
                        >
                          Access Matrix
                        </span>
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}

          <div className="my-2 border-t border-[var(--color-border-subtle)]" />

          <div>
            <p
              className={`${sectionLabel} ${desktopCollapsed ? "invisible opacity-0 h-0 mt-0 mb-0 overflow-hidden" : ""}`}
            >
              Recent
            </p>
            <div className="flex flex-col gap-0.5">
              {recentStreams.length === 0 ? (
                <div
                  className={`${navBase} ${navPad} text-[var(--color-text-tertiary)]`}
                  title="No recent streams"
                >
                  <Radio size={14} className="shrink-0 opacity-50" />
                  <span
                    className={`whitespace-nowrap transition-all duration-300 ${collapseTextClass}`}
                  >
                    No recent streams
                  </span>
                </div>
              ) : (
                recentStreams.map((stream, index) => (
                  <div
                    key={`recent-${stream.id}-${stream.timestamp}-${index}`}
                    className={`${navBase} ${navPad} text-[var(--color-text-secondary)]`}
                    title={`Recently viewed: ${stream.name}`}
                  >
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-accent-subtle)]">
                      <span
                        className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-[var(--color-bg-surface)] bg-[var(--color-status-live)]"
                        aria-hidden
                      />
                      <span className="text-[9px] font-bold text-[var(--color-accent)]">
                        {stream.name.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span
                      className={`truncate transition-all duration-300 ${collapseTextClass}`}
                    >
                      {stream.name}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex-1" />

          {!mobileOpen && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={`${navBase} ${navPad} ${navIdle}`}
              title={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {desktopCollapsed ? (
                <PanelLeftOpen size={16} strokeWidth={2.5} className="shrink-0" />
              ) : (
                <PanelLeftClose size={16} strokeWidth={2.5} className="shrink-0" />
              )}
              <span
                className={`whitespace-nowrap transition-all duration-300 ${collapseTextClass}`}
              >
                Collapse
              </span>
            </button>
          )}
        </nav>

        <div className="shrink-0 border-t border-[var(--color-border-subtle)] p-2 transition-all duration-300">
          <div className="group/user relative flex h-10 w-full cursor-pointer items-center overflow-hidden rounded-[12px] py-1 transition-all duration-200 hover:bg-white/50">
            <div className="flex w-10 shrink-0 flex-col items-center justify-center relative">
              <div
                className={`flex shrink-0 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-accent-subtle)] font-bold text-[var(--color-accent)] transition-all duration-300 ${desktopCollapsed ? "h-7 w-7 text-[9px]" : "h-7 w-7 text-[10px]"}`}
              >
                {initials}
              </div>

              {desktopCollapsed && (
                <div className="absolute left-[calc(100%+8px)] z-50 flex w-0 items-center justify-center overflow-hidden rounded-[var(--input-radius)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 py-1.5 opacity-0 shadow-[var(--shadow-md)] transition-all duration-200 group-hover/user:w-auto group-hover/user:opacity-100 group-hover/user:overflow-visible whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="flex items-center gap-2 text-[12px] font-medium text-[var(--red)] hover:opacity-80"
                  >
                    <LogOut size={12} strokeWidth={2.5} /> Sign out
                  </button>
                </div>
              )}
            </div>

            <div className={`min-w-0 transition-all duration-300 ${collapseTextClass}`}>
              <p className="text-[13px] font-semibold text-[var(--color-text-primary)] truncate leading-[1.2]">
                {user?.name ?? "User"}
              </p>
              <p className="text-[11px] text-[var(--color-text-tertiary)] truncate leading-[1.2]">
                {user?.role?.replace("_", " ") ?? ""}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void logout()}
              className={`absolute right-1 grid h-7 w-7 place-items-center rounded-[var(--input-radius)] text-[var(--color-text-tertiary)] transition-all duration-300 hover:bg-[var(--color-bg-surface-2)] hover:text-[var(--color-text-secondary)] ${desktopCollapsed ? "translate-x-4 opacity-0 pointer-events-none" : "translate-x-0 opacity-100"}`}
              aria-label="Sign out"
            >
              <LogOut size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
