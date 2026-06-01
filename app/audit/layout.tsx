import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AuditSignalingProvider } from "@/context/audit-signaling-context";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function AuditLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AuditSignalingProvider>
        <AppShell>{children}</AppShell>
      </AuditSignalingProvider>
    </AuthGuard>
  );
}
