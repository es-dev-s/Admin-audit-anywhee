"use client";

import { CustomDateTimePicker } from "@/components/audit/CustomDateTimePicker";
import { Modal } from "@/components/ui/Modal";
import { useEffect, useId, useState } from "react";
import { CalendarClock, Filter, X } from "lucide-react";

export type DateTimeRange = {
  fromIso: string | null;
  toIso: string | null;
};

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

type Props = {
  disabled?: boolean;
  /** Currently applied range (drives active state and initial draft when opening). */
  appliedRange: DateTimeRange;
  onApply: (range: DateTimeRange) => void;
};

/** Filter icon opens a modal with custom calendar + time controls; Apply commits the query range. */
export function CustomDateTimeRangeFilter({
  disabled,
  appliedRange,
  onApply,
}: Props) {
  const id = useId();
  const titleId = `${id}-title`;
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftFrom(
      appliedRange.fromIso ? isoToDatetimeLocal(appliedRange.fromIso) : "",
    );
    setDraftTo(
      appliedRange.toIso ? isoToDatetimeLocal(appliedRange.toIso) : "",
    );
    setHint(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync draft only when dialog opens; appliedRange read once per open
  }, [open]);

  const isActive = Boolean(appliedRange.fromIso || appliedRange.toIso);

  const apply = () => {
    setHint(null);
    const fromIso = draftFrom.trim()
      ? new Date(draftFrom).toISOString()
      : null;
    const toIso = draftTo.trim() ? new Date(draftTo).toISOString() : null;
    if (fromIso && toIso && fromIso > toIso) {
      setHint("From must be before or equal to To.");
      return;
    }
    onApply({ fromIso, toIso });
    setOpen(false);
  };

  const clearFilter = () => {
    setDraftFrom("");
    setDraftTo("");
    setHint(null);
    onApply({ fromIso: null, toIso: null });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title="Filter by date and time"
        aria-label="Filter by date and time"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] shadow-sm transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50 ${
          isActive
            ? "border-[var(--color-accent)]/50 text-[var(--color-accent)]"
            : ""
        }`}
      >
        <Filter size={16} aria-hidden />
        {isActive ? (
          <span
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
            aria-hidden
          />
        ) : null}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={titleId}
        className="max-w-lg p-5 md:max-w-[min(96vw,56rem)] md:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2" id={titleId}>
            <CalendarClock
              size={18}
              className="shrink-0 text-[var(--color-text-muted)]"
              aria-hidden
            />
            <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
              Custom date and time range
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            aria-label="Close"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">
          Leave either field blank for no bound on that side. Apply to reload
          with this range.
        </p>

        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-stretch md:gap-3">
          <div className="min-w-0 flex-1">
            <CustomDateTimePicker
              id={`${id}-from`}
              label="From"
              value={draftFrom}
              onChange={setDraftFrom}
            />
          </div>
          <div className="min-w-0 flex-1">
            <CustomDateTimePicker
              id={`${id}-to`}
              label="To"
              value={draftTo}
              onChange={setDraftTo}
            />
          </div>
        </div>

        {hint ? (
          <p className="mt-3 text-[12px] font-medium text-[var(--color-danger)]">
            {hint}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] pt-4">
          <button
            type="button"
            onClick={clearFilter}
            className="inline-flex h-9 items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
          >
            Clear filter
          </button>
          <button
            type="button"
            onClick={apply}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            <Filter size={14} aria-hidden />
            Apply
          </button>
        </div>
      </Modal>
    </>
  );
}
