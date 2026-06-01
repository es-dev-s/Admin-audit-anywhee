import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthUser } from "@/lib/server/authHelpers";
import { getCaptureObject, isR2Configured } from "@/lib/server/r2";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const user = getAuthUser(req);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const { data: row, error } = await supabase
    .from("audit_captures")
    .select("id, user_id, object_key")
    .eq("id", id)
    .single();

  if (error || !row || String(row.user_id) !== user.id) {
    return new Response("Not found", { status: 404 });
  }

  if (!row.object_key) {
    return new Response("No image for this entry", { status: 404 });
  }

  if (!isR2Configured()) {
    return new Response("Storage unavailable", { status: 503 });
  }

  let bytes: Uint8Array;
  try {
    bytes = await getCaptureObject(row.object_key as string);
  } catch (e) {
    console.error("[audit-captures/image] R2 get:", e);
    return new Response("Failed to load image", { status: 502 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const filename = `audit-capture-${id.slice(0, 8)}.png`;

  const headers: HeadersInit = {
    "Content-Type": "image/png",
    "Cache-Control": "private, max-age=300",
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  return new Response(Buffer.from(bytes), { status: 200, headers });
}
