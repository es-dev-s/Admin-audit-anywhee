export default function AuditLoading() {
  return (
    <div
      className="flex min-h-[32dvh] items-center justify-center"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-text-secondary)]" />
    </div>
  );
}
