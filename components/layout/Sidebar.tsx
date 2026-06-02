"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useMemo } from "react";
import {
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
import { useAuth } from "@/context/auth-context";
import { useAssignedGroupsScope } from "@/context/audit-signaling-context";
import { useMemberAccessPendingCount } from "@/hooks/useMemberAccessPendingCount";
import { cn } from "@/lib/utils";
import "./sidebar.css";

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

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  showBadgeSlot?: boolean;
};

const ORG_NAV_ITEM: NavItem = {
  href: "/audit/organizations",
  label: "Organizations",
  icon: Building2,
};

/** Shown only when scope is ready and the lead is not limited to assigned groups. */
const OrganizationsNavSlot = memo(function OrganizationsNavSlot({
  visible,
  pathname,
  collapsed,
  onNavigate,
}: {
  visible: boolean;
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  if (!visible) return null;
  return (
    <NavLink
      item={ORG_NAV_ITEM}
      pathname={pathname}
      collapsed={collapsed}
      onNavigate={onNavigate}
    />
  );
});

const NavLink = memo(function NavLink({
  item,
  pathname,
  collapsed,
  badgeCount,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  badgeCount?: number;
  onNavigate: () => void;
}) {
  const active = isRouteActive(pathname, item.href);
  const Icon = item.icon;
  const showBadge = item.showBadgeSlot && badgeCount != null && badgeCount > 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn("audit-sidebar__link", active && "audit-sidebar__link--active")}
    >
      <Icon className="audit-sidebar__icon" size={18} strokeWidth={2} aria-hidden />
      <span className="audit-sidebar__link-text">{item.label}</span>
      {item.showBadgeSlot ? (
        <span className="audit-sidebar__badge-slot" aria-hidden={!showBadge}>
          {showBadge ? (
            <span className="audit-sidebar__badge" aria-label={`${badgeCount} pending`}>
              {collapsed ? "" : badgeCount! > 9 ? "9+" : badgeCount}
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
});

const SidebarBrand = memo(function SidebarBrand({
  collapsed,
  groupScope,
}: {
  collapsed: boolean;
  groupScope: string | null;
}) {
  return (
    <div className="audit-sidebar__brand">
      <span className="audit-sidebar__mark" aria-hidden>
        A
      </span>
      <span className="audit-sidebar__title">Audit</span>
      {groupScope && !collapsed ? (
        <p className="audit-sidebar__scope">{groupScope}</p>
      ) : (
        <p className="audit-sidebar__scope" aria-hidden>
          &nbsp;
        </p>
      )}
    </div>
  );
});

function SidebarInner({
  mobileOpen,
  onClose,
  desktopCollapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const { state: authState, logout } = useAuth();
  const { groups: assignedGroups, ready: scopeReady, hasGroupScope } =
    useAssignedGroupsScope();
  const isTeamLead =
    authState.status === "authenticated" && authState.user.role === "team_lead";
  const { pendingCount } = useMemberAccessPendingCount(isTeamLead);
  const user = authState.status === "authenticated" ? authState.user : null;

  const collapsed = desktopCollapsed && !mobileOpen;

  const groupScope = useMemo(() => {
    if (!isTeamLead || assignedGroups.length === 0) return null;
    return assignedGroups.map((g) => g.name).join(" · ");
  }, [isTeamLead, assignedGroups]);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "AU";

  const primaryNav: NavItem[] = [
    { href: "/audit", label: "Dashboard", icon: LayoutGrid },
    { href: "/audit/live", label: "Live Feed", icon: Radio },
  ];

  const showOrganizations =
    isTeamLead && scopeReady && !hasGroupScope;

  const manageNavRest: NavItem[] = isTeamLead
    ? [
        { href: "/audit/members", label: "Members", icon: Users },
        {
          href: "/team-lead",
          label: "Approvals",
          icon: ClipboardCheck,
          showBadgeSlot: true,
        },
        { href: "/audit/timeline", label: "Timeline", icon: Clock },
        { href: "/audit/captures", label: "Captures", icon: Camera },
        { href: "/audit/access", label: "Access", icon: KeyRound },
      ]
    : [];

  const onNavigate = () => onClose();

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        className={cn(
          "audit-sidebar-backdrop lg:hidden",
          mobileOpen && "audit-sidebar-backdrop--visible",
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          "audit-sidebar",
          collapsed && "audit-sidebar--collapsed",
          mobileOpen ? "audit-sidebar--mobile-open" : "audit-sidebar--mobile-closed",
        )}
      >
        <SidebarBrand collapsed={collapsed} groupScope={groupScope} />

        <nav className="audit-sidebar__nav" aria-label="Main">
          <div className="audit-sidebar__section">
            <p className="audit-sidebar__label">Monitor</p>
            <div className="audit-sidebar__items">
              {primaryNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>

          {isTeamLead ? (
            <div className="audit-sidebar__section audit-sidebar__section--manage">
              <p className="audit-sidebar__label">Manage</p>
              <div className="audit-sidebar__items">
                <OrganizationsNavSlot
                  visible={showOrganizations}
                  pathname={pathname}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
                {manageNavRest.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                    badgeCount={item.showBadgeSlot ? pendingCount : undefined}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {!mobileOpen && onToggleCollapse ? (
            <button
              type="button"
              className="audit-sidebar__collapse"
              onClick={onToggleCollapse}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen size={18} strokeWidth={2} aria-hidden />
              ) : (
                <PanelLeftClose size={18} strokeWidth={2} aria-hidden />
              )}
              <span className="audit-sidebar__collapse-label">Collapse</span>
            </button>
          ) : null}
        </nav>

        <div className="audit-sidebar__footer">
          <div className="audit-sidebar__user">
            <div className="audit-sidebar__avatar" aria-hidden>
              {initials}
            </div>
            <div className="audit-sidebar__user-meta">
              <p className="audit-sidebar__user-name">{user?.name ?? "User"}</p>
              <p className="audit-sidebar__user-role">{user?.role?.replace("_", " ") ?? ""}</p>
            </div>
            <button
              type="button"
              className="audit-sidebar__logout"
              onClick={() => void logout()}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export const Sidebar = memo(SidebarInner);
