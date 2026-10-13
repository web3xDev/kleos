// Privy authorization signatures, browser- and server-safe (no Node APIs).
//
// A request on a Privy wallet or policy that has an owner, or that a signer
// makes, carries `privy-authorization-signature`: an ECDSA P-256 signature
// (SHA-256, DER, base64) over the RFC 8785 canonical JSON of
// { version: 1, method, url, body, headers: { "privy-app-id", ... } }.
//
// Kleos uses two such keys: the wallet's owner (derived from the owner's
// passkey, so only Touch ID can change the rules) and the server's signer
// (allowed to sign only within the policy).

import { p256 } from "@noble/curves/nist.js";

export const PRIVY_API = "https://api.privy.io/v1";

/** RFC 8785 canonical JSON for the values Privy requests contain (objects, arrays, strings, safe numbers, booleans, null). */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

const toB64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export type PrivyRequest = { method: "POST" | "PATCH" | "PUT" | "DELETE"; url: string; body: unknown; appId: string };

/** The privy-authorization-signature header value for a request, signed with a P-256 secret key. */
export function authorizationSignature(secretKey: Uint8Array, req: PrivyRequest): string {
  const payload = { version: 1, method: req.method, url: req.url, body: req.body, headers: { "privy-app-id": req.appId } };
  const message = new TextEncoder().encode(canonicalize(payload));
  return toB64(p256.sign(message, secretKey, { prehash: true, format: "der" }));
}

// SubjectPublicKeyInfo header for an uncompressed P-256 point.
const SPKI_P256 = Uint8Array.from([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
  0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

/** The public key Privy expects for an owner or a key quorum: base64 DER SPKI. */
export function privyPublicKey(secretKey: Uint8Array): string {
  const point = p256.getPublicKey(secretKey, false);
  const spki = new Uint8Array(SPKI_P256.length + point.length);
  spki.set(SPKI_P256);
  spki.set(point, SPKI_P256.length);
  return toB64(spki);
}

/** The 32-byte secret of a base64 PKCS#8 P-256 key (as `privy-signer` prints it). */
export function secretFromPkcs8(b64: string): Uint8Array {
  const der = fromB64(b64.replace(/^wallet-auth:/, ""));
  for (let i = 0; i < der.length - 33; i++) if (der[i] === 0x04 && der[i + 1] === 0x20) return der.slice(i + 2, i + 34);
  throw new Error("not a P-256 PKCS#8 key");
}

/** True when 32 bytes are a usable P-256 secret (for keys derived from a passkey). */
export const isP256Secret = (key: Uint8Array) => p256.utils.isValidSecretKey(key);
