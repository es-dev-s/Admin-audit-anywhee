import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Access restricted",
  robots: { index: false, follow: false },
};

/** No shell — full-viewport artwork only (middleware only allows this for off-network clients). */
export default function BlockedLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
