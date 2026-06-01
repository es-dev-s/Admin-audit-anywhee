"use client";

import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  /* Cinema mode: full-page stream view — hide sidebar + topbar */
  const isCinema = Boolean(pathname.match(/^\/audit\/\d+\/\d+$/));

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
        "relative flex h-[100dvh] min-h-0 overflow-hidden bg-[var(--color-bg-page)]",
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
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-300",
          desktopCollapsed
            ? "lg:ml-[var(--sidebar-collapsed-width)]"
            : "lg:ml-[var(--sidebar-width)]",
        )}
      >
        <Topbar onOpenMobile={() => setMobileOpen(true)} />

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              "mx-auto w-full max-w-[var(--content-max-width)] px-8 py-8",
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
