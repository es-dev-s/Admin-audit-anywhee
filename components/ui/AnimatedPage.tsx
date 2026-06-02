"use client";

import type { ReactNode } from "react";

/** Static page wrapper — no enter animation (prevents content jump on navigation). */
export function AnimatedPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
