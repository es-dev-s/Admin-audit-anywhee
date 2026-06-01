import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import type { AuditCaptureRow } from "@/lib/auditCaptureTypes";
import { err, getAuthUser, ok } from "@/lib/server/authHelpers";
import { parseOptionalDateRange } from "@/lib/server/parseDateRangeQuery";
import { isR2Configured, putCaptureObject } from "@/lib/server/r2";

const MAX_BYTES = 12 * 1024 * 1024;

const CAPTURE_LIST_LIMIT = 500;

/** List captures for the authenticated user (newest first). Optional `from` / `to` ISO query params filter `created_at`. */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return err("Unauthorized", 401);

  const parsed = parseOptionalDateRange(req.nextUrl.searchParams);
  if (!parsed.ok) return err(parsed.error, 400);

  let q = supabase
    .from("audit_captures")
    .select(
      "id, capture_type, object_key, note, team_id, member_id, member_name, created_at",
    )
    .eq("user_id", user.id);

  if (parsed.from) {
    q = q.gte("created_at", parsed.from);
  }
  if (parsed.to) {
    q = q.lte("created_at", parsed.to);
  }

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(CAPTURE_LIST_LIMIT);

  if (error) {
    console.error("[audit-captures] list:", error.message);
    return err("Failed to load captures", 500);
  }

  return ok({ captures: (data ?? []) as AuditCaptureRow[] });
}

/**
 * Upload a PNG capture (multipart): file, captureType (screenshot|flag),
 * optional note, teamId, memberId, memberName.
 */
export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return err("Unauthorized", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err("Invalid form data", 400);
  }

  const captureType = String(form.get("captureType") ?? "");
  if (captureType !== "screenshot" && captureType !== "flag") {
    return err("Invalid captureType", 400);
  }

  const file = form.get("file");
  const hasFile = file instanceof Blob && file.size > 0;

  if (captureType === "screenshot" && !hasFile) {
    return err("Missing file", 400);
  }

  if (hasFile && !isR2Configured()) {
    return err("Image storage is not configured (R2 env vars missing)", 503);
  }

  if (hasFile && file instanceof Blob) {
    if (file.size > MAX_BYTES) {
      return err("File too large (max 12MB)", 413);
    }
  }

  let objectKey: string | null = null;
  if (hasFile && file instanceof Blob) {
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length < 32) {
      return err("Invalid image", 400);
    }
    objectKey = `${user.id}/${Date.now()}-${randomUUID()}.png`;
    try {
      await putCaptureObject(objectKey, buf, "image/png");
    } catch (e) {
      console.error("[audit-captures] R2 put:", e);
      return err("Failed to store image", 502);
    }
  }

  const noteRaw = form.get("note");
  const note =
    typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim().slice(0, 4000) : null;

  const teamIdStr = form.get("teamId");
  const memberIdStr = form.get("memberId");
  const memberNameRaw = form.get("memberName");

  const team_id =
    typeof teamIdStr === "string" && teamIdStr.trim() !== ""
      ? Number.parseInt(teamIdStr, 10)
      : null;
  const member_id =
    typeof memberIdStr === "string" && memberIdStr.trim() !== ""
      ? Number.parseInt(memberIdStr, 10)
      : null;
  const member_name =
    typeof memberNameRaw === "string" && memberNameRaw.trim()
      ? memberNameRaw.trim().slice(0, 200)
      : null;

  const { data: row, error: insErr } = await supabase
    .from("audit_captures")
    .insert({
      user_id: user.id,
      capture_type: captureType,
      object_key: objectKey ?? null,
      note,
      team_id: Number.isFinite(team_id as number) ? team_id : null,
      member_id: Number.isFinite(member_id as number) ? member_id : null,
      member_name,
    })
    .select(
      "id, capture_type, object_key, note, team_id, member_id, member_name, created_at",
    )
    .single();

  if (insErr || !row) {
    console.error("[audit-captures] insert:", insErr?.message);
    return err("Failed to save record", 500);
  }

  return ok({ capture: row as AuditCaptureRow }, 201);
}
