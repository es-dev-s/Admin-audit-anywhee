// lib/authClient.ts
// Thin typed wrapper around the auth REST API.
// All tokens are stored in HTTP-only cookies — this file never touches tokens.
// Cookies are sent automatically via credentials: "include".

type AuthUser = { id: string; name: string; email: string; role: string };

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include", // Always send cookies
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export async function apiRegister(payload: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<{ user: AuthUser }> {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiLogin(
  email: string,
  password: string
): Promise<{ user: AuthUser }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function apiLogout(): Promise<void> {
  await request("/auth/logout", {
    method: "POST",
  });
}

export async function apiGetMe(): Promise<{
  user: AuthUser;
  scope: Record<string, unknown> | null;
}> {
  return request("/auth/me");
}

export async function apiRefresh(): Promise<{ success: boolean }> {
  return request("/auth/refresh", {
    method: "POST",
  });
}

// ─── Invite endpoints ─────────────────────────────────────────────────────────

export async function apiValidateInvite(token: string) {
  return request<{ valid: boolean; scope: unknown; expiresAt: string }>(
    `/invites/${token}`
  );
}

export async function apiRedeemInvite(
  token: string,
  payload: { name: string; email: string; password: string }
): Promise<{ user: AuthUser }> {
  return request(`/invites/${token}/redeem`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type AccessShareRecipientMode =
  | "email"
  | "audit_member"
  | "audit_organization";

export async function apiAccessShare(payload: {
  recipientMode: AccessShareRecipientMode;
  shareScope: "team" | "member";
  signalingOrgId: number;
  organizationId?: string | null;
  signalClientId?: number | null;
  memberUserId?: string | null;
  email?: string;
  targetUserId?: string;
  auditOrganizationId?: string;
  liveTeamName?: string | null;
  liveMemberName?: string | null;
  targetAuditOrgName?: string | null;
}): Promise<{
  success: boolean;
  recipientCount?: number;
  message?: string;
  autoRevokesAt?: string;
}> {
  return request("/access-share", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiAccessRevoke(payload: {
  recipientMode: AccessShareRecipientMode;
  shareScope: "team" | "member";
  signalingOrgId: number;
  organizationId?: string | null;
  signalClientId?: number | null;
  memberUserId?: string | null;
  email?: string;
  targetUserId?: string;
  auditOrganizationId?: string;
  liveTeamName?: string | null;
  liveMemberName?: string | null;
  targetAuditOrgName?: string | null;
}): Promise<{
  success: boolean;
  recipientCount?: number;
  message?: string;
}> {
  return request("/access-share", {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

export async function apiAccessMatrix(
  opts?: { includeRevoked?: boolean }
): Promise<{
  rows: Array<{
    grantId: string;
    userId: string;
    memberName: string;
    memberEmail: string | null;
    auditOrgId: string | null;
    auditOrgName: string | null;
    teamIds: string[];
    memberIds: string[];
    signalingOrgIds: string[];
    signalClientIds: string[];
    sharedExpiresAt: string | null;
    revokedAt: string | null;
    createdAt: string | null;
  }>;
}> {
  const qs = new URLSearchParams();
  if (opts?.includeRevoked) qs.set("includeRevoked", "1");
  return request(`/access-share${qs.toString() ? `?${qs.toString()}` : ""}`);
}

export async function apiListAuditOrganizations(): Promise<{
  organizations: Array<{ id: string; name: string; created_at: string }>;
}> {
  return request("/audit-organizations");
}

export async function apiCreateAuditOrganization(name: string): Promise<{
  organization: { id: string; name: string; created_at: string };
}> {
  return request("/audit-organizations", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function apiListAuditMembers(): Promise<{
  members: Array<{
    id: string;
    name: string;
    email: string;
    auditOrgId: string | null;
    auditOrgName: string | null;
    createdByTeamLead: boolean;
    createdAt: string;
  }>;
}> {
  return request("/audit-members");
}

export async function apiCreateAuditMember(payload: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  auditOrgId?: string | null;
}): Promise<{ member: unknown; message: string }> {
  return request("/audit-members", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiPatchAuditMember(
  id: string,
  payload: { auditOrgId: string | null }
): Promise<{ member: unknown }> {
  return request(`/audit-members/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function apiRequestTeamLeadOrgAccess(
  signalingOrgId: number,
  opts?: { signalingOrgLabel?: string | null }
): Promise<{
  success: boolean;
  status: string;
  message?: string;
}> {
  return request("/team-lead-org-access", {
    method: "POST",
    body: JSON.stringify({
      signalingOrgId,
      signalingOrgLabel: opts?.signalingOrgLabel ?? undefined,
    }),
  });
}
