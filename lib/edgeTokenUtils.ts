// lib/edgeTokenUtils.ts
// Edge-compatible JWT verifier using Web Crypto API.
// Used exclusively by the Next.js middleware, which cannot use node:crypto or jsonwebtoken.

function decodeBase64Url(str: string) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) {
    base64 += new Array(5 - pad).join("=");
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function base64UrlToUint8Array(str: string) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) {
    base64 += new Array(5 - pad).join("=");
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function verifyAccessTokenEdge(token: string): Promise<{ sub: string; role: string }> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");
  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify signature using Web Crypto API
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBuf = base64UrlToUint8Array(signatureB64);
  const dataBuf = encoder.encode(`${headerB64}.${payloadB64}`);

  const isValid = await crypto.subtle.verify("HMAC", key, sigBuf, dataBuf);
  if (!isValid) throw new Error("Invalid signature");

  // Parse and verify payload
  const payload = JSON.parse(decodeBase64Url(payloadB64));
  
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error("Token expired");
  }

  return payload as { sub: string; role: string };
}
