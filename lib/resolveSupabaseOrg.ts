/** Match a signaling org to `GET /api/teams` row (same browser session). */
export async function resolveOrganizationIdFromTeams(
  signalOrgName: string | null | undefined,
  signalingOrgId: number
): Promise<string | null> {
  const res = await fetch("/api/teams", { credentials: "include" });
  const body = (await res.json().catch(() => ({}))) as {
    teams?: Array<{ id: string | number; name: string }>;
  };
  if (!res.ok || !Array.isArray(body.teams)) return null;
  const teams = body.teams;
  if (signalOrgName) {
    const byName = teams.find(
      (t) => t.name.trim().toLowerCase() === signalOrgName.trim().toLowerCase()
    );
    if (byName) return String(byName.id);
  }
  const byId = teams.find((t) => String(t.id) === String(signalingOrgId));
  return byId ? String(byId.id) : null;
}
