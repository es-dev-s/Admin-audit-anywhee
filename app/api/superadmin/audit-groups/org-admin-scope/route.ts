import { NextRequest } from "next/server";
import { ok, err } from "@/lib/server/authHelpers";
import { verifyAuditSuperadminSecret } from "@/lib/server/superAdminServiceAuth";
import { getOrgAdminAuditGroupScope } from "@/lib/server/auditGroupOrgAdminAccess";

/** GET ?signalingAdminId= — roster filter for org_admin / it_ops in admin app. */
export async function GET(req: NextRequest) {
  if (!verifyAuditSuperadminSecret(req)) return err("Unauthorized", 401);

  const id = Number(req.nextUrl.searchParams.get("signalingAdminId"));
  if (!Number.isFinite(id) || id <= 0) {
    return err("signalingAdminId is required", 400);
  }

  try {
    const scope = await getOrgAdminAuditGroupScope(id);
    return ok(scope);
  } catch (e) {
    console.error("[audit-groups/org-admin-scope/GET]", e);
    return err("Internal server error", 500);
  }
}
