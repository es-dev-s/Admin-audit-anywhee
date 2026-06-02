"use client";

import { AnimatedPage } from "@/components/ui/AnimatedPage";
import {
  CustomDateTimeRangeFilter,
  type DateTimeRange,
} from "@/components/audit/CustomDateTimeRangeFilter";
import { useUIStore } from "@/store/uiStore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  LogIn,
  LogOut,
  Radio,
  ShieldCheck,
  ShieldX,
  ShieldOff,
  UserPlus,
  Users,
  Building2,
  Clock,
} from "lucide-react";
import Link from "next/link";

export type AuditTimelineApiEvent = {
  id: string;
  createdAt: string;
  eventType: string;
  summary: string;
  detail: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  recipientUserId: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  auditOrgId: string | null;
  auditOrgName: string | null;
  signalingOrgId: number | null;
  signalingOrgLabel: string | null;
  liveTeamId: number | null;
  liveTeamName: string | null;
  liveMemberId: number | null;
  liveMemberName: string | null;
  decision: string | null;
  reviewedByLabel: string | null;
  metadata: Record<string, unknown>;
  captureId: string | null;
};

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

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function dayKey(iso: string) {
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function dayHeading(iso: string) {
  try {
    const d = new Date(iso);
    const today = new Date();
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const dk = d.toDateString();
    if (dk === today.toDateString()) return "Today";
    if (dk === y.toDateString()) return "Yesterday";
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return iso;
  }
}

type FilterKey = "all" | "auth" | "org" | "share" | "members";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "auth", label: "Sign-in" },
  { key: "org", label: "Team requests" },
  { key: "share", label: "Sharing" },
  { key: "members", label: "Directory" },
];

function filterMatches(filter: FilterKey, eventType: string): boolean {
  if (filter === "all") return true;
  if (filter === "auth")
    return eventType === "auth_login" || eventType === "auth_logout";
  if (filter === "org")
    return (
      eventType === "org_access_requested" ||
      eventType === "org_access_approved" ||
      eventType === "org_access_rejected" ||
      eventType === "org_access_revoked"
    );
  if (filter === "share")
    return eventType === "access_share" || eventType === "access_revoke";
  if (filter === "members")
    return (
      eventType === "member_audit_org_updated" ||
      eventType === "member_access_requested" ||
      eventType === "member_access_approved" ||
      eventType === "member_access_rejected"
    );
  return true;
}

function eventIcon(eventType: string) {
  switch (eventType) {
    case "auth_login":
      return LogIn;
    case "auth_logout":
      return LogOut;
    case "org_access_requested":
      return Radio;
    case "org_access_approved":
      return ShieldCheck;
    case "org_access_rejected":
      return ShieldX;
    case "org_access_revoked":
      return ShieldOff;
    case "access_share":
    case "access_revoke":
      return UserPlus;
    case "member_audit_org_updated":
    case "member_access_requested":
    case "member_access_approved":
    case "member_access_rejected":
      return Users;
    default:
      return Clock;
  }
}

function decisionStyles(d: string | null) {
  if (d === "approved")
    return "border border-[var(--color-status-online-border)] bg-[var(--color-status-online-bg)] text-[var(--color-status-online-text)]";
  if (d === "rejected")
    return "border border-[var(--color-status-error-border)] bg-[var(--color-status-error-bg)] text-[var(--color-status-error-text)]";
  if (d === "revoked")
    return "border border-[var(--color-status-pending-border)] bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-text)]";
  return "";
}

function EventDetails({ e }: { e: AuditTimelineApiEvent }) {
  const actorLine =
    e.actorName && e.actorEmail
      ? `${e.actorName} · ${e.actorEmail}`
      : e.actorName ?? e.actorEmail;
  const recipientLine =
    e.recipientName && e.recipientEmail
      ? `${e.recipientName} · ${e.recipientEmail}`
      : e.recipientName ?? e.recipientEmail;

  const rows: { label: string; value: string | null }[] = [
    { label: "When", value: formatWhen(e.createdAt) },
    { label: "Event", value: e.eventType.replace(/_/g, " ") },
    { label: "Actor", value: actorLine },
    { label: "Recipient", value: recipientLine },
    { label: "Directory organization", value: e.auditOrgName },
    { label: "Live org label", value: e.signalingOrgLabel },
    { label: "Live org ID", value: e.signalingOrgId != null ? String(e.signalingOrgId) : null },
    { label: "Live team name", value: e.liveTeamName },
    { label: "Live member", value: e.liveMemberName },
    { label: "Decision", value: e.decision },
    { label: "Reviewer", value: e.reviewedByLabel },
  ];

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--color-border-subtle)] pt-3 text-left">
      {e.detail ? (
        <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">{e.detail}</p>
      ) : null}
      <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
        {rows.map(
          ({ label, value }) =>
            value && (
              <div key={label} className="min-w-0">
                <dt className="font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {label}
                </dt>
                <dd className="mt-0.5 break-words text-[var(--color-text-secondary)]">{value}</dd>
              </div>
            ),
        )}
      </dl>
      {e.captureId ? (
        <Link
          href={`/audit/captures`}
          className="inline-flex text-[11px] font-medium text-[var(--color-accent)] hover:underline"
        >
          Open Captures (related image may be listed there)
        </Link>
      ) : null}
    </div>
  );
}

