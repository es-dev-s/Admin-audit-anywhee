"use client";

import { Monitor } from "lucide-react";
import { CustomSelect } from "@/components/ui/Select";
import type { AuditLiveClient } from "@/lib/auditTypes";

export function MultiDisplaySelector({
  sources,
  valueIndex,
  onChange,
}: {
  sources: AuditLiveClient["screenSources"];
  valueIndex: number;
  onChange: (sourceId: string, index: number) => void;
}) {
  if (sources.length <= 1) return null;

  const current = sources[Math.min(valueIndex, sources.length - 1)] ?? sources[0];
  const options = sources.map((s, i) => ({
    value: s.id,
    label: s.name || `Display ${i + 1}`,
  }));

  return (
    <div className="flex max-w-[min(200px,85vw)] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] py-0.5 pl-2 pr-0.5 backdrop-blur-sm transition-colors hover:bg-white/[0.08]">
      <Monitor size={13} className="shrink-0 text-white/60" aria-hidden />
      <CustomSelect
        variant="dark"
        size="xs"
        aria-label={`Select display (${sources.length} available)`}
        value={current?.id ?? ""}
        onValueChange={(id) => {
          const idx = sources.findIndex((s) => s.id === id);
          if (id && idx >= 0) onChange(id, idx);
        }}
        options={options}
        placeholder="Display"
        className="min-w-0 flex-1"
        triggerClassName="rounded-md border-0 bg-transparent px-1.5 hover:bg-white/[0.06]"
      />
    </div>
  );
}
