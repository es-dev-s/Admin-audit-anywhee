export async function apiSignalingStreamAuth(
  signalOrgId: number,
  signalClientId: number
): Promise<{ authorized: boolean }> {
  const params = new URLSearchParams({
    signalOrgId: String(signalOrgId),
    signalClientId: String(signalClientId),
  });
  const res = await fetch(`/api/audit/signaling-stream-auth?${params}`, {
    credentials: "include",
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `HTTP ${res.status}`
    );
  }
  return body as { authorized: boolean };
}
