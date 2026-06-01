import { NextRequest } from "next/server";
import bcrypt from "bcrypt";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, ok, err } from "@/lib/server/authHelpers";

const EMAIL_DOMAIN = "@entegrasources.com.np";

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, audit_org_id, created_by, created_at")
      .eq("role", "audit_member")
      .order("name");

    if (error) {
      console.error("[audit-members/list]", error.message);
      return err("Internal server error", 500);
    }

    const rows = data ?? [];
    const orgIds = [
      ...new Set(
        rows
          .map((u) => u.audit_org_id as string | null)
          .filter((x): x is string => Boolean(x))
      ),
    ];
    const orgNameById = new Map<string, string>();
    if (orgIds.length > 0) {
      const { data: orgs, error: oErr } = await supabase
        .from("audit_organizations")
        .select("id, name")
        .in("id", orgIds);
      if (oErr) {
        console.error("[audit-members/list] orgs", oErr.message);
        return err("Internal server error", 500);
      }
      for (const o of orgs ?? []) {
        orgNameById.set(String(o.id), o.name as string);
      }
    }

    const members = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      auditOrgId: row.audit_org_id,
      auditOrgName: row.audit_org_id
        ? orgNameById.get(String(row.audit_org_id)) ?? null
        : null,
      createdByTeamLead: row.created_by === authUser.id,
      createdAt: row.created_at,
    }));

    return ok({ members });
  } catch (e) {
    console.error("[audit-members/list] Unhandled", e);
    return err("Internal server error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : password;
    const auditOrgId =
      typeof body.auditOrgId === "string" && body.auditOrgId.trim()
        ? body.auditOrgId.trim()
        : null;
    const signalingOrgIdRaw = body.signalingOrgId;
    let org_id: number | null = null;
    if (signalingOrgIdRaw != null && signalingOrgIdRaw !== "") {
      const n = Number(signalingOrgIdRaw);
      if (!Number.isFinite(n) || n <= 0) {
        return err("signalingOrgId must be a positive number", 400);
      }
      org_id = Math.floor(n);
    }

    if (!name || !email || !password) {
      return err("Name, email, and password are required", 400);
    }
    if (!email.endsWith(EMAIL_DOMAIN)) {
      return err(`Email must end with ${EMAIL_DOMAIN}`, 400);
    }
    if (password.length < 8) {
      return err("Password must be at least 8 characters", 400);
    }
    if (password !== confirmPassword) {
      return err("Passwords do not match", 400);
    }

    if (auditOrgId) {
      const { data: org, error: oErr } = await supabase
        .from("audit_organizations")
        .select("id")
        .eq("id", auditOrgId)
        .eq("created_by", authUser.id)
        .maybeSingle();
      if (oErr || !org) {
        return err("Invalid organization", 400);
      }
    }

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return err("An account with this email already exists", 409);
    }

    const password_hash = await bcrypt.hash(password, 12);

    const { data: newUser, error: insErr } = await supabase
      .from("users")
      .insert({
        name,
        email,
        password_hash,
        role: "audit_member",
        created_by: authUser.id,
        audit_org_id: auditOrgId,
        ...(org_id != null ? { org_id } : {}),
      })
      .select("id, name, email, role, audit_org_id, created_at")
      .single();

    if (insErr) {
      console.error("[audit-members/create]", insErr.message);
      return err("Internal server error", 500);
    }

    // No access_grants row — member has zero live access until team lead shares.

    return ok(
      {
        member: newUser,
        message:
          "Member created. They can sign in but have no live access until you share.",
      },
      201
    );
  } catch (e) {
    console.error("[audit-members/create] Unhandled", e);
    return err("Internal server error", 500);
  }
}
