"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { AnimatedPage } from "@/components/ui/AnimatedPage";
import { useAuth } from "@/context/auth-context";
import {
  apiListMemberAccessRequests,
  apiReviewMemberAccessRequest,
  type MemberAccessRequestRow,
} from "@/lib/authClient";
import { useMemberAccessPendingCount } from "@/hooks/useMemberAccessPendingCount";

export default function TeamLeadApprovalsPage() {
  const { state: authState } = useAuth();
  const isTeamLead =
    authState.status === "authenticated" &&
    authState.user.role === "team_lead";

  const { pendingCount, refresh: refreshBadge } = useMemberAccessPendingCount(
    isTeamLead
  );
  const [requests, setRequests] = useState<MemberAccessRequestRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  const load = useCallback(async () => {
    if (!isTeamLead) return;
    setLoadError(null);
    try {
      const res = await apiListMemberAccessRequests();
      setRequests(res.requests ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
      setRequests([]);
    }
  }, [isTeamLead]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = requests.filter((r) => r.status === "pending");

  const review = async (
    requestId: string,
    action: "approve" | "reject",
    reason?: string
  ) => {
    setBusyId(requestId);
    try {
      await apiReviewMemberAccessRequest({
        requestId,
        action,
        declineReason: reason ?? null,
      });
      await load();
      await refreshBadge();
      setDeclineFor(null);
      setDeclineReason("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  if (authState.status === "loading") {
    return (
      <AnimatedPage>
        <div className="flex min-h-[40dvh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]" />
        </div>
      </AnimatedPage>
    );
  }

  if (!isTeamLead) {
    return (
      <AnimatedPage>
        <p className="p-8 text-[13px] text-[var(--color-text-muted)]">
          Only team leads can review member access requests.
        </p>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
      <div className="mx-auto max-w-[720px]">
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-6">
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)]">
              Member access requests
            </h2>
            <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">
              {pendingCount} pending · Approve to grant live streams (same as Access
              Matrix / Share)
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {loadError ? (
          <p className="mb-4 text-sm text-[var(--red)]">{loadError}</p>
        ) : null}

        {pending.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-sm)]">
            <ShieldCheck
              size={36}
              className="text-[var(--color-success)] opacity-60"
              aria-hidden
            />
            <p className="mt-4 text-[15px] font-semibold text-[var(--color-text-primary)]">
              All clear
            </p>
            <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
              No pending requests from audit members.
            </p>
            <Link
              href="/audit"
              className="mt-4 text-[13px] font-medium text-[var(--color-accent)] hover:underline"
            >
              Back to workspace
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <div
                key={r.id}
                className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] border-l-2 border-l-[var(--color-pending)] bg-[var(--color-bg-surface)] px-5 py-4 shadow-[var(--shadow-xs)]"
              >
                <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                  {r.memberName ?? "Audit member"}
                </p>
                <p className="text-[12px] text-[var(--color-text-muted)]">
                  {r.memberEmail}
                </p>
                <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">
                  {r.shareScope === "team"
                    ? `Whole team: ${r.liveTeamName ?? `Org ${r.signalingOrgId}`}`
                    : `Client stream: ${r.liveMemberName ?? r.signalClientId} · ${r.liveTeamName ?? `Org ${r.signalingOrgId}`}`}
                </p>
                {r.message ? (
                  <p className="mt-1 text-[12px] italic text-[var(--color-text-tertiary)]">
                    “{r.message}”
                  </p>
                ) : null}
                <p className="mt-1 font-mono text-[10px] text-[var(--color-text-muted)]">
                  {new Date(r.requestedAt).toLocaleString()}
                </p>

                {declineFor === r.id ? (
                  <div className="mt-3">
                    <textarea
                      rows={2}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-[13px]"
                      placeholder="Decline reason (optional)"
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1.5 text-[12px]"
                        onClick={() => setDeclineFor(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        className="rounded-lg bg-[var(--color-danger)] px-3 py-1.5 text-[12px] font-semibold text-white"
                        onClick={() =>
                          void review(r.id, "reject", declineReason || undefined)
                        }
                      >
                        Confirm decline
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      className="rounded-lg border border-[var(--color-danger)]/30 px-3 py-1.5 text-[12px] font-medium text-[var(--color-danger)]"
                      onClick={() => setDeclineFor(r.id)}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      className="rounded-lg border border-[var(--color-status-done-border)] bg-[var(--color-status-done-bg)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-status-done-text)]"
                      onClick={() => void review(r.id, "approve")}
                    >
                      {busyId === r.id ? "Working…" : "Approve & grant access"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}
