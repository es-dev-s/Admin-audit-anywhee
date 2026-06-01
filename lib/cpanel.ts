// lib/cpanel.ts
// Verify that an email account exists on the cPanel server.
// Returns: { exists: true } or { exists: false }
// Throws on cPanel API failure — caller must handle the 502.
//
// Uses cPanel UAPI `Email/list_pops` to list all email accounts,
// then checks if the submitted email is among them.
// This is the identity gate: only users with a real cPanel mailbox
// on the company server can register.

function ensureUrlScheme(hostOrUrl: string): string {
  const t = hostOrUrl.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** Build UAPI URL whether CPANEL_BASE_URL includes scheme and/or :2083 or not. */
export function buildCpanelUapiUrl(
  baseUrl: string,
  moduleName: string,
  functionName: string
): string {
  const trimmed = ensureUrlScheme(baseUrl).replace(/\/+$/, "");
  if (/:\d+$/.test(trimmed)) {
    return `${trimmed}/execute/${moduleName}/${functionName}`;
  }
  return `${trimmed}:2083/execute/${moduleName}/${functionName}`;
}

function cpanelSkipVerifyEnabled(): boolean {
  const flag = process.env.CPANEL_SKIP_VERIFY?.trim().toLowerCase();
  return (
    (flag === "1" || flag === "true") &&
    process.env.NODE_ENV !== "production"
  );
}

export async function verifyEmailInCpanel(
  email: string
): Promise<{ exists: boolean }> {
  if (cpanelSkipVerifyEnabled()) {
    console.warn(
      "[cpanel] CPANEL_SKIP_VERIFY=1 — skipping mailbox check (development only)"
    );
    return { exists: true };
  }

  const baseUrl = process.env.CPANEL_BASE_URL;
  const apiToken = process.env.CPANEL_API_TOKEN;
  const username = process.env.CPANEL_USERNAME;

  if (!baseUrl || !apiToken || !username) {
    throw new Error("cPanel environment variables are not configured");
  }

  const url = buildCpanelUapiUrl(baseUrl, "Email", "list_pops");
  const token = `cpanel ${username}:${apiToken}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: token,
        Accept: "application/json",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`cPanel network error: ${msg}`);
  }

  const text = await res.text();
  let data: { data?: unknown; message?: string; errors?: unknown };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error(
      `cPanel HTTP ${res.status}: non-JSON response (often missing Accept: application/json or WAF block)`
    );
  }

  if (
    typeof data?.message === "string" &&
    /imunify360|bot-protection/i.test(data.message)
  ) {
    throw new Error(
      `cPanel blocked by Imunify360 — whitelist this machine's public IP in the hosting panel (or set CPANEL_SKIP_VERIFY=1 for local dev only)`
    );
  }

  if (!res.ok) {
    throw new Error(
      `cPanel HTTP ${res.status}: ${typeof data?.errors === "string" ? data.errors : JSON.stringify(data).slice(0, 200)}`
    );
  }

  if (!data?.data || !Array.isArray(data.data)) {
    throw new Error(
      `Unexpected cPanel response shape: ${JSON.stringify(data).slice(0, 200)}`
    );
  }

  // data.data is an array of email account objects from cPanel UAPI
  const exists = data.data.some(
    (account: { email?: string }) =>
      account.email?.toLowerCase() === email.toLowerCase()
  );

  return { exists };
}
