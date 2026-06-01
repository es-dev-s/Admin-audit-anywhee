"use client";

import { CustomSelect, type SelectOption } from "@/components/ui/Select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const pad2 = (n: number) => String(n).padStart(2, "0");

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const HOUR_OPTIONS: SelectOption[] = Array.from({ length: 24 }, (_, i) => ({
  value: pad2(i),
  label: pad2(i),
}));

const MINUTE_SECOND_OPTIONS: SelectOption[] = Array.from(
  { length: 60 },
  (_, i) => ({ value: pad2(i), label: pad2(i) }),
);

type LocalParts = {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
};

function parseLocalDateTimeString(s: string): LocalParts | null {
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return {
    y: d.getFullYear(),
    mo: d.getMonth(),
    d: d.getDate(),
    h: d.getHours(),
    mi: d.getMinutes(),
    s: d.getSeconds(),
  };
}

function formatLocalDateTimeString(p: LocalParts): string {
  return `${p.y}-${pad2(p.mo + 1)}-${pad2(p.d)}T${pad2(p.h)}:${pad2(p.mi)}:${pad2(p.s)}`;
}

function sameCalendarDay(a: LocalParts, b: Date): boolean {
  return (
    a.y === b.getFullYear() &&
    a.mo === b.getMonth() &&
    a.d === b.getDate()
  );
}

function buildCalendarCells(viewYear: number, viewMonth: number): Date[] {
  const first = new Date(viewYear, viewMonth, 1);
  const startPad = first.getDay();
  const start = new Date(viewYear, viewMonth, 1 - startPad);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start));
    start.setDate(start.getDate() + 1);
  }
  return cells;
}

const btnDay =
  "flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[12px] font-medium transition-colors";
const btnDayInMonth =
  "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]";
const btnDayOutside =
  "text-[var(--color-text-muted)]/50 hover:bg-[var(--color-bg-hover)]/80";
const btnDayToday = "ring-1 ring-inset ring-[var(--color-accent)]/40";
const btnDaySelected =
  "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
};

export function CustomDateTimePicker({ id, label, value, onChange }: Props) {
  const parsed = useMemo(() => parseLocalDateTimeString(value), [value]);

  const [viewYear, setViewYear] = useState(() => {
    const p = parseLocalDateTimeString(value);
    return p ? p.y : new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const p = parseLocalDateTimeString(value);
    return p ? p.mo : new Date().getMonth();
  });

  const prevDayKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const p = parseLocalDateTimeString(value);
    const dayKey = p ? `${p.y}-${p.mo}-${p.d}` : "";
    if (dayKey === prevDayKeyRef.current) {
      return;
    }
    prevDayKeyRef.current = dayKey;
    if (p) {
      setViewYear(p.y);
      setViewMonth(p.mo);
    } else {
      const t = new Date();
      setViewYear(t.getFullYear());
      setViewMonth(t.getMonth());
    }
  }, [value]);

  const cells = useMemo(
    () => buildCalendarCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric",
      }).format(new Date(viewYear, viewMonth, 1)),
    [viewYear, viewMonth],
  );

  const goPrevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const goNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  const onPickDay = (cell: Date) => {
    const h = parsed?.h ?? 0;
    const mi = parsed?.mi ?? 0;
    const s = parsed?.s ?? 0;
    const p: LocalParts = {
      y: cell.getFullYear(),
      mo: cell.getMonth(),
      d: cell.getDate(),
      h,
      mi,
      s,
    };
    onChange(formatLocalDateTimeString(p));
  };

  const setTimePart = (part: "h" | "mi" | "s", numStr: string) => {
    if (!parsed) return;
    const n = Number.parseInt(numStr, 10);
    const next: LocalParts = {
      ...parsed,
      h: part === "h" ? n : parsed.h,
      mi: part === "mi" ? n : parsed.mi,
      s: part === "s" ? n : parsed.s,
    };
    onChange(formatLocalDateTimeString(next));
  };

  const clearDate = () => onChange("");

  const today = new Date();

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          id={`${id}-label`}
          className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
        >
          {label}
        </span>
        <button
          type="button"
          onClick={clearDate}
          className="text-[10px] font-medium text-[var(--color-accent)] hover:underline"
        >
          Clear
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={goPrevMonth}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
          aria-label="Previous month"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <span className="min-w-0 flex-1 text-center text-[13px] font-semibold text-[var(--color-text-primary)]">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={goNextMonth}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
          aria-label="Next month"
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>

      <div
        className="grid grid-cols-7 gap-0.5"
        role="grid"
        aria-labelledby={`${id}-label`}
      >
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="flex h-7 items-center justify-center text-[10px] font-semibold text-[var(--color-text-muted)]"
          >
            {w}
          </div>
        ))}
        {cells.map((cell, i) => {
          const inMonth = cell.getMonth() === viewMonth;
          const isToday =
            cell.getFullYear() === today.getFullYear() &&
            cell.getMonth() === today.getMonth() &&
            cell.getDate() === today.getDate();
          const isSelected =
            parsed !== null && sameCalendarDay(parsed, cell);
          return (
            <button
              key={`${cell.getTime()}-${i}`}
              type="button"
              role="gridcell"
              onClick={() => onPickDay(cell)}
              className={`${btnDay} ${
                isSelected
                  ? btnDaySelected
                  : inMonth
                    ? btnDayInMonth
                    : btnDayOutside
              } ${isToday && !isSelected ? btnDayToday : ""}`}
              aria-label={cell.toDateString()}
              aria-selected={isSelected}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--color-border-subtle)] pt-3">
        <span className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Time
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:justify-end">
          <CustomSelect
            id={`${id}-h`}
            aria-label={`${label} hour`}
            value={parsed ? pad2(parsed.h) : "00"}
            onValueChange={(v) => setTimePart("h", v)}
            options={HOUR_OPTIONS}
            placeholder="HH"
            disabled={!parsed}
            size="sm"
            className="min-w-[4.25rem]"
          />
          <span className="pb-2 text-[12px] font-semibold text-[var(--color-text-muted)]">
            :
          </span>
          <CustomSelect
            id={`${id}-m`}
            aria-label={`${label} minute`}
            value={parsed ? pad2(parsed.mi) : "00"}
            onValueChange={(v) => setTimePart("mi", v)}
            options={MINUTE_SECOND_OPTIONS}
            placeholder="mm"
            disabled={!parsed}
            size="sm"
            className="min-w-[4.25rem]"
          />
          <span className="pb-2 text-[12px] font-semibold text-[var(--color-text-muted)]">
            :
          </span>
          <CustomSelect
            id={`${id}-s`}
            aria-label={`${label} second`}
            value={parsed ? pad2(parsed.s) : "00"}
            onValueChange={(v) => setTimePart("s", v)}
            options={MINUTE_SECOND_OPTIONS}
            placeholder="ss"
            disabled={!parsed}
            size="sm"
            className="min-w-[4.25rem]"
          />
        </div>
      </div>
    </div>
  );
}