export default function TimelinePage() {
  const [events, setEvents] = useState<AuditTimelineApiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [dateRange, setDateRange] = useState<DateTimeRange>({
    fromIso: null,
    toIso: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateRange.fromIso) params.set("from", dateRange.fromIso);
      if (dateRange.toIso) params.set("to", dateRange.toIso);
      const qs = params.toString();
      const res = await fetch(
        `/api/audit-timeline${qs ? `?${qs}` : ""}`,
        { credentials: "include" },
      );
      const j = (await res.json()) as { events?: AuditTimelineApiEvent[]; error?: string };
      if (!res.ok) {
        setError(j.error ?? "Could not load timeline");
        setEvents([]);
        return;
      }
      setEvents(j.events ?? []);
    } catch {
      setError("Could not load timeline");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    useUIStore.getState().setHeader(
      "Timeline",
      "Full audit log — each entry shows time, actors, recipients, and related orgs in one view",
    );
    return () => useUIStore.getState().setHeader("", "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => events.filter((ev) => filterMatches(filter, ev.eventType)),
    [events, filter],
  );

  const grouped = useMemo(() => {
    const m = new Map<string, AuditTimelineApiEvent[]>();
    for (const ev of filtered) {
      const k = dayKey(ev.createdAt);
      const arr = m.get(k) ?? [];
      arr.push(ev);
      m.set(k, arr);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const eventCount = filtered.length;

  return (
    <AnimatedPage className="mx-auto flex h-full w-full max-w-[min(96vw,980px)] flex-col py-2">
      <div className="mb-4 border-b border-[var(--color-border-subtle)] pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
          Audit Log
        </p>
        <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Timeline Events
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
          {eventCount} visible events for the selected filter window.
        </p>
      </div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all duration-200 ${
                filter === f.key
                  ? "border-[var(--color-accent-border)] bg-[var(--color-accent-subtle)] text-[var(--color-accent)] shadow-[var(--shadow-xs)]"
                  : "border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface-2)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
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
          Loading timeline…
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8 text-center">
          <p className="text-[13px] text-[var(--color-danger)]">{error}</p>
          <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">
            If this is the first run, apply the Supabase migration that creates{" "}
            <code className="rounded bg-[var(--color-bg-elevated)] px-1">audit_timeline_events</code>.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 text-[12px] font-medium text-[var(--color-accent)] hover:underline"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-[var(--radius-2xl)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] p-10 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <Clock size={20} className="text-[var(--color-text-muted)]" />
          </div>
          <h3 className="text-[14px] font-medium text-[var(--color-text-primary)]">No events yet</h3>
          <p className="mt-2 max-w-md text-[12px] leading-relaxed text-[var(--color-text-muted)]">
            Activity appears here when you and your audit members sign in, request live team access,
            receive approvals, share streams, or update member directory organizations.
          </p>
          <p className="mt-4 text-[12px] text-[var(--color-text-muted)]">
            Stream screenshots and flags live under{" "}
            <Link href="/audit/captures" className="font-medium text-[var(--color-accent)] hover:underline">
              Captures
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="relative pb-16 pl-2 sm:pl-0">
          <div
            className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-[var(--color-border-subtle)] via-[var(--color-border)]/40 to-[var(--color-border-subtle)] sm:left-[19px]"
            aria-hidden
          />
          <div className="space-y-10">
            {grouped.map(([dk, dayEvents]) => (
              <section key={dk}>
                <h2 className="mb-4 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  <Building2 size={14} className="opacity-60" aria-hidden />
                  {dayHeading(dayEvents[0]!.createdAt)}
                </h2>
                <ul className="space-y-3">
                  {dayEvents.map((e) => {
                    const Icon = eventIcon(e.eventType);
                    return (
                      <li key={e.id} className="relative pl-10 sm:pl-12">
                        <span className="absolute left-0 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-xs)] ring-1 ring-black/[0.02] sm:left-1">
                          <Icon size={14} className="text-[var(--color-text-secondary)]" aria-hidden />
                        </span>
                        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-5 py-4 shadow-[var(--shadow-sm)] transition-shadow duration-200 hover:shadow-[var(--shadow-md)]">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium text-[var(--color-text-primary)]">
                                {e.summary}
                              </p>
                              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                                {formatTime(e.createdAt)} ·{" "}
                                <span className="capitalize">
                                  {e.eventType.replace(/_/g, " ")}
                                </span>
                              </p>
                            </div>
                            {e.decision ? (
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${decisionStyles(e.decision)}`}
                              >
                                {e.decision}
                              </span>
                            ) : null}
                          </div>
                          <EventDetails e={e} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </AnimatedPage>
  );
}
