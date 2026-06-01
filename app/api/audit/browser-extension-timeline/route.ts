import { NextRequest } from "next/server";
import { getAuthUser, err, ok } from "@/lib/server/authHelpers";
import { assertAuditSignalingClientAccess } from "@/lib/server/auditSignalingAccess";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 14;

function signalingHttpBase(): string | null {
  const b = process.env.SIGNALING_HTTP_BASE?.trim();
  if (b) return b.replace(/\/$/, "");
  return null;
}

/**
 * Proxies to signaling `GET /api/browser-tab-events` with `sinceReceivedAt` for rolling history.
 * Requires `x-signaling-session: <token>` from the browser after WS `admin-login-response`.
 */
export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);

    const orgId = Number(req.nextUrl.searchParams.get("signalOrgId"));
    const clientId = Number(req.nextUrl.searchParams.get("signalClientId"));
    const daysRaw = req.nextUrl.searchParams.get("days");
    let days = DEFAULT_DAYS;
    if (daysRaw != null && daysRaw !== "") {
      const n = Number(daysRaw);
      if (Number.isFinite(n) && n > 0) days = Math.min(MAX_DAYS, Math.max(1, Math.floor(n)));
    }

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
      console.error("[browser-extension-timeline] SIGNALING_HTTP_BASE is not set");
      return err("Server configuration error", 500);
    }

    const sinceReceivedAt = Date.now() - days * 24 * 60 * 60 * 1000;
    const url = new URL(`${base}/api/browser-tab-events`);
    url.searchParams.set("clientId", String(clientId));
    url.searchParams.set("page", "1");
    url.searchParams.set("limit", "4000");
    url.searchParams.set("sinceReceivedAt", String(sinceReceivedAt));

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 55_000);
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

    return ok({
      days,
      sinceReceivedAt,
      ...(typeof json === "object" && json !== null ? json : { raw: json }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort")) return err("Signaling request timed out", 504);
    console.error("[browser-extension-timeline]", e);
    return err("Internal server error", 500);
  }
}
