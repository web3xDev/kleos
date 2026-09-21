// A WebAuthn client for Mera that evaluates two PRF salts in one ceremony.
// Mera asks for one salt (`first`); we add the Kleos encryption salt as
// `second`, so one Touch ID yields both the owner root and the encryption
// root. The second output is handed back through `takeSecond()` and never
// touches Mera's return path.

import type { WebAuthnClient } from "@category-labs/mera";

type PrfResults = {
  prf?: {
    enabled?: boolean;
    results?: { first?: BufferSource | ArrayLike<number>; second?: BufferSource | ArrayLike<number> };
  };
};

function toBytes(v: BufferSource | ArrayLike<number> | undefined): Uint8Array | undefined {
  if (v === undefined) return undefined;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice();
  return Uint8Array.from(v as ArrayLike<number>);
}

function assertCredential(c: Credential | null | undefined): PublicKeyCredential {
  if (c?.type !== "public-key" || !("rawId" in c)) {
    throw new Error("WebAuthn returned no usable public key credential");
  }
  return c as PublicKeyCredential;
}

export function createTwoSaltClient(salt: Uint8Array) {
  // Fresh ArrayBuffer-backed copy: WebAuthn's BufferSource type rejects views
  // over a possibly-shared buffer.
  const secondSalt = new Uint8Array(new ArrayBuffer(salt.length));
  secondSalt.set(salt);
  let second: Uint8Array | undefined;

  const client: WebAuthnClient = {
    async createCredential(request) {
      const credential = assertCredential(
        await navigator.credentials.create({
          publicKey: {
            rp: request.rp,
            user: request.user,
            challenge: request.challenge,
            pubKeyCredParams: request.algorithms.map((alg) => ({ type: "public-key" as const, alg })),
            ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
            attestation: request.attestation,
            authenticatorSelection: {
              residentKey: request.residentKey,
              requireResidentKey: true,
              userVerification: request.userVerification,
            },
            extensions: { prf: { eval: { first: request.prfSalt, second: secondSalt } } },
          },
        }),
      );
      const results = (credential.getClientExtensionResults() as PrfResults).prf;
      const response = credential.response as AuthenticatorAttestationResponse;
      const first = toBytes(results?.results?.first);
      second = toBytes(results?.results?.second);
      return {
        credentialId: new Uint8Array(credential.rawId),
        ...(typeof response.getTransports === "function" ? { transports: response.getTransports() } : {}),
        prfEnabled: results?.enabled === true,
        ...(first ? { prfOutput: first } : {}),
      };
    },

    async getCredential(request) {
      const { allowCredential } = request;
      const credential = assertCredential(
        await navigator.credentials.get({
          publicKey: {
            rpId: request.rpId,
            challenge: request.challenge,
            ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
            userVerification: request.userVerification,
            extensions: { prf: { eval: { first: request.prfSalt, second: secondSalt } } },
            ...(allowCredential
              ? {
                  allowCredentials: [
                    {
                      id: allowCredential.credentialId,
                      type: "public-key" as const,
                      ...(allowCredential.transports
                        ? { transports: allowCredential.transports as AuthenticatorTransport[] }
                        : {}),
                    },
                  ],
                }
              : {}),
          },
        }),
      );
      const results = (credential.getClientExtensionResults() as PrfResults).prf;
      const first = toBytes(results?.results?.first);
      second = toBytes(results?.results?.second);
      return {
        credentialId: new Uint8Array(credential.rawId),
        ...(first ? { prfOutput: first } : {}),
      };
    },
  };

  return {
    client,
    /** Returns the second PRF output from the last ceremony and clears it. */
    takeSecond(): Uint8Array | undefined {
      const out = second;
      second = undefined;
      return out;
    },
  };
}
