"use client";

import { AnimatedPage } from "@/components/ui/AnimatedPage";
import {
  CustomDateTimeRangeFilter,
  type DateTimeRange,
} from "@/components/audit/CustomDateTimeRangeFilter";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/store/uiStore";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Camera, Clock, Download, Flag, ImageOff, Maximize2, RefreshCw } from "lucide-react";
import type { AuditCaptureRow } from "@/lib/auditCaptureTypes";

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

export default function CapturesPage() {
  const [captures, setCaptures] = useState<AuditCaptureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateTimeRange>({
    fromIso: null,
    toIso: null,
  });
  const [lightbox, setLightbox] = useState<AuditCaptureRow | null>(null);
  const [previewMetaOpen, setPreviewMetaOpen] = useState(false);
  const previewLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lightboxTitleId = useId();

  const clearPreviewLeaveTimer = () => {
    if (previewLeaveTimer.current != null) {
      clearTimeout(previewLeaveTimer.current);
      previewLeaveTimer.current = null;
    }
  };

  const openPreviewMeta = () => {
    clearPreviewLeaveTimer();
    setPreviewMetaOpen(true);
  };

  const scheduleClosePreviewMeta = () => {
    clearPreviewLeaveTimer();
    previewLeaveTimer.current = setTimeout(() => setPreviewMetaOpen(false), 450);
  };

  useEffect(() => {
    setPreviewMetaOpen(false);
    clearPreviewLeaveTimer();
    return () => clearPreviewLeaveTimer();
  }, [lightbox?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateRange.fromIso) params.set("from", dateRange.fromIso);
      if (dateRange.toIso) params.set("to", dateRange.toIso);
      const qs = params.toString();
      const res = await fetch(
        `/api/audit-captures${qs ? `?${qs}` : ""}`,
        { credentials: "include" },
      );
      const j = (await res.json()) as { captures?: AuditCaptureRow[]; error?: string };
      if (!res.ok) {
        setError(j.error ?? "Could not load captures");
        setCaptures([]);
        return;
      }
      setCaptures(j.captures ?? []);
    } catch {
      setError("Could not load captures");
      setCaptures([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    useUIStore.getState().setHeader(
      "Captures",
      "Screenshots and flags from live observation — newest first",
    );
    return () => useUIStore.getState().setHeader("", "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadHref = (id: string) => `/api/audit-captures/${id}/image?download=1`;

  return (
    <AnimatedPage className="mx-auto flex h-full w-full max-w-[min(96vw,1600px)] flex-col py-2">
      <div className="mb-4 border-b border-[var(--color-border-subtle)] pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
          Evidence
        </p>
        <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Captures and Flags
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
          {captures.length} evidence records in the selected range.
        </p>
      </div>
      <div className="mb-4 flex shrink-0 justify-end">
        <div className="flex items-center gap-2">
          <CustomDateTimeRangeFilter
            appliedRange={dateRange}
            disabled={loading}
            onApply={setDateRange}
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-4 py-2 text-[12px] font-medium text-[var(--color-text-secondary)] shadow-[var(--shadow-xs)] transition-all duration-200 hover:bg-[var(--color-bg-surface-2)] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-[13px] text-[var(--color-text-muted)]">
          <RefreshCw size={22} className="animate-spin opacity-40" aria-hidden />
          Loading captures…
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8 text-center">
          <p className="text-[13px] text-[var(--color-danger)]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 text-[12px] font-medium text-[var(--color-accent)] hover:underline"
          >
            Try again
          </button>
        </div>
      ) : captures.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-[var(--radius-2xl)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] p-8 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <Clock size={20} className="text-[var(--color-text-muted)]" />
          </div>
          <h3 className="text-[14px] font-medium text-[var(--color-text-primary)]">No captures yet</h3>
          <p className="mt-2 max-w-[320px] text-[12px] leading-relaxed text-[var(--color-text-muted)]">
            Use the camera or flag control while observing a stream. Images are stored for your
            account and listed here with date and time.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-6 pb-12 sm:gap-8 lg:grid-cols-2">
          {captures.map((c) => (
            <li
              key={c.id}
              className={`group flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)] ${
                c.capture_type === "flag"
                  ? "border-[var(--color-pending)]/20 ring-1 ring-[var(--color-pending)]/15"
                  : "border-[var(--color-border-subtle)]"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] px-5 py-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      c.capture_type === "flag"
                        ? "bg-[var(--color-pending-muted)] text-[var(--color-pending)]"
                        : "bg-[var(--color-bg-elevated)] text-[var(--color-accent)]"
                    }`}
                  >
                    {c.capture_type === "flag" ? (
                      <Flag size={16} strokeWidth={2.25} aria-hidden />
                    ) : (
                      <Camera size={16} strokeWidth={2.25} aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={`text-[13px] font-semibold capitalize tracking-tight ${
                        c.capture_type === "flag"
                          ? "text-[var(--color-pending)]"
                          : "text-[var(--color-text-primary)]"
                      }`}
                    >
                      {c.capture_type === "flag" ? "Flag" : "Screenshot"}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">{formatWhen(c.created_at)}</p>
                  </div>
                </div>
                {c.object_key ? (
                  <a
                    href={downloadHref(c.id)}
                    className="ui-icon-btn inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface-2)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-secondary)] transition-all duration-200 hover:bg-[var(--color-bg-hover)]"
                  >
                    <Download size={13} aria-hidden />
                    Download
                  </a>
                ) : null}
              </div>

              <div className="w-full bg-[var(--color-bg-surface)]">
                {c.object_key ? (
                  <button
                    type="button"
                    onClick={() => setLightbox(c)}
                    className={`group relative block w-full cursor-zoom-in overflow-hidden transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      c.capture_type === "flag"
                        ? "focus-visible:outline-[var(--color-pending)]"
                        : "focus-visible:outline-[var(--color-accent)]"
                    }`}
                    aria-label="Open full preview"
                  >
                    <img
                      src={`/api/audit-captures/${c.id}/image`}
                      alt=""
                      className="block h-auto max-h-[min(520px,58vh)] w-full object-contain"
                      loading="lazy"
                    />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-transparent transition-colors duration-200 group-hover:bg-[var(--color-scrim)]/12">
                      <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/92 px-3 py-1.5 text-[11px] font-medium text-[var(--color-text-primary)] opacity-0 shadow-[var(--shadow-md)] backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                        <Maximize2 size={12} aria-hidden />
                        Full preview
                      </span>
                    </span>
                  </button>
                ) : (
                  <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 border-y border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]">
                    <ImageOff size={28} className="opacity-40" aria-hidden />
                    <span className="text-[12px]">No image stored</span>
                  </div>
                )}
              </div>

              {(c.member_name || c.note) && (
                <div className="space-y-2 border-t border-[var(--color-border-subtle)] px-4 py-3">
                  {c.member_name ? (
                    <p className="text-[12px] text-[var(--color-text-secondary)]">
                      <span className="font-medium text-[var(--color-text-muted)]">Member</span>{" "}
                      {c.member_name}
                      {c.team_id != null ? (
                        <span className="text-[var(--color-text-muted)]"> · Team #{c.team_id}</span>
                      ) : null}
                    </p>
                  ) : null}
                  {c.note ? (
                    <p
                      className={`line-clamp-6 whitespace-pre-wrap text-[12px] leading-relaxed ${
                        c.capture_type === "flag"
                          ? "font-medium text-[var(--color-pending)]"
                          : "text-[var(--color-text-secondary)]"
                      }`}
                    >
                      {c.note}
                    </p>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={lightbox != null}
        onClose={() => setLightbox(null)}
        className="w-full max-w-none !p-1 sm:!p-2 md:max-w-[min(99vw,1920px)]"
        labelledBy={lightboxTitleId}
      >
        {lightbox ? (
          <div
            className={`flex flex-col ${
              lightbox.capture_type === "flag"
                ? "rounded-[var(--radius-lg)] bg-[var(--color-pending-muted)] p-1 sm:p-2"
                : ""
            }`}
          >
            {lightbox.object_key ? (
              <>
                <h2
                  id={lightboxTitleId}
                  className="pointer-events-none fixed left-0 top-0 m-0 h-px w-px overflow-hidden border-0 p-0 opacity-0"
                >
                  {lightbox.capture_type === "flag" ? "Flag capture" : "Screenshot"} — {formatWhen(lightbox.created_at)}
                </h2>
                <div
                  className="overflow-hidden rounded-[var(--radius-lg)] bg-black"
                  onMouseEnter={openPreviewMeta}
                  onMouseMove={openPreviewMeta}
                  onMouseLeave={scheduleClosePreviewMeta}
                >
                  <div className="relative w-full">
                    <img
                      src={`/api/audit-captures/${lightbox.id}/image`}
                      alt=""
                      className="mx-auto max-h-[min(92dvh,1240px)] w-full max-w-full object-contain"
                    />
                    <p
                      className={`pointer-events-none absolute bottom-3 left-1/2 z-[1] hidden max-w-[90%] -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 text-center text-[10px] font-medium text-white/90 shadow-sm transition-opacity duration-200 lg:block ${
                        previewMetaOpen ? "opacity-0" : "opacity-100"
                      }`}
                      aria-hidden
                    >
                      Move the pointer to show details
                    </p>
                    <button
                      type="button"
                      className="absolute left-3 top-3 z-[2] hidden rounded-[var(--radius-md)] border border-white/25 bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/95 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:inline-flex"
                      onMouseEnter={openPreviewMeta}
                      onFocus={openPreviewMeta}
                      onClick={openPreviewMeta}
                    >
                      Details
                    </button>
                    <aside
                      className={`absolute inset-y-0 right-0 z-[2] hidden w-[min(320px,38vw)] max-w-full flex-col border-l border-white/15 bg-[var(--color-bg-surface)]/96 shadow-[-16px_0_48px_rgba(0,0,0,0.45)] backdrop-blur-md transition-transform duration-300 ease-out lg:flex lg:flex-col ${
                        previewMetaOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
                      }`}
                      aria-hidden={!previewMetaOpen}
                    >
                      <div className="flex max-h-[min(92dvh,1240px)] flex-1 flex-col gap-4 overflow-y-auto p-4 text-left">
                        <div>
                          <h3
                            className={`flex items-center gap-2 text-[15px] font-semibold leading-snug ${
                              lightbox.capture_type === "flag"
                                ? "text-[var(--color-pending)]"
                                : "text-[var(--color-text-primary)]"
                            }`}
                          >
                            {lightbox.capture_type === "flag" ? (
                              <>
                                <Flag size={18} className="shrink-0" aria-hidden />
                                Flag capture
                              </>
                            ) : (
                              "Screenshot"
                            )}
                          </h3>
                          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{formatWhen(lightbox.created_at)}</p>
                        </div>
                        <dl className="space-y-3.5 text-[12px]">
                          {lightbox.member_name ? (
                            <div>
                              <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                                Member
                              </dt>
                              <dd className="mt-0.5 text-[var(--color-text-secondary)]">
                                {lightbox.member_name}
                                {lightbox.team_id != null ? (
                                  <span className="text-[var(--color-text-muted)]"> · Team #{lightbox.team_id}</span>
                                ) : null}
                              </dd>
                            </div>
                          ) : null}
                          {lightbox.note ? (
                            <div>
                              <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                                Note
                              </dt>
                              <dd
                                className={`mt-0.5 whitespace-pre-wrap leading-relaxed ${
                                  lightbox.capture_type === "flag"
                                    ? "font-medium text-[var(--color-pending)]"
                                    : "text-[var(--color-text-secondary)]"
                                }`}
                              >
                                {lightbox.note}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                        <div className="mt-auto border-t border-[var(--color-border)] pt-3">
                          <a
                            href={downloadHref(lightbox.id)}
                            tabIndex={previewMetaOpen ? 0 : -1}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
                          >
                            <Download size={14} aria-hidden />
                            Download PNG
                          </a>
                        </div>
                      </div>
                    </aside>
                  </div>
                  <div className="border-t border-white/10 bg-[var(--color-bg-surface)] p-3 lg:hidden">
                    <div className="mb-3">
                      <h3
                        className={`flex items-center gap-2 text-[14px] font-semibold ${
                          lightbox.capture_type === "flag"
                            ? "text-[var(--color-pending)]"
                            : "text-[var(--color-text-primary)]"
                        }`}
                      >
                        {lightbox.capture_type === "flag" ? (
                          <>
                            <Flag size={16} className="shrink-0" aria-hidden />
                            Flag capture
                          </>
                        ) : (
                          "Screenshot"
                        )}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{formatWhen(lightbox.created_at)}</p>
                    </div>
                    <dl className="space-y-3 text-[12px]">
                      {lightbox.member_name ? (
                        <div>
                          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Member
                          </dt>
                          <dd className="mt-0.5 text-[var(--color-text-secondary)]">
                            {lightbox.member_name}
                            {lightbox.team_id != null ? (
                              <span className="text-[var(--color-text-muted)]"> · Team #{lightbox.team_id}</span>
                            ) : null}
                          </dd>
                        </div>
                      ) : null}
                      {lightbox.note ? (
                        <div>
                          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Note
                          </dt>
                          <dd
                            className={`mt-0.5 whitespace-pre-wrap leading-relaxed ${
                              lightbox.capture_type === "flag"
                                ? "font-medium text-[var(--color-pending)]"
                                : "text-[var(--color-text-secondary)]"
                            }`}
                          >
                            {lightbox.note}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="mt-4">
                      <a
                        href={downloadHref(lightbox.id)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
                      >
                        <Download size={14} aria-hidden />
                        Download PNG
                      </a>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4 px-2 py-2 sm:px-3 sm:py-3">
                <div>
                  <h2
                    id={lightboxTitleId}
                    className={`flex items-center gap-2 text-[16px] font-semibold ${
                      lightbox.capture_type === "flag"
                        ? "text-[var(--color-pending)]"
                        : "text-[var(--color-text-primary)]"
                    }`}
                  >
                    {lightbox.capture_type === "flag" ? (
                      <>
                        <Flag size={18} className="shrink-0" aria-hidden />
                        Flag (note only)
                      </>
                    ) : (
                      "Capture"
                    )}
                  </h2>
                  <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{formatWhen(lightbox.created_at)}</p>
                </div>
                <dl className="space-y-3 text-[12px]">
                  {lightbox.member_name ? (
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                        Member
                      </dt>
                      <dd className="mt-0.5 text-[var(--color-text-secondary)]">
                        {lightbox.member_name}
                        {lightbox.team_id != null ? (
                          <span className="text-[var(--color-text-muted)]"> · Team #{lightbox.team_id}</span>
                        ) : null}
                      </dd>
                    </div>
                  ) : null}
                  {lightbox.note ? (
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                        Note
                      </dt>
                      <dd
                        className={`mt-0.5 whitespace-pre-wrap leading-relaxed ${
                          lightbox.capture_type === "flag"
                            ? "font-medium text-[var(--color-pending)]"
                            : "text-[var(--color-text-secondary)]"
                        }`}
                      >
                        {lightbox.note}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </AnimatedPage>
  );
}
