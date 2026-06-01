/**
 * Enterprise office network allowlist (Edge-safe, no Node APIs).
 * Used by middleware when ENTERPRISE_IP_ALLOWLIST_ENABLED=1.
 */

const IPV4_RANGES: ReadonlyArray<readonly [string, string]> = [
  ["10.60.60.2", "10.60.60.254"],
  ["10.110.110.20", "10.110.110.254"],
  ["10.85.85.2", "10.85.85.250"],
  ["10.65.65.100", "10.65.65.200"],
  ["10.20.20.10", "10.20.20.250"],
  ["10.25.25.100", "10.25.25.253"],
  ["10.30.30.10", "10.30.30.250"],
  ["10.35.35.100", "10.35.35.249"],
  ["10.40.40.35", "10.40.40.252"],
  ["10.50.50.2", "10.50.50.250"],
];

const IPV6_RANGES: ReadonlyArray<readonly [string, string]> = [
  ["2403:3800:3197:200::2", "2403:3800:3197:200::ff:ffff"],
  ["2403:3800:3197:201::2", "2403:3800:3197:201::ffff"],
  ["2403:3800:3197:206::2", "2403:3800:3197:206::ffff"],
  ["2403:3800:3197:205::2", "2403:3800:3197:205::ffff"],
  ["2403:3800:3197:203::2", "2403:3800:3197:203::ffff"],
  ["2403:3800:3197:207::2", "2403:3800:3197:207::ffff"],
];

function ipv4ToUint32(ip: string): number {
  const parts = ip.split(".").map((x) => Number(x.trim()));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    throw new Error("invalid ipv4");
  }
  return (
    (((parts[0] << 24) >>> 0) +
      ((parts[1] << 16) >>> 0) +
      ((parts[2] << 8) >>> 0) +
      parts[3]) >>>
    0
  );
}

/** Expand to 8 lowercase 4-hex-digit groups (no brackets). */
function expandIpv6Hextets(address: string): string[] {
  let s = address.trim().toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) {
    s = s.slice(1, -1);
  }
  if (!s.includes("::")) {
    const parts = s.split(":").filter(Boolean);
    if (parts.length !== 8) throw new Error("invalid ipv6");
    return parts.map((p) => p.padStart(4, "0"));
  }
  const [head, tail] = s.split("::", 2);
  const headParts = head ? head.split(":").filter(Boolean) : [];
  const tailParts = tail ? tail.split(":").filter(Boolean) : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 0) throw new Error("invalid ipv6");
  const middle = Array<string>(missing).fill("0");
  return [...headParts, ...middle, ...tailParts].map((p) => p.padStart(4, "0"));
}

function ipv6ToBigInt(address: string): bigint {
  const hextets = expandIpv6Hextets(address);
  let n = BigInt(0);
  const sixteen = BigInt(16);
  for (const h of hextets) {
    n = (n << sixteen) + BigInt(parseInt(h, 16));
  }
  return n;
}

function isIpv4InAnyRange(ip: string): boolean {
  let n: number;
  try {
    n = ipv4ToUint32(ip);
  } catch {
    return false;
  }
  for (const [a, b] of IPV4_RANGES) {
    try {
      const lo = ipv4ToUint32(a);
      const hi = ipv4ToUint32(b);
      if (n >= lo && n <= hi) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function isIpv6InAnyRange(ip: string): boolean {
  let n: bigint;
  try {
    n = ipv6ToBigInt(ip);
  } catch {
    return false;
  }
  for (const [a, b] of IPV6_RANGES) {
    try {
      const lo = ipv6ToBigInt(a);
      const hi = ipv6ToBigInt(b);
      if (n >= lo && n <= hi) return true;
    } catch {
      continue;
    }
  }
  return false;
}

/** ::ffff:a.b.c.d → a.b.c.d */
function tryMappedIpv4(ip: string): string | null {
  const s = ip.trim().toLowerCase();
  const m = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  return m ? m[1]! : null;
}

export function isEnterpriseIpAllowed(ip: string): boolean {
  const trimmed = ip.trim();
  if (!trimmed) return false;

  const mapped = tryMappedIpv4(trimmed);
  if (mapped) {
    return isIpv4InAnyRange(mapped);
  }

  if (trimmed.includes(":")) {
    return isIpv6InAnyRange(trimmed);
  }

  return isIpv4InAnyRange(trimmed);
}

/**
 * Off by default. Set ENTERPRISE_IP_ALLOWLIST_ENABLED=1 to enforce office IP ranges (middleware).
 */
export function isEnterpriseIpAllowlistDisabled(): boolean {
  return process.env.ENTERPRISE_IP_ALLOWLIST_ENABLED !== "1";
}
