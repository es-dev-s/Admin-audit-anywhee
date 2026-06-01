import { NextRequest } from "next/server";
import { getAuthUser, err, ok } from "@/lib/server/authHelpers";
import { assertAuditSignalingClientAccess } from "@/lib/server/auditSignalingAccess";
import { browserTabSnapshotFromSignalingHttpEvent } from "@/lib/browserTabAnalyticsTypes";

function signalingHttpBase(): string | null {
  const b = process.env.SIGNALING_HTTP_BASE?.trim();
  if (b) return b.replace(/\/$/, "");
  return null;
}

/**
 * Latest stored browser-tab snapshot for a client (signaling Postgres), proxied like
 * `/api/audit/browser-extension-timeline`. Used when WebSocket `browser-tab-events-update`
 * is not applied in the browser even though the session is Live (e.g. missed messages).
 */
export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);

    const orgId = Number(req.nextUrl.searchParams.get("signalOrgId"));
    const clientId = Number(req.nextUrl.searchParams.get("signalClientId"));

    const access = await assertAuditSignalingClientAccess({
      userId: authUser.id,
      role: authUser.role,
      signalOrgId: orgId,
      signalClientId: clientId,
    });
    if (!access.ok) return err(access.message, access.status);

    const signalingToken = req.headers.get("x-signaling-session")?.trim();
    if (!signalingToken) {
      return err("Missing x-signaling-session (signaling admin token)", 401);
    }

    const base = signalingHttpBase();
    if (!base) {
      console.error("[browser-tab-snapshot] SIGNALING_HTTP_BASE is not set");
      return err("Server configuration error", 500);
    }

    const url = new URL(`${base}/api/browser-tab-events`);
    url.searchParams.set("clientId", String(clientId));
    url.searchParams.set("page", "1");
    url.searchParams.set("limit", "1");

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 25_000);
    let upstream: Response;
    try {
      upstream = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${signalingToken}`,
          Accept: "application/json",
        },
        signal: ac.signal,
      });
    } finally {
      clearTimeout(t);
    }

    const text = await upstream.text();
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      return err("Bad response from signaling server", 502);
    }

    if (!upstream.ok) {
      const msg =
        json && typeof json === "object" && json !== null && "message" in json
          ? String((json as { message?: unknown }).message)
          : upstream.statusText;
      return err(msg || "Signaling request failed", upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502);
    }

    const root = json && typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
    const events = root && Array.isArray(root.events) ? root.events : [];
    if (events.length === 0) {
      return ok({ snapshot: null, receivedAt: null });
    }

    const ev = events[0] as Record<string, unknown>;
    const receivedAtRaw =
      typeof ev.receivedAt === "number"
        ? ev.receivedAt
        : typeof ev.receivedAt === "string"
          ? Number(ev.receivedAt)
          : null;
    const receivedAtMs =
      receivedAtRaw != null && Number.isFinite(receivedAtRaw) ? receivedAtRaw : null;

    const snapshot = browserTabSnapshotFromSignalingHttpEvent(
      clientId,
      {
        browserName: ev.browserName,
        activeTabId: ev.activeTabId,
        tabs: ev.tabs,
        session: ev.session,
      },
      receivedAtMs,
    );

    return ok({
      snapshot,
      receivedAt: receivedAtMs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort")) return err("Signaling request timed out", 504);
    console.error("[browser-tab-snapshot]", e);
    return err("Internal server error", 500);
  }
}
