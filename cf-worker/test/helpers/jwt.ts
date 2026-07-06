// Real ES256 JWT signing for auth-middleware tests. We generate a fresh P-256
// key pair inside workerd, publish its public JWK through fetchMock as the
// Octonion/Supabase JWKS document, and sign tokens with the private key: the
// middleware then runs its genuine verification path (JWKS fetch, key import,
// signature check, exp/iss/role checks) with zero network and zero credentials.
//
// WebCrypto's ECDSA output is raw r||s, which IS the JOSE signature format, so
// no DER conversion is needed on the signing side.

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodePart(obj: unknown): string {
  return bytesToBase64url(new TextEncoder().encode(JSON.stringify(obj)));
}

export interface AuthKit {
  kid: string;
  /** JWKS document to serve at <issuer>/auth/v1/.well-known/jwks.json */
  jwks: { keys: Array<Record<string, unknown>> };
  /** Sign a JWT with the kit's private key. Header defaults to ES256 + kid. */
  signToken(
    payload: Record<string, unknown>,
    header?: Record<string, unknown>
  ): Promise<string>;
}

export async function createAuthKit(kid = "test-key-1"): Promise<AuthKit> {
  const { publicKey, privateKey } = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;

  const publicJwk = (await crypto.subtle.exportKey(
    "jwk",
    publicKey
  )) as unknown as Record<string, unknown>;

  return {
    kid,
    jwks: { keys: [{ ...publicJwk, kid, alg: "ES256", use: "sig" }] },
    async signToken(payload, header = {}) {
      const headerB64 = encodePart({ alg: "ES256", kid, ...header });
      const payloadB64 = encodePart(payload);
      const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        signingInput
      );
      return `${headerB64}.${payloadB64}.${bytesToBase64url(new Uint8Array(signature))}`;
    },
  };
}

/** Standard happy-path claims for the given issuer base URL (no /auth/v1 suffix). */
export function validClaims(
  issuerBase: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    sub: "user-test-1",
    role: "authenticated",
    iss: `${issuerBase}/auth/v1`,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}
