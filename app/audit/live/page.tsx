"use client";

import { useAuditSignaling } from "@/context/audit-signaling-context";
import { useSignalingStreamAuth } from "@/hooks/useSignalingStreamAuth";
import { LiveScreenPanel } from "@/components/members/LiveScreenPanel";
import { AnimatedPage } from "@/components/ui/AnimatedPage";
import { useUIStore } from "@/store/uiStore";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Laptop, Play, Radio, X } from "lucide-react";
import type { AuditLiveClient } from "@/lib/auditTypes";

function LiveStreamCard({ client, orgName }: { client: AuditLiveClient; orgName: string | null }) {
  const streamAuth = useSignalingStreamAuth(client.orgId, client.id);
  const { streams, acquireStream, releaseStream } = useAuditSignaling();
  const [displayIdx, setDisplayIdx] = useState(0);
  const [shouldConnect, setShouldConnect] = useState(false);

  const stream = streams.get(client.id);

  useEffect(() => {
    if (!shouldConnect || streamAuth.status !== "authorized") return;
    acquireStream(client.id);
    return () => releaseStream(client.id);
  }, [client.id, streamAuth.status, acquireStream, releaseStream, shouldConnect]);

  const onDisplayChange = (sourceId: string, idx: number) => {
    setDisplayIdx(idx);
    releaseStream(client.id);
    queueMicrotask(() => acquireStream(client.id, { preferredSourceId: sourceId }));
  };

  return (
    <div className="relative flex min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)] transition-all duration-200 aspect-video group hover:border-[var(--color-border)] hover:shadow-[var(--shadow-md)]">
      
      {!shouldConnect ? (
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center p-6">
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-[var(--color-accent)] flex items-center justify-center border border-transparent font-bold text-[10px] text-[var(--color-text-inverse)]">
              {client.fullName.slice(0,2).toUpperCase()}
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[var(--color-text-primary)] leading-tight">{client.fullName}</p>
              <p className="text-[10px] text-[var(--color-text-muted)]">{orgName || `Team #${client.orgId}`}</p>
            </div>
          </div>

          <div
            className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full border border-[var(--color-success)]/20 bg-[var(--color-success-muted)] px-2 py-0.5 text-[var(--color-success)]"
            title="Verified audit broadcast"
          >
            <BadgeCheck
              size={12}
              className="shrink-0 opacity-90"
              strokeWidth={2.5}
              aria-hidden
            />
            <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--color-success)]" />
            <span className="text-[9px] font-bold uppercase tracking-wide">
              Broadcast Live
            </span>
          </div>

          <button 
            onClick={() => setShouldConnect(true)}
            className="flex items-center justify-center h-12 w-12 rounded-full bg-[var(--color-accent)] text-white shadow-lg hover:scale-105 active:scale-95 transition-all mt-4"
          >
            <Play size={20} className="ml-1" />
          </button>
          <p className="mt-4 text-[12px] font-medium text-[var(--color-text-secondary)]">Click to observe</p>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 bg-black">
          <button
             onClick={() => setShouldConnect(false)}
             className="absolute top-2.5 right-2.5 z-[50] grid h-7 w-7 place-items-center rounded-full bg-black/40 border border-white/10 text-white/60 hover:bg-black/80 hover:text-white transition-all backdrop-blur-md opacity-0 group-hover:opacity-100"
             title="Disconnect stream"
          >
            <X size={14} />
          </button>

          {streamAuth.status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white/50">
               Connecting...
            </div>
          )}
          {streamAuth.status === "denied" && (
            <div className="absolute inset-0 flex items-center justify-center flex-col gap-1 p-4 text-center">
               <span className="text-[12px] text-[var(--color-danger)] font-medium">Access Denied</span>
               <span className="text-[10px] text-white/40">{streamAuth.message}</span>
            </div>
          )}
          {streamAuth.status === "authorized" && (
            <LiveScreenPanel
              title={client.fullName}
              memberName={client.fullName}
              teamId={client.orgId}
              memberId={client.id}
              orgLabel={orgName}
              isStreaming={true}
              mediaStream={stream ?? null}
              compact={true}
              fillContainer={true}
              className="rounded-none border-0 h-full w-full"
              screenSources={client.screenSources ?? []}
              displayIndex={displayIdx}
              onDisplayChange={onDisplayChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function LiveFeedPage() {
  const { clients, orgs } = useAuditSignaling();
  
  const activeClients = useMemo(() => {
    return clients.filter(c => c.status === "sharing" || c.status === "online");
  }, [clients]);

  const activeTeams = useMemo(() => {
    return new Set(activeClients.map((c) => c.orgId)).size;
  }, [activeClients]);

  useEffect(() => {
    useUIStore.getState().setHeader("Live Feed", "Global overview of active transmissions");
    return () => useUIStore.getState().setHeader("", "");
  }, []);

  return (
    <AnimatedPage className="mx-auto flex w-full max-w-[1600px] flex-col overflow-x-clip py-2">
      <div className="mb-4 border-b border-[var(--color-border-subtle)] pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
          Monitoring
        </p>
        <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Live Feed
        </h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
          {activeClients.length} active members across {activeTeams} teams.
        </p>
      </div>
      <div className="mb-6 flex shrink-0 flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div />

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] shadow-sm">
            <Radio size={14} className="animate-pulse text-[var(--color-status-online)]" />
            <span>{activeClients.length} Broadcasting</span>
          </div>
        </div>
      </div>

      {activeClients.length === 0 ? (
        <div className="flex min-h-[min(420px,70dvh)] flex-col items-center justify-center rounded-[var(--radius-2xl)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] p-8 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <Laptop size={20} className="text-[var(--color-text-muted)]" />
          </div>
          <h3 className="text-[14px] font-medium text-[var(--color-text-primary)]">No Active Streams</h3>
          <p className="mt-1 max-w-[280px] text-[12px] text-[var(--color-text-muted)]">
            There are currently no members transmitting screen data.
          </p>
        </div>
      ) : (
        <div
          className="grid w-full grid-cols-1 gap-x-8 gap-y-10 pb-10 [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:repeat(2,minmax(0,1fr))] 2xl:[grid-template-columns:repeat(3,minmax(0,1fr))]"
        >
          {activeClients.map((client) => (
            <LiveStreamCard
              key={client.id}
              client={client}
              orgName={orgs.find((o) => o.id === client.orgId)?.name ?? null}
            />
          ))}
        </div>
      )}
    </AnimatedPage>
  );
}
