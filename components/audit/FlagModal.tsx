"use client";

import { Flag, ImageOff } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";

export function FlagModal({
  open,
  onClose,
  onSubmitted,
  teamId,
  memberId,
  memberName,
  snapshotDataUrl,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  teamId: number;
  memberId: number;
  memberName: string;
  /** PNG data URL captured from the stream at flag click; null if unavailable. */
  snapshotDataUrl: string | null;
}) {
  const titleId = useId();
  const descId = useId();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("captureType", "flag");
      fd.append("teamId", String(teamId));
      fd.append("memberId", String(memberId));
      fd.append("memberName", memberName);
      if (note.trim()) {
        fd.append("note", note.trim());
      }

      if (snapshotDataUrl) {
        const blob = await fetch(snapshotDataUrl).then((r) => r.blob());
        fd.append("file", blob, "flag.png");
      }

      const res = await fetch("/api/audit-captures", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        showToast(j.error ?? "Could not save flag", "error");
        return;
      }

      console.info("[audit] flag session saved", {
        teamId,
        memberId,
        timestamp: Date.now(),
        note: note.trim() || undefined,
        hasSnapshot: Boolean(snapshotDataUrl),
      });
      showToast(
        snapshotDataUrl
          ? "Flag saved — view the capture on Timeline"
          : "Flag saved — view details on Timeline",
        "success",
      );
      setNote("");
      onSubmitted?.();
      onClose();
    } catch {
      showToast("Could not save flag", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="max-w-[min(480px,96vw)] p-6"
      labelledBy={titleId}
      describedBy={descId}
      aboveCinema
    >
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-[var(--color-pending-muted)] text-[var(--color-pending)]">
        <Flag size={18} aria-hidden />
      </div>
      <h2 id={titleId} className="text-[17px] font-semibold text-[var(--color-text-primary)]">
        Flag this session
      </h2>
      <p id={descId} className="mt-1.5 text-[13px] text-[var(--color-text-muted)]">
        The frame below is stored securely when you submit. Download anytime from{" "}
        <span className="font-medium text-[var(--color-text-secondary)]">Activity Timeline</span>.
      </p>

      <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        {snapshotDataUrl ? (
          <img
            src={snapshotDataUrl}
            alt={`Screen capture for flagged session: ${memberName}`}
            className="mx-auto max-h-[min(40dvh,320px)] w-full bg-black/80 object-contain"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <ImageOff size={28} className="text-[var(--color-text-muted)]" aria-hidden />
            <p className="text-[12px] text-[var(--color-text-muted)]">
              Could not capture this frame (stream not ready or browser restriction). You can still
              submit the flag with a note.
            </p>
          </div>
        )}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        disabled={busy}
        className="mt-4 w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 py-2 text-[13px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-2 focus:ring-[var(--color-accent)]/10 placeholder:text-[var(--color-text-muted)] disabled:opacity-60"
        placeholder={`Optional note · Session: ${memberName}`}
        aria-label="Optional note"
      />
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-[var(--radius-md)] px-4 py-2 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:pointer-events-none disabled:opacity-50"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          onClick={() => void submit()}
          disabled={busy}
        >
          {busy ? "Saving…" : "Submit flag"}
        </button>
      </div>
    </Modal>
  );
}
