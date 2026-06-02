"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
  /** Secondary line (e.g. profile org under member name). */
  sublabel?: string;
  /** Renders a small “Profile” chip before sublabel when set. */
  sublabelKind?: "profile" | "org";
};

type PopoverCoords = {
  /** Open below trigger (top edge pinned) vs above (bottom edge pinned to trigger top). */
  placement: "below" | "above";
  top: number | null;
  bottom: number | null;
  left: number;
  width: number;
  maxHeight: number;
};

type CustomSelectProps = {
  value: string;
  onValueChange: (next: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  variant?: "light" | "dark";
  size?: "xs" | "sm" | "md";
};

const POPOVER_Z = 10_000;

/** Scroll containers between the trigger and the document (window scroll alone misses nested overflow). */
function collectScrollContainers(anchor: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let n: HTMLElement | null = anchor.parentElement;
  while (n) {
    const st = getComputedStyle(n);
    const ox = st.overflowX;
    const oy = st.overflowY;
    const axisScrollable =
      /(auto|scroll|overlay)/.test(ox) || /(auto|scroll|overlay)/.test(oy);
    if (axisScrollable) {
      const dy = n.scrollHeight - n.clientHeight;
      const dx = n.scrollWidth - n.clientWidth;
      if (dy > 1 || dx > 1) out.push(n);
    }
    n = n.parentElement;
  }
  return out;
}

export function CustomSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  disabled,
  className = "",
  triggerClassName = "",
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  variant = "light",
  size = "md",
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords>({
    placement: "below",
    top: 0,
    bottom: null,
    left: 0,
    width: 0,
    maxHeight: 240,
  });
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId();
  const listboxId = id ?? `custom-select-${uid}`;

  const selected = options.find((o) => o.value === value);
  const isPlaceholder = !selected || value === "";

  const syncHighlight = useCallback(() => {
    const i = options.findIndex((o) => o.value === value);
    setHighlight(i >= 0 ? i : 0);
  }, [options, value]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) syncHighlight();
  }, [open, syncHighlight]);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const maxList = 320;
    const spaceBelow = window.innerHeight - r.bottom - gap - margin;
    const spaceAbove = r.top - gap - margin;
    const openDown = spaceBelow >= 120 || spaceBelow >= spaceAbove;
    let maxHeight = Math.min(maxList, Math.max(100, openDown ? spaceBelow : spaceAbove));
    let top: number | null = null;
    let bottom: number | null = null;
    let placement: "below" | "above" = "below";

    if (openDown) {
      placement = "below";
      top = r.bottom + gap;
    } else {
      /* Anchor the popover's bottom to (trigger top − gap) so short lists sit flush
         above the control. Using maxHeight in `top` reserved full list height and
         left a large empty gap (stream toolbar case). */
      placement = "above";
      const roomAbove = r.top - gap - margin;
      maxHeight = Math.min(maxHeight, Math.max(80, roomAbove));
      bottom = window.innerHeight - r.top + gap;
    }
    let left = r.left;
    let width = r.width;
    const minWidth = Math.max(r.width, 220);
    width = Math.max(minWidth, width);
    if (left + width > window.innerWidth - margin) {
      left = window.innerWidth - width - margin;
    }
    if (left < margin) left = margin;
    if (width > window.innerWidth - 2 * margin) {
      width = window.innerWidth - 2 * margin;
      left = margin;
    }
    setCoords((prev) => {
      const next: PopoverCoords = {
        placement,
        top,
        bottom,
        left,
        width,
        maxHeight,
      };
      const axisSame =
        next.placement === "below"
          ? prev.top != null &&
            next.top != null &&
            Math.abs(prev.top - next.top) < 0.5 &&
            prev.bottom == null &&
            next.bottom == null
          : prev.bottom != null &&
            next.bottom != null &&
            Math.abs(prev.bottom - next.bottom) < 0.5 &&
            prev.top == null &&
            next.top == null;
      if (
        prev.placement === next.placement &&
        axisSame &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5 &&
        Math.abs(prev.maxHeight - next.maxHeight) < 0.5
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    updatePosition();

    const sync = () => updatePosition();

    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);

    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    vv?.addEventListener("scroll", sync);
    vv?.addEventListener("resize", sync);

    const scrollRoots = el ? collectScrollContainers(el) : [];
    for (const root of scrollRoots) {
      root.addEventListener("scroll", sync, { passive: true });
    }

    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(sync);
      ro.observe(el);
    }

    let burstFrame = 0;
    let burstId = 0;
    const BURST_FRAMES = 36;
    const runBurst = () => {
      sync();
      burstFrame++;
      if (burstFrame < BURST_FRAMES) burstId = requestAnimationFrame(runBurst);
    };
    burstId = requestAnimationFrame(runBurst);

    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      vv?.removeEventListener("resize", sync);
      for (const root of scrollRoots) {
        root.removeEventListener("scroll", sync);
      }
      ro?.disconnect();
      cancelAnimationFrame(burstId);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => listRef.current?.focus());
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  const close = () => setOpen(false);

  const pick = (v: string) => {
    onValueChange(v);
    close();
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((o) => !o);
    }
    if (e.key === "Escape") close();
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setHighlight(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setHighlight(options.length - 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[highlight];
      if (opt) pick(opt.value);
    }
  };

  const h = size === "xs" ? "h-7" : size === "sm" ? "h-8" : "h-9";
  const text = size === "xs" || size === "sm" ? "text-xs" : "text-[13px]";
  const chevron = size === "md" ? 15 : 14;

  const triggerLight = `${h} w-full flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-3 ${text} font-medium outline-none transition-[box-shadow,border-color] duration-200 focus-visible:border-[var(--accent)]/30 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/15 focus-visible:shadow-[0_0_0_3px_var(--color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50`;
  const triggerDark = `${h} w-full flex items-center justify-between gap-2 rounded-full border border-white/10 bg-white/[0.06] px-2.5 ${text} font-medium text-white/90 outline-none backdrop-blur-sm transition-colors hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50`;

  /** Scroll + chrome live on the fixed wrapper so maxHeight clips correctly (ul % height is unreliable). */
  const shellLight =
    "overflow-y-auto overflow-x-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--bg-card)] py-1 shadow-[var(--shadow-md)]";
  const shellDark =
    "overflow-y-auto overflow-x-hidden rounded-xl border border-white/12 bg-[#1c1c1e]/95 py-1 shadow-lg backdrop-blur-xl";

  const itemLight = (active: boolean, chosen: boolean) =>
    `flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors ${
      active ? "bg-[var(--bg-subtle)]" : ""
    } ${chosen ? "bg-[var(--color-accent-subtle)]/40" : ""}`;

  const itemDark = (active: boolean, chosen: boolean) =>
    `flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors ${
      active ? "bg-white/10" : ""
    } ${chosen ? "bg-white/[0.08]" : ""}`;

  const renderOptionBody = (opt: SelectOption, chosen: boolean, variant: "light" | "dark") => (
    <span className="min-w-0 flex-1">
      <span className="block min-w-0">
        {opt.sublabelKind === "profile" && opt.sublabel ? (
          <span
            className={`flex min-w-0 items-center gap-1.5 rounded-md border px-1.5 py-0.5 ${
              variant === "dark"
                ? "border-white/12 bg-white/[0.06]"
                : "border-[var(--color-profile-primary-border)] bg-[var(--color-profile-primary-bg)]"
            }`}
          >
            <span
              className={`shrink-0 text-[9px] font-bold uppercase tracking-wide ${
                variant === "dark" ? "text-white/50" : "text-[var(--color-group-highlight-muted)]"
              }`}
            >
              Profile
            </span>
            <span
              className={`min-w-0 truncate text-[12px] font-semibold ${
                variant === "dark" ? "text-white/92" : "text-[var(--color-profile-primary)]"
              }`}
            >
              {opt.sublabel}
            </span>
          </span>
        ) : null}
        <span
          className={`block truncate leading-tight ${
            opt.sublabelKind === "profile" && opt.sublabel
              ? `mt-0.5 text-[11px] font-medium ${
                  variant === "dark" ? "text-white/45" : "text-[var(--color-member-name-secondary)]"
                }`
              : `text-[13px] font-semibold ${
                  variant === "dark"
                    ? chosen
                      ? "text-white"
                      : "text-white/90"
                    : "text-[var(--text-primary)]"
                }`
          }`}
        >
          {opt.label}
        </span>
      </span>
      {opt.sublabel && opt.sublabelKind !== "profile" ? (
        <span
          className={`mt-0.5 block min-w-0 truncate text-[11px] font-medium ${
            variant === "dark" ? "text-white/50" : "text-[var(--color-text-tertiary)]"
          }`}
        >
          {opt.sublabel}
        </span>
      ) : null}
    </span>
  );

  const popover =
    open && options.length > 0 ? (
      <AnimatePresence>
        <motion.div
          key="select-popover"
          ref={popoverRef}
          className={`pointer-events-auto ${variant === "dark" ? shellDark : shellLight}`}
          style={{
            position: "fixed",
            ...(coords.placement === "below"
              ? { top: coords.top ?? 0, bottom: "auto" as const }
              : { top: "auto" as const, bottom: coords.bottom ?? 0 }),
            left: coords.left,
            width: coords.width,
            maxHeight: coords.maxHeight,
            zIndex: POPOVER_Z,
          }}
          initial={{
            opacity: 0,
            y:
              variant === "dark"
                ? 0
                : coords.placement === "above"
                  ? 6
                  : -4,
          }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y:
              variant === "dark"
                ? 0
                : coords.placement === "above"
                  ? 6
                  : -4,
          }}
          transition={{ duration: 0.12, ease: [0.32, 0.72, 0, 1] }}
        >
          <ul
            ref={listRef}
            id={`${listboxId}-list`}
            role="listbox"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabel ? undefined : ariaLabelledBy}
            tabIndex={0}
            onKeyDown={onListKeyDown}
            className="m-0 list-none p-0"
          >
            {options.map((opt, i) => {
              const chosen = opt.value === value;
              const active = i === highlight;
              return (
                <li key={`${i}-${opt.value || "empty"}`} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={chosen}
                    className={
                      variant === "dark" ? itemDark(active, chosen) : itemLight(active, chosen)
                    }
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(opt.value)}
                  >
                    {renderOptionBody(opt, chosen, variant)}
                    {chosen ? (
                      <Check
                        size={14}
                        className="shrink-0 text-[var(--accent)]"
                        aria-hidden
                      />
                    ) : (
                      <span className="w-[14px] shrink-0" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </motion.div>
      </AnimatePresence>
    ) : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={listboxId}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${listboxId}-list` : undefined}
        aria-labelledby={ariaLabel ? undefined : ariaLabelledBy}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={`${variant === "dark" ? triggerDark : triggerLight} ${triggerClassName}`}
      >
        {isPlaceholder || !selected ? (
          <span
            className={`min-w-0 flex-1 truncate text-left ${
              variant === "dark" ? "text-white/50" : "text-[var(--text-tertiary)]"
            }`}
          >
            {placeholder}
          </span>
        ) : selected.sublabel && selected.sublabelKind === "profile" ? (
          <span className="min-w-0 flex-1 text-left">
            <span className="flex min-w-0 items-center gap-1 truncate">
              <span
                className={`shrink-0 rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide ${
                  variant === "dark"
                    ? "bg-white/12 text-white/50"
                    : "text-[var(--color-group-highlight-muted)]"
                }`}
              >
                Profile
              </span>
              <span
                className={`min-w-0 truncate text-[11px] font-semibold ${
                  variant === "dark" ? "text-white/90" : "text-[var(--color-profile-primary)]"
                }`}
              >
                {selected.sublabel}
              </span>
            </span>
            <span
              className={`mt-0.5 block truncate text-[10px] font-medium ${
                variant === "dark" ? "text-white/45" : "text-[var(--color-member-name-secondary)]"
              }`}
            >
              {selected.label}
            </span>
          </span>
        ) : selected.sublabel ? (
          <span className="min-w-0 flex-1 text-left">
            <span
              className={`block truncate text-left font-semibold leading-tight ${
                variant === "dark" ? "text-white/90" : "text-[var(--text-primary)]"
              }`}
            >
              {selected.label}
            </span>
            <span
              className={`mt-0.5 block truncate text-[10px] ${
                variant === "dark" ? "text-white/45" : "text-[var(--color-text-tertiary)]"
              }`}
            >
              {selected.sublabel}
            </span>
          </span>
        ) : (
          <span
            className={`min-w-0 flex-1 truncate text-left font-medium ${
              variant === "dark" ? "text-white/90" : "text-[var(--text-primary)]"
            }`}
          >
            {selected.label}
          </span>
        )}
        <ChevronDown
          size={chevron}
          className={`shrink-0 opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""} ${variant === "dark" ? "text-white/60" : ""}`}
          aria-hidden
        />
      </button>

      {mounted ? createPortal(popover, document.body) : null}
    </div>
  );
}
