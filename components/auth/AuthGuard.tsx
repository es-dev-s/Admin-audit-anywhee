"use client";
// components/auth/AuthGuard.tsx
// Renders children only when the user is authenticated.
// Otherwise renders a loading spinner or redirects to /login.
// Used by every protected layout (audit, team-lead).

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    if (state.status === "unauthenticated") {
      router.replace("/login");
    }
  }, [state.status, router]);

  useEffect(() => {
    if (state.status !== "loading") return;
    const id = requestAnimationFrame(() => setBarWidth(70));
    return () => cancelAnimationFrame(id);
  }, [state.status]);

  if (state.status === "loading") {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center bg-[var(--color-bg-page)]">
        <div
          className="fixed left-0 top-0 z-[9999] h-0.5 bg-[var(--color-accent)] transition-[width] duration-[1500ms] ease-out"
          style={{ width: `${barWidth}%` }}
          aria-hidden
        />
        <p className="text-[15px] font-medium text-[var(--color-text-primary)]">Audit Desk</p>
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return null;
  }

  return <>{children}</>;
}
