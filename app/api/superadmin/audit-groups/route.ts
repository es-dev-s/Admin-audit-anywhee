import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { ok, err } from "@/lib/server/authHelpers";
import { verifyAuditSuperadminSecret } from "@/lib/server/superAdminServiceAuth";

// ─── Types ────────────────────────────────────────────────────────────────────
type Group = {
  id: string;
  name: string;
  description: string | null;
  signaling_org_id: number | null;
  created_by_username: string;
  created_at: string;
  updated_at: string;
};

type GroupClient = {
  id: string;
  group_id: string;
  signal_client_id: number;
  signal_org_id: number;
  added_at: string;
};

type GroupMember = {
  id: string;
  group_id: string;
  team_lead_id: string;
  assigned_at: string;
  assigned_by_username: string;
};

// ─── GET /api/superadmin/audit-groups ────────────────────────────────────────
// Returns all groups with their clients and assigned team leads.
export async function GET(req: NextRequest) {
  if (!verifyAuditSuperadminSecret(req)) return err("Unauthorized", 401);

  try {
    const [groupsRes, clientsRes, membersRes, orgAdminsRes, usersRes] = await Promise.all([
      supabase
        .from("admin_audit_groups")
        .select("*")
        .order("name"),
      supabase
        .from("admin_audit_group_clients")
        .select("*")
        .order("added_at"),
      supabase
        .from("admin_audit_group_members")
        .select("*")
        .order("assigned_at"),
      supabase
        .from("admin_audit_group_org_admins")
        .select("*")
        .order("assigned_at"),
      supabase
        .from("users")
        .select("id, name, email")
        .eq("role", "team_lead"),
    ]);

    if (groupsRes.error) throw groupsRes.error;
    if (clientsRes.error) throw clientsRes.error;
    if (membersRes.error) throw membersRes.error;
    if (orgAdminsRes.error) {
      if (orgAdminsRes.error.code === "42P01") {
        return err("Run Supabase migration 20260604_admin_audit_group_org_admins.sql", 503);
      }
      throw orgAdminsRes.error;
    }
    if (usersRes.error) throw usersRes.error;

    const groups = (groupsRes.data ?? []) as Group[];
    const groupClients = (clientsRes.data ?? []) as GroupClient[];
    const groupMembers = (membersRes.data ?? []) as GroupMember[];
    const groupOrgAdmins = (orgAdminsRes.data ?? []) as Array<{
      group_id: string;
      signaling_admin_id: number;
      assigned_at: string;
      assigned_by_username: string;
    }>;
    const teamLeads = (usersRes.data ?? []) as { id: string; name: string; email: string }[];

    const teamLeadById = new Map(teamLeads.map((u) => [u.id, u]));

    const enriched = groups.map((g) => ({
      ...g,
      clients: groupClients
        .filter((c) => c.group_id === g.id)
        .map((c) => ({
          signal_client_id: c.signal_client_id,
          signal_org_id: c.signal_org_id,
          added_at: c.added_at,
        })),
      teamLeads: groupMembers
        .filter((m) => m.group_id === g.id)
        .map((m) => {
          const tl = teamLeadById.get(m.team_lead_id);
          return {
            team_lead_id: m.team_lead_id,
            name: tl?.name ?? null,
            email: tl?.email ?? null,
            assigned_at: m.assigned_at,
            assigned_by_username: m.assigned_by_username,
          };
        }),
      orgAdmins: groupOrgAdmins
        .filter((m) => m.group_id === g.id)
        .map((m) => ({
          signaling_admin_id: Number(m.signaling_admin_id),
          assigned_at: m.assigned_at,
          assigned_by_username: m.assigned_by_username,
        })),
    }));

    return ok({ groups: enriched, teamLeads });
  } catch (e) {
    console.error("[superadmin/audit-groups/GET]", e);
    return err("Internal server error", 500);
  }
}

