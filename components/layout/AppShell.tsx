"use client";

import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  /* Cinema mode: full-page stream view for /audit/[teamId]/[memberId] */
  const isCinema = Boolean(pathname.match(/^\/audit\/\d+\/\d+$/));
  const isLiveFeed = pathname.startsWith("/audit/live");

  if (isCinema) {
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--color-bg-stream)]">
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-[100dvh] min-h-0 overflow-hidden",
        isLiveFeed ? "bg-[var(--color-bg-stream)]" : "bg-[var(--color-bg-page)]",
      )}
    >
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        desktopCollapsed={desktopCollapsed}
        onToggleCollapse={() => setDesktopCollapsed((c) => !c)}
      />

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          desktopCollapsed
            ? "lg:ml-[var(--sidebar-collapsed-width)]"
            : "lg:ml-[var(--sidebar-width)]",
        )}
      >
        {isLiveFeed ? (
          <div className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-stream)] px-4 lg:hidden">
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} strokeWidth={2} />
            </button>
            <span className="text-[13px] font-semibold text-white/80">Live Feed</span>
          </div>
        ) : (
          <Topbar onOpenMobile={() => setMobileOpen(true)} />
        )}

        <main
          className={cn(
            "min-h-0 flex-1",
            isLiveFeed ? "flex h-full min-h-0 flex-col overflow-hidden" : "overflow-y-auto",
          )}
        >
          <div
            className={cn(
              "mx-auto w-full",
              isLiveFeed
                ? "flex h-full min-h-0 max-w-none flex-1 flex-col p-0"
                : "max-w-[var(--content-max-width)] px-8 py-8",
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
