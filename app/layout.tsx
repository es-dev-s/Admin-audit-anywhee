import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/toast-context";
import { AuthProvider } from "@/context/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Audit Desk — Real-time Oversight",
  description:
    "Secure real-time desktop monitoring and audit stream management for enterprise teams.",
  icons: {
    icon: [{ url: "/logo.ico", type: "image/x-icon" }],
    shortcut: "/logo.ico",
    apple: "/logo.ico",
  },
  other: {
    "theme-color": "#F7F7F8",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" style={{ colorScheme: "light" }}>
      <body className="flex min-h-full flex-col bg-[var(--color-bg-page)] text-[var(--color-text-primary)]">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
