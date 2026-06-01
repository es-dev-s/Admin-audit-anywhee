"use client";
export function PendingBanner({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-warning)]/20 bg-[var(--color-warning-muted)] px-3 py-2 text-[12px] font-medium text-[var(--color-warning)]">
      {text}
    </div>
  );
}
