import type { Context, Next } from "hono";
import type { Env } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JwkKey {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
}

interface CachedKey {
  key: CryptoKey;
  alg: string;
  cachedAt: number;
}

interface JwtHeader {
  alg: string;
  kid?: string;
}

interface JwtPayload {
  exp?: number;
  iss?: string;
  [key: string]: unknown;
}

// ─── JWKS Cache ───────────────────────────────────────────────────────────────

// Module-level cache persists across requests within the same worker isolate.
// Each isolate starts fresh on cold start (acceptable - JWKS fetch is fast).
const JWKS_TTL_MS = 10 * 60 * 1000; // 10 minutes, matches Supabase edge cache
const keyCache = new Map<string, CachedKey>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeJwtPart<T>(b64url: string): T {
  const bytes = base64urlToBytes(b64url);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function encodeAsn1Length(length: number): Uint8Array {
  if (length < 0x80) {
    return Uint8Array.of(length);
  }

  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }

  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function normalizeAsn1Integer(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start += 1;
  }

  const trimmed = bytes.slice(start);
  if (trimmed[0] && (trimmed[0] & 0x80) !== 0) {
    const prefixed = new Uint8Array(trimmed.length + 1);
    prefixed[0] = 0;
    prefixed.set(trimmed, 1);
    return prefixed;
  }

  return trimmed;
}

function joseToDerEcdsaSignature(signature: Uint8Array): Uint8Array {
  if (signature.length % 2 !== 0) {
    throw new Error("Invalid ES256 signature length");
  }

  const half = signature.length / 2;
  const r = normalizeAsn1Integer(signature.slice(0, half));
  const s = normalizeAsn1Integer(signature.slice(half));

  const rLength = encodeAsn1Length(r.length);
  const sLength = encodeAsn1Length(s.length);
  const sequenceLength =
    2 + rLength.length + r.length +
    2 + sLength.length + s.length;
  const sequenceLengthBytes = encodeAsn1Length(sequenceLength);

  const der = new Uint8Array(
    1 + sequenceLengthBytes.length + sequenceLength
  );

  let offset = 0;
  der[offset++] = 0x30;
  der.set(sequenceLengthBytes, offset);
  offset += sequenceLengthBytes.length;

  der[offset++] = 0x02;
  der.set(rLength, offset);
  offset += rLength.length;
  der.set(r, offset);
  offset += r.length;

  der[offset++] = 0x02;
  der.set(sLength, offset);
  offset += sLength.length;
  der.set(s, offset);

  return der;
}

async function importJwk(
  jwk: JwkKey
): Promise<{ key: CryptoKey; alg: string } | null> {
  try {
    if (jwk.kty === "RSA") {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk as JsonWebKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );
      return { key, alg: "RS256" };
    }
    if (jwk.kty === "EC" && (jwk.crv === "P-256" || jwk.alg === "ES256")) {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk as JsonWebKey,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
      );
      return { key, alg: "ES256" };
    }
  } catch {
    // skip keys that cannot be imported
  }
  return null;
}

async function fetchAndCacheJwks(jwksUrl: string): Promise<void> {
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: HTTP ${response.status}`);
  }
  const jwks = (await response.json()) as { keys: JwkKey[] };
  const now = Date.now();

  // Clear cache and rebuild to handle key revocation
  keyCache.clear();

  for (const jwk of jwks.keys ?? []) {
    if (!jwk.kid) continue;
    const imported = await importJwk(jwk);
    if (imported) {
      keyCache.set(jwk.kid, { ...imported, cachedAt: now });
    }
  }
}

async function getSigningKey(kid: string, jwksUrl: string): Promise<CachedKey> {
  const cached = keyCache.get(kid);
  const now = Date.now();

  if (cached && now - cached.cachedAt < JWKS_TTL_MS) {
    return cached;
  }

  // Cache miss or TTL expired: re-fetch JWKS (cache-busting strategy)
  await fetchAndCacheJwks(jwksUrl);

  const key = keyCache.get(kid);
  if (!key) {
    throw new Error("Unknown signing key (kid not found in JWKS)");
  }
  return key;
}

// ─── JWT Verification ─────────────────────────────────────────────────────────

async function verifySupabaseJwt(
  token: string,
  supabaseUrl: string
): Promise<void> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeJwtPart<JwtHeader>(headerB64);
  if (!header.kid) {
    throw new Error("JWT missing kid in header");
  }

  const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  const { key, alg } = await getSigningKey(header.kid, jwksUrl);
  if (header.alg && header.alg !== alg) {
    throw new Error("JWT algorithm mismatch");
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const rawSignature = base64urlToBytes(signatureB64);

  let valid: boolean;
  if (alg === "RS256") {
    valid = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      rawSignature,
      signingInput
    );
  } else if (alg === "ES256") {
    valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      joseToDerEcdsaSignature(rawSignature),
      signingInput
    );
  } else {
    throw new Error(`Unsupported signing algorithm: ${alg}`);
  }

  if (!valid) {
    throw new Error("Invalid token signature");
  }

  const payload = decodeJwtPart<JwtPayload>(payloadB64);

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) {
    throw new Error("Token has expired");
  }

  // Verify the token was issued by this Supabase project
  const expectedIss = `${supabaseUrl}/auth/v1`;
  if (payload.iss && payload.iss !== expectedIss) {
    throw new Error("Invalid token issuer");
  }

  // Ensure this is an authenticated user session, not a service role or anon key
  if (payload.role !== "authenticated") {
    throw new Error("Invalid token role");
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function requireAuth(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void> {
  // Fail closed by default. Local dev can opt into bypass explicitly.
  if (!c.env.SUPABASE_URL) {
    if (c.env.ALLOW_UNAUTHENTICATED_DEV === "true") {
      return next();
    }
    return c.json({ error: "Authentication not configured" }, 500);
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  try {
    await verifySupabaseJwt(token, c.env.SUPABASE_URL);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return c.json({ error: message }, 401);
  }

  return next();
}
