"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LayoutGrid, Search, User } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuditLiveClient, AuditOrg } from "@/lib/auditTypes";

export type SearchResult = {
  id: string;
  href: string;
  label: string;
  sub: string;
  kind: "team" | "member";
};

function buildResults(orgs: AuditOrg[], clients: AuditLiveClient[], query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SearchResult[] = [];
  for (const o of orgs) {
    if (o.name.toLowerCase().includes(q) || String(o.id).includes(q)) {
      out.push({ id: `org-${o.id}`, href: `/audit/${o.id}`, label: o.name, sub: `Team · ID ${o.id}`, kind: "team" });
    }
  }
  for (const c of clients) {
    if (c.fullName.toLowerCase().includes(q) || String(c.id).includes(q)) {
      out.push({ id: `client-${c.id}`, href: `/audit/${c.orgId}/${c.id}`, label: c.fullName, sub: `Member · ${c.status}`, kind: "member" });
    }
  }
  return out.slice(0, 24);
}

export function CommandSearch({
  open, onClose, orgs, clients,
}: {
  open: boolean;
  onClose: () => void;
  orgs: AuditOrg[];
  clients: AuditLiveClient[];
}) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => buildResults(orgs, clients, query), [orgs, clients, query]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => { cancelAnimationFrame(t); document.body.style.overflow = prev; };
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((i) => Math.min(i + 1, Math.max(0, results.length - 1))); }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && results[highlight]) { e.preventDefault(); window.location.href = results[highlight].href; onClose(); }
    },
    [highlight, onClose, results],
  );

  const IconFor = ({ kind }: { kind: SearchResult["kind"] }) => {
    if (kind === "team") return <LayoutGrid size={16} className="text-[var(--color-text-muted)]" />;
    return <User size={16} className="text-[var(--color-text-muted)]" />;
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="presentation"
          className="fixed inset-0 z-[var(--z-modal)] flex justify-center bg-[var(--color-scrim)] pt-[15vh] backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.2 }}
          onClick={onClose}
          onKeyDown={onKeyDown}
        >
          <motion.div
            role="dialog"
            aria-label="Command search"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="mx-4 h-fit w-full max-w-[560px] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-panel)] ring-1 ring-[var(--color-border-subtle)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-12 items-center gap-3 border-b border-[var(--color-border)] px-4">
              <Search size={16} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
                placeholder="Search teams and members…"
                className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
                aria-autocomplete="list"
                aria-controls="command-search-results"
              />
              <kbd className="hidden shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)] sm:inline">
                Esc
              </kbd>
            </div>
            <ul id="command-search-results" className="max-h-[360px] overflow-y-auto py-1.5" role="listbox">
              {results.length === 0 ? (
                <li className="px-5 py-10 text-center text-[12px] text-[var(--color-text-muted)]">
                  {query.trim() ? "No results" : "Type to search teams and members"}
                </li>
              ) : (
                results.map((r, i) => (
                  <li key={r.id} role="option" aria-selected={i === highlight}>
                    <Link
                      href={r.href}
                      onClick={onClose}
                      className={`mx-1.5 flex h-9 items-center gap-3 rounded-[var(--radius-md)] px-3 text-left text-[13px] transition-colors duration-150 ${
                        i === highlight ? "bg-[var(--color-bg-active)]" : "hover:bg-[var(--color-bg-hover)]"
                      }`}
                      onMouseEnter={() => setHighlight(i)}
                    >
                      <IconFor kind={r.kind} />
                      <span className="min-w-0 flex-1 truncate font-medium text-[var(--color-text-primary)]">{r.label}</span>
                      <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">{r.sub}</span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
