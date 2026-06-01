/**
 * Smoke-test cPanel UAPI (same call as registration email check).
 *
 * Run from audit-dashboard root (loads .env via Node --env-file):
 *   node --env-file=.env scripts/test-cpanel.mjs
 *
 * Does not print secrets. On success prints HTTP status and mailbox count.
 */

function ensureUrlScheme(hostOrUrl) {
  const t = hostOrUrl.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function buildCpanelUapiUrl(baseUrl, moduleName, functionName) {
  const trimmed = ensureUrlScheme(baseUrl).replace(/\/+$/, "");
  if (/:\d+$/.test(trimmed)) {
    return `${trimmed}/execute/${moduleName}/${functionName}`;
  }
  return `${trimmed}:2083/execute/${moduleName}/${functionName}`;
}

async function main() {
  const baseUrl = process.env.CPANEL_BASE_URL;
  const apiToken = process.env.CPANEL_API_TOKEN;
  const username = process.env.CPANEL_USERNAME;

  if (!baseUrl || !apiToken || !username) {
    console.error(
      "Missing env: need CPANEL_BASE_URL, CPANEL_API_TOKEN, CPANEL_USERNAME"
    );
    console.error("Add them to .env, then run:");
    console.error("  node --env-file=.env scripts/test-cpanel.mjs");
    process.exit(1);
  }

  const url = buildCpanelUapiUrl(baseUrl, "Email", "list_pops");
  const authHeader = `cpanel ${username}:${apiToken}`;

  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });
  } catch (e) {
    const cause = e?.cause;
    console.error("cPanel request failed (network/TLS/DNS).");
    console.error("  Message:", e?.message ?? e);
    if (cause) {
      console.error("  Cause:", cause.message ?? cause);
      if (cause.code) console.error("  Code:", cause.code);
    }
    console.error(
      "  URL (no secrets):",
      url.replace(/^(https?:\/\/[^/?#]+).*/, "$1/…")
    );
    process.exit(2);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("cPanel response was not JSON. HTTP", res.status);
    console.error("First 200 chars:", text.slice(0, 200));
    process.exit(3);
  }

  if (!res.ok) {
    console.error("cPanel HTTP", res.status);
    console.error(
      "Body:",
      typeof data?.errors === "string"
        ? data.errors
        : JSON.stringify(data).slice(0, 500)
    );
    process.exit(4);
  }

  if (
    typeof data?.message === "string" &&
    /imunify360|bot-protection/i.test(data.message)
  ) {
    console.error(
      "cPanel blocked by Imunify360 — whitelist your IP on the host or set CPANEL_SKIP_VERIFY=1 (dev only)"
    );
    console.error(" ", data.message);
    process.exit(6);
  }

  if (!data?.data || !Array.isArray(data.data)) {
    console.error("Unexpected cPanel response shape (expected data.data array)");
    console.error("Keys:", data && typeof data === "object" ? Object.keys(data) : []);
    process.exit(5);
  }

  console.log("cPanel UAPI OK");
  console.log("  HTTP:", res.status);
  console.log("  Mailboxes listed:", data.data.length);
  process.exit(0);
}

main();
