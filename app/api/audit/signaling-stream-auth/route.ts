import { NextRequest } from "next/server";
import { getAuthUser, ok, err } from "@/lib/server/authHelpers";
import { assertAuditSignalingClientAccess } from "@/lib/server/auditSignalingAccess";

/**
 * Authorize viewing a live stream for a signaling org + client.
 */
export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);

    const orgIdRaw = req.nextUrl.searchParams.get("signalOrgId");
    const clientIdRaw = req.nextUrl.searchParams.get("signalClientId");
    const orgId = Number(orgIdRaw);
    const clientId = Number(clientIdRaw);

    const access = await assertAuditSignalingClientAccess({
      userId: authUser.id,
      role: authUser.role,
      signalOrgId: orgId,
      signalClientId: clientId,
    });
    if (!access.ok) {
      return err(access.message, access.status);
    }

    return ok({ authorized: true });
  } catch (e) {
    console.error("[signaling-stream-auth] Unhandled:", e);
    return err("Internal server error", 500);
  }
}
