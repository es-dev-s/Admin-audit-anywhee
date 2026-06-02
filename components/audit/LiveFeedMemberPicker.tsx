"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  classifyClientRosterStatus,
  isClientStreamable,
} from "@/lib/auditClientStatus";
import { memberOrgPlainTextFromClient } from "@/lib/memberOrgDisplay";
import { MAX_CONCURRENT_ACTIVE_STREAMS } from "@/lib/auditStreamLimits";
import type { AuditLiveClient } from "@/lib/auditTypes";
import { cn } from "@/lib/utils";

type LiveFeedMemberPickerProps = {
  clients: AuditLiveClient[];
  usedClientIds: Set<number>;
  activeStreamCount: number;
  sideBySide: boolean;
  currentClientId?: number | null;
  placeholder: string;
  onSelect: (clientId: number) => void;
  variant?: "slot" | "toolbar";
  className?: string;
};

export function LiveFeedMemberPicker({
  clients,
  usedClientIds,
  activeStreamCount,
  sideBySide,
  currentClientId,
  placeholder,
  onSelect,
  variant = "slot",
  className,
}: LiveFeedMemberPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const atLimit = activeStreamCount >= MAX_CONCURRENT_ACTIVE_STREAMS;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = currentClientId != null ? clients.find((c) => c.id === currentClientId) : null;

  return (
    <div ref={rootRef} className={cn("lf-picker", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "lf-picker__trigger",
          variant === "toolbar" ? "lf-picker__trigger--toolbar" : "lf-picker__trigger--slot",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="lf-picker__trigger-label">
          {selected ? memberOrgPlainTextFromClient(selected) : placeholder}
        </span>
        <ChevronDown size={14} className="lf-picker__chevron" aria-hidden />
      </button>

      {open ? (
        <div className="lf-picker__panel" role="listbox">
          <ul className="lf-picker__list">
            {clients.length === 0 ? (
              <li className="lf-picker__empty">No members available</li>
            ) : (
              clients.map((c) => {
                const taken = !sideBySide && usedClientIds.has(c.id) && c.id !== currentClientId;
                const blocked = !taken && isClientStreamable(c.status) && atLimit && c.id !== currentClientId;
                const rosterKind = classifyClientRosterStatus(c.status);
                const streamable = isClientStreamable(c.status);
                const disabled = taken || blocked;

                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      role="option"
                      aria-selected={c.id === currentClientId}
                      className={cn(
                        "lf-picker__item",
                        disabled && "lf-picker__item--disabled",
                        c.id === currentClientId && "lf-picker__item--active",
                      )}
                      onClick={() => {
                        if (disabled) return;
                        onSelect(c.id);
                        setOpen(false);
                      }}
                    >
                      <span
                        className={cn(
                          "lf-picker__status",
                          rosterKind === "online" && "lf-picker__status--online",
                          rosterKind === "offline" && "lf-picker__status--offline",
                          rosterKind === "unknown" && "lf-picker__status--unknown",
                        )}
                      />
                      <span className="lf-picker__item-text">
                        <span className="lf-picker__item-name">{c.fullName}</span>
                        <span className="lf-picker__item-org">
                          {memberOrgPlainTextFromClient(c)}
                        </span>
                      </span>
                      {taken ? (
                        <span className="lf-picker__tag">Assigned</span>
                      ) : blocked ? (
                        <span className="lf-picker__tag">Limit</span>
                      ) : streamable ? (
                        <span className="lf-picker__tag lf-picker__tag--online">Online</span>
                      ) : rosterKind === "unknown" ? (
                        <span className="lf-picker__tag lf-picker__tag--unknown">Unknown</span>
                      ) : (
                        <span className="lf-picker__tag lf-picker__tag--offline">Offline</span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
