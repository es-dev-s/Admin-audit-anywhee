"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppWindow, Camera, Clock, FileText, Keyboard } from "lucide-react";
import { mockActivities } from "@/lib/mockData";

const icons = [AppWindow, Keyboard, FileText, Camera, Clock];

function iconFor(text: string) {
  return icons[text.length % icons.length] ?? AppWindow;
}

export function ActivityLog({ className = "" }: { className?: string }) {
  const [items, setItems] = useState<string[]>(mockActivities.slice(0, 4));

  useEffect(() => {
    let active = true;
    const run = () => {
      const timeout = 8000 + Math.round(Math.random() * 4000);
      setTimeout(() => {
        if (!active) return;
        const pick = mockActivities[Math.floor(Math.random() * mockActivities.length)];
        setItems((prev) => [pick, ...prev].slice(0, 10));
        run();
      }, timeout);
    };
    run();
    return () => { active = false; };
  }, []);

  return (
    <aside
      className={`flex h-full min-h-0 max-h-[min(28rem,46vh)] flex-col overflow-hidden bg-[var(--color-bg-surface)] lg:max-h-none ${className}`}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
        <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Activity</h3>
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--color-text-muted)]">
          <span className="live-dot-sm" />
          Live
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-0 overflow-y-auto overscroll-contain py-2 pr-1 scrollbar-hide">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--color-text-muted)]">
            <AppWindow size={24} className="opacity-30" aria-hidden />
            <p className="text-[12px]">No activity yet</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {items.map((it, idx) => {
              const Icon = iconFor(it);
              return (
                <motion.div
                  key={`${it}-${idx}`}
                  layout
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                  className="flex gap-3 px-4 py-2 transition-colors hover:bg-[var(--color-bg-hover)] rounded-[var(--radius-sm)]"
                >
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)]">
                    <Icon size={12} className="text-[var(--color-text-muted)]" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-[var(--color-text-primary)] truncate">{it}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">{idx + 1}m ago</p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </aside>
  );
}
