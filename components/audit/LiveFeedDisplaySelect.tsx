"use client";

import type { AuditLiveClient } from "@/lib/auditTypes";

/** Native display picker — no portal/motion (stable live-feed HUD height). */
export function LiveFeedDisplaySelect({
  sources,
  valueIndex,
  onChange,
}: {
  sources: AuditLiveClient["screenSources"];
  valueIndex: number;
  onChange: (sourceId: string, index: number) => void;
}) {
  const current = sources[Math.min(valueIndex, sources.length - 1)] ?? sources[0];

  if (sources.length <= 1) {
    return <div className="lf-hud-display-spacer" aria-hidden />;
  }

  return (
    <select
      className="lf-hud-display-select"
      aria-label="Select display"
      value={current?.id ?? ""}
      onChange={(e) => {
        const id = e.target.value;
        const idx = sources.findIndex((s) => s.id === id);
        if (id && idx >= 0) onChange(id, idx);
      }}
    >
      {sources.map((s, i) => (
        <option key={s.id} value={s.id}>
          {s.name || `Display ${i + 1}`}
        </option>
      ))}
    </select>
  );
}