// ─── POST /api/superadmin/audit-groups ───────────────────────────────────────
// Supports multiple actions via `action` field.
export async function POST(req: NextRequest) {
  if (!verifyAuditSuperadminSecret(req)) return err("Unauthorized", 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return err("Invalid JSON", 400);
  }

  const action = String(body.action ?? "").trim();

  // ─── create-group ─────────────────────────────────────────────────────────
  if (action === "create-group") {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const description =
      typeof body.description === "string" ? body.description.trim().slice(0, 500) : null;
    const signaling_org_id =
      typeof body.signalingOrgId === "number" && body.signalingOrgId > 0
        ? body.signalingOrgId
        : null;
    const created_by_username =
      typeof body.createdByUsername === "string" ? body.createdByUsername.trim() : "";

    if (!name) return err("name is required", 400);
    if (!created_by_username) return err("createdByUsername is required", 400);

    const { data, error } = await supabase
      .from("admin_audit_groups")
      .insert({ name, description, signaling_org_id, created_by_username })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") return err("A group with that name already exists", 409);
      console.error("[superadmin/audit-groups/create-group]", error);
      return err("Internal server error", 500);
    }
    return ok({ group: data });
  }

  // ─── update-group ─────────────────────────────────────────────────────────
  if (action === "update-group") {
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    if (!groupId) return err("groupId is required", 400);

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string") updates.name = body.name.trim().slice(0, 120);
    if (body.description !== undefined)
      updates.description =
        typeof body.description === "string" ? body.description.trim().slice(0, 500) : null;
    if (body.signalingOrgId !== undefined)
      updates.signaling_org_id =
        typeof body.signalingOrgId === "number" && body.signalingOrgId > 0
          ? body.signalingOrgId
          : null;

    const { data, error } = await supabase
      .from("admin_audit_groups")
      .update(updates)
      .eq("id", groupId)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") return err("A group with that name already exists", 409);
      console.error("[superadmin/audit-groups/update-group]", error);
      return err("Internal server error", 500);
    }
    if (!data) return err("Group not found", 404);
    return ok({ group: data });
  }

  // ─── delete-group ─────────────────────────────────────────────────────────
  if (action === "delete-group") {
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    if (!groupId) return err("groupId is required", 400);

    const { error } = await supabase
      .from("admin_audit_groups")
      .delete()
      .eq("id", groupId);

    if (error) {
      console.error("[superadmin/audit-groups/delete-group]", error);
      return err("Internal server error", 500);
    }
    return ok({ deleted: true });
  }

  // ─── add-client ───────────────────────────────────────────────────────────
  if (action === "add-client") {
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    const signalClientId = Number(body.signalClientId);
    const signalOrgId = Number(body.signalOrgId);
    if (!groupId) return err("groupId is required", 400);
    if (!Number.isFinite(signalClientId) || signalClientId <= 0)
      return err("signalClientId must be a positive integer", 400);
    if (!Number.isFinite(signalOrgId) || signalOrgId <= 0)
      return err("signalOrgId must be a positive integer", 400);

    const { error } = await supabase.from("admin_audit_group_clients").upsert(
      { group_id: groupId, signal_client_id: signalClientId, signal_org_id: signalOrgId },
      { onConflict: "group_id,signal_client_id" },
    );
    if (error) {
      console.error("[superadmin/audit-groups/add-client]", error);
      return err("Internal server error", 500);
    }
    return ok({ added: true });
  }

  // ─── add-clients (bulk) ───────────────────────────────────────────────────
  if (action === "add-clients") {
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    if (!groupId) return err("groupId is required", 400);

    const clients = Array.isArray(body.clients)
      ? (body.clients as Array<{ signalClientId: number; signalOrgId: number }>)
          .filter(
            (c) =>
              Number.isFinite(c?.signalClientId) &&
              c.signalClientId > 0 &&
              Number.isFinite(c?.signalOrgId) &&
              c.signalOrgId > 0,
          )
          .map((c) => ({
            group_id: groupId,
            signal_client_id: c.signalClientId,
            signal_org_id: c.signalOrgId,
          }))
      : [];

    if (clients.length === 0) return err("No valid clients provided", 400);

    const { error } = await supabase
      .from("admin_audit_group_clients")
      .upsert(clients, { onConflict: "group_id,signal_client_id" });

    if (error) {
      console.error("[superadmin/audit-groups/add-clients]", error);
      return err("Internal server error", 500);
    }
    return ok({ added: clients.length });
  }

  // ─── remove-client ────────────────────────────────────────────────────────
  if (action === "remove-client") {
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    const signalClientId = Number(body.signalClientId);
    if (!groupId) return err("groupId is required", 400);

    const { error } = await supabase
      .from("admin_audit_group_clients")
      .delete()
      .eq("group_id", groupId)
      .eq("signal_client_id", signalClientId);

    if (error) {
      console.error("[superadmin/audit-groups/remove-client]", error);
      return err("Internal server error", 500);
    }
    return ok({ removed: true });
  }

  // ─── assign-team-lead ─────────────────────────────────────────────────────
  if (action === "assign-team-lead") {
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    const teamLeadId = typeof body.teamLeadId === "string" ? body.teamLeadId.trim() : "";
    const assignedByUsername =
      typeof body.assignedByUsername === "string" ? body.assignedByUsername.trim() : "";

    if (!groupId) return err("groupId is required", 400);
    if (!teamLeadId) return err("teamLeadId is required", 400);
    if (!assignedByUsername) return err("assignedByUsername is required", 400);

    // Verify the user is a team_lead.
    const { data: user } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", teamLeadId)
      .maybeSingle();

    if (!user || user.role !== "team_lead")
      return err("User not found or not a team lead", 404);

    const { error } = await supabase.from("admin_audit_group_members").upsert(
      { group_id: groupId, team_lead_id: teamLeadId, assigned_by_username: assignedByUsername },
      { onConflict: "group_id,team_lead_id" },
    );
    if (error) {
      console.error("[superadmin/audit-groups/assign-team-lead]", error);
      return err("Internal server error", 500);
    }
    return ok({ assigned: true });
  }

  // ─── assign-org-admin (admin app org_admin / it_ops) ───────────────────────
  if (action === "assign-org-admin") {
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    const signalingAdminId = Number(body.signalingAdminId);
    const assignedByUsername =
      typeof body.assignedByUsername === "string" ? body.assignedByUsername.trim() : "";

    if (!groupId) return err("groupId is required", 400);
    if (!Number.isFinite(signalingAdminId) || signalingAdminId <= 0) {
      return err("signalingAdminId must be a positive integer", 400);
    }
    if (!assignedByUsername) return err("assignedByUsername is required", 400);

    const { error } = await supabase.from("admin_audit_group_org_admins").upsert(
      {
        group_id: groupId,
        signaling_admin_id: signalingAdminId,
        assigned_by_username: assignedByUsername,
      },
      { onConflict: "group_id,signaling_admin_id" },
    );
    if (error) {
      if (error.code === "42P01") {
        return err("Run Supabase migration 20260604_admin_audit_group_org_admins.sql", 503);
      }
      console.error("[superadmin/audit-groups/assign-org-admin]", error);
      return err(error.message || "Internal server error", 500);
    }
    return ok({ assigned: true });
  }

  // ─── remove-org-admin ─────────────────────────────────────────────────────
  if (action === "remove-org-admin") {
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    const signalingAdminId = Number(body.signalingAdminId);
    if (!groupId) return err("groupId is required", 400);
    if (!Number.isFinite(signalingAdminId) || signalingAdminId <= 0) {
      return err("signalingAdminId must be a positive integer", 400);
    }

    const { error } = await supabase
      .from("admin_audit_group_org_admins")
      .delete()
      .eq("group_id", groupId)
      .eq("signaling_admin_id", signalingAdminId);

    if (error) {
      console.error("[superadmin/audit-groups/remove-org-admin]", error);
      return err("Internal server error", 500);
    }
    return ok({ removed: true });
  }

  // ─── remove-team-lead ─────────────────────────────────────────────────────
  if (action === "remove-team-lead") {
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    const teamLeadId = typeof body.teamLeadId === "string" ? body.teamLeadId.trim() : "";
    if (!groupId) return err("groupId is required", 400);
    if (!teamLeadId) return err("teamLeadId is required", 400);

    const { error } = await supabase
      .from("admin_audit_group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("team_lead_id", teamLeadId);

    if (error) {
      console.error("[superadmin/audit-groups/remove-team-lead]", error);
      return err("Internal server error", 500);
    }
    return ok({ removed: true });
  }

  return err(`Unknown action: ${action}`, 400);
}
