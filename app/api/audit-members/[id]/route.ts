import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, ok, err } from "@/lib/server/authHelpers";
import { insertAuditTimelineEvent } from "@/lib/server/auditTimelineLog";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const { id: memberId } = await params;
    const body = await req.json().catch(() => ({}));
    const hasAudit = Object.prototype.hasOwnProperty.call(body, "auditOrgId");
    const hasSig = Object.prototype.hasOwnProperty.call(body, "signalingOrgId");

    if (!hasAudit && !hasSig) {
      return err("Provide auditOrgId and/or signalingOrgId", 400);
    }

    const { data: member, error: mErr } = await supabase
      .from("users")
      .select("id, role, audit_org_id, name, email")
      .eq("id", memberId)
      .maybeSingle();

    if (mErr || !member) return err("Member not found", 404);
    if (member.role !== "audit_member") return err("Not an audit member", 400);

    const previousAuditOrgId = (member.audit_org_id as string | null) ?? null;

    let audit_org_id: string | null | undefined = undefined;
    if (hasAudit) {
      const auditOrgIdRaw = body.auditOrgId;
      if (auditOrgIdRaw === null || auditOrgIdRaw === "") {
        audit_org_id = null;
      } else if (typeof auditOrgIdRaw === "string" && auditOrgIdRaw.trim()) {
        const oid = auditOrgIdRaw.trim();
        const { data: org, error: oErr } = await supabase
          .from("audit_organizations")
          .select("id")
          .eq("id", oid)
          .eq("created_by", authUser.id)
          .maybeSingle();
        if (oErr || !org) return err("Invalid organization", 400);
        audit_org_id = oid;
      } else {
        return err("auditOrgId must be a string UUID or null", 400);
      }
    }

    let org_id: number | null | undefined = undefined;
    if (hasSig) {
      const raw = body.signalingOrgId;
      if (raw === null || raw === "") {
        org_id = null;
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          return err("signalingOrgId must be a positive number or null", 400);
        }
        org_id = Math.floor(n);
      }
    }

    const updateRow: { audit_org_id?: string | null; org_id?: number | null } = {};
    if (audit_org_id !== undefined) updateRow.audit_org_id = audit_org_id;
    if (org_id !== undefined) updateRow.org_id = org_id;

    const { data: updated, error: uErr } = await supabase
      .from("users")
      .update(updateRow)
      .eq("id", memberId)
      .select("id, name, email, audit_org_id")
      .single();

    if (uErr) {
      console.error("[audit-members/patch]", uErr.message);
      return err("Internal server error", 500);
    }

    if (!hasAudit) {
      return ok({ member: updated });
    }

    let previousOrgName: string | null = null;
    let newOrgName: string | null = null;
    if (previousAuditOrgId) {
      const { data: po } = await supabase
        .from("audit_organizations")
        .select("name")
        .eq("id", previousAuditOrgId)
        .maybeSingle();
      previousOrgName = (po?.name as string) ?? null;
    }
    if (audit_org_id) {
      const { data: no } = await supabase
        .from("audit_organizations")
        .select("name")
        .eq("id", audit_org_id)
        .maybeSingle();
      newOrgName = (no?.name as string) ?? null;
    }

    const mName = updated.name as string;
    const mEmail = updated.email as string;
    if (audit_org_id) {
      void insertAuditTimelineEvent(supabase, {
        team_lead_id: authUser.id,
        event_type: "member_audit_org_updated",
        summary: `Assigned “${mName}” to directory org “${newOrgName ?? audit_org_id}”`,
        detail: previousOrgName
          ? `Previously in “${previousOrgName}”.`
          : previousAuditOrgId
            ? "Previously assigned to another organization."
            : "No prior directory organization.",
        actor_user_id: authUser.id,
        recipient_user_id: memberId,
        recipient_name: mName,
        recipient_email: mEmail,
        audit_org_id,
        audit_org_name: newOrgName,
        metadata: {
          previous_audit_org_id: previousAuditOrgId,
          previous_audit_org_name: previousOrgName,
        },
      });
    } else {
      void insertAuditTimelineEvent(supabase, {
        team_lead_id: authUser.id,
        event_type: "member_audit_org_updated",
        summary: previousOrgName
          ? `Removed “${mName}” from directory org “${previousOrgName}”`
          : `Cleared directory organization for “${mName}”`,
        detail: `Audit member: ${mEmail}`,
        actor_user_id: authUser.id,
        recipient_user_id: memberId,
        recipient_name: mName,
        recipient_email: mEmail,
        metadata: {
          previous_audit_org_id: previousAuditOrgId,
          previous_audit_org_name: previousOrgName,
        },
      });
    }

    return ok({ member: updated });
  } catch (e) {
    console.error("[audit-members/patch] Unhandled", e);
    return err("Internal server error", 500);
  }
}
