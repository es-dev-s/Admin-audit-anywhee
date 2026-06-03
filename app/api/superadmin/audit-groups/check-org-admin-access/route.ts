import { NextRequest } from "next/server";
import { ok, err } from "@/lib/server/authHelpers";
import { verifyAuditSuperadminSecret } from "@/lib/server/superAdminServiceAuth";
import { orgAdminHasAuditGroupClientAccess } from "@/lib/server/auditGroupOrgAdminAccess";

export async function POST(req: NextRequest) {
  if (!verifyAuditSuperadminSecret(req)) return err("Unauthorized", 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return err("Invalid JSON", 400);
  }

  const signalingAdminId = Number(body.signalingAdminId);
  const signalClientId = Number(body.signalClientId);

  if (!Number.isFinite(signalingAdminId) || signalingAdminId <= 0) {
    return err("signalingAdminId is required", 400);
  }
  if (!Number.isFinite(signalClientId) || signalClientId <= 0) {
    return err("signalClientId is required", 400);
  }

  try {
    const allowed = await orgAdminHasAuditGroupClientAccess({
      signalingAdminId,
      signalClientId,
    });
    return ok({ allowed });
  } catch (e) {
    console.error("[audit-groups/check-org-admin-access/POST]", e);
    return err("Internal server error", 500);
  }
}
