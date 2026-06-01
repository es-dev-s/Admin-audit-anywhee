import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser, ok, err } from "@/lib/server/authHelpers";

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUser(req);
    if (!authUser) return err("Unauthorized", 401);
    if (authUser.role !== "team_lead") return err("Forbidden", 403);

    const { data, error } = await supabase
      .from("audit_organizations")
      .select("id, name, created_at")
      .eq("created_by", authUser.id)
      .order("name");

    if (error) {
      console.error("[audit-organizations/list]", error.message);
      return err("Internal server error", 500);
    }

    return ok({ organizations: data ?? [] });
  } catch (e) {
    console.error("[audit-organizations/list] Unhandled", e);
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
    if (!name || name.length < 2) {
      return err("Organization name is required (min 2 characters)", 400);
    }

    const { data, error } = await supabase
      .from("audit_organizations")
      .insert({ name, created_by: authUser.id })
      .select("id, name, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return err("You already have an organization with this name", 409);
      }
      console.error("[audit-organizations/create]", error.message);
      return err("Internal server error", 500);
    }

    return ok({ organization: data }, 201);
  } catch (e) {
    console.error("[audit-organizations/create] Unhandled", e);
    return err("Internal server error", 500);
  }
}
