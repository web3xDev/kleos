// Passkey → keys. Everything here runs in the browser and holds secrets in
// memory only. The only thing we ever persist is the credential id, which is
// public metadata used to pin later sign-ins to the same passkey.

import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { p256 } from "@noble/curves/nist.js";
import { createTwoSaltClient } from "./webauthn-two-salts";

const CREDENTIAL_KEY = "kleos.credential";

// Two PRF namespaces. The owner salt is Mera's default, so the owner account
// is the same account any Mera app would derive for this passkey. The
// encryption salt is Kleos-only: even someone holding the owner key cannot
// decrypt agent history without a fresh passkey ceremony on this salt.
export const ENCRYPTION_SALT = sha256(utf8ToBytes("kleos.encryption.v1"));

export type OwnerKeys = {
  credentialId: string;
  owner: { session: Secp256k1SigningSession; address: string };
};

export type EncryptionKeys = {
  // Per-agent keypairs are derived from the encryption root with HKDF over an
  // owner-local index, so one ceremony covers every agent. The index is
  // written to the agent's ERC-8004 metadata at registration, which is how a
  // fresh device knows which key opens which agent's history. The agent id
  // itself cannot be used: it is only known after the mint.
  forIndex: (index: number) => { privateKey: Uint8Array; publicKey: `0x${string}` };
  /**
   * A P-256 key for Privy, from the same root: it owns a Privy agent's wallet
   * and spending rules, so changing them takes this passkey. Never stored.
   */
  privyOwner: () => Uint8Array;
};

function rpId(): string {
  return location.hostname;
}

function loadCredential(): PasskeyCredentialMetadata | undefined {
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY);
    return raw ? (JSON.parse(raw) as PasskeyCredentialMetadata) : undefined;
  } catch {
    return undefined;
  }
}

function saveCredential(credential: PasskeyCredentialMetadata): void {
  try {
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credential));
  } catch {
    // Untrusted storage is a convenience only; the passkey is the source of truth.
  }
}

export function forgetCredential(): void {
  localStorage.removeItem(CREDENTIAL_KEY);
}

export function hasStoredCredential(): boolean {
  return loadCredential() !== undefined;
}

function ownerFromPrf(prfOutput: Uint8Array) {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (node.privateKey === null) throw new Error("derivation produced no key");
  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  return { session, address: getEvmAddress(session.publicKey) };
}

function encryptionFromRoot(root: Uint8Array): EncryptionKeys {
  return {
    forIndex(index: number) {
      const privateKey = hkdf(sha256, root, utf8ToBytes("kleos.agent.v1"), utf8ToBytes(String(index)), 32);
      return {
        privateKey,
        publicKey: `0x${bytesToHex(secp256k1.getPublicKey(privateKey, true))}`,
      };
    },
    privyOwner() {
      // Retry with a counter in the vanishingly rare case the output is not a valid P-256 scalar.
      for (let i = 0; ; i++) {
        const key = hkdf(sha256, root, utf8ToBytes("kleos.privy-owner.v1"), utf8ToBytes(String(i)), 32);
        if (p256.utils.isValidSecretKey(key)) return key;
      }
    },
  };
}

export type SignInResult = OwnerKeys & {
  encryption: EncryptionKeys;
  /** How many passkey prompts the sign-in took: 1 when both salts came back at once. */
  ceremonies: 1 | 2;
};

/**
 * First visit: one creation ceremony. Both PRF salts are requested in the same
 * ceremony; if the authenticator only returns the first (some do at creation),
 * a second assertion fetches the encryption root.
 */
export async function createOwner(): Promise<SignInResult> {
  const two = createTwoSaltClient(ENCRYPTION_SALT);
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "Kleos" },
    user: { name: "kleos", displayName: "Kleos" },
    webAuthnClient: two.client,
  });
  const credential: PasskeyCredentialMetadata = {
    credentialId: created.credentialId,
    ...(created.transports ? { transports: created.transports } : {}),
  };
  saveCredential(credential);
  return finish(credential.credentialId, created.prfOutput, two.takeSecond());
}

/** Returning visit (or fresh device): one assertion ceremony for both roots. */
export async function signInOwner(): Promise<SignInResult> {
  const known = loadCredential();
  const two = createTwoSaltClient(ENCRYPTION_SALT);
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({
    rpId: rpId(),
    ...(known ? { credential: known } : {}),
    webAuthnClient: two.client,
  });
  saveCredential(known?.credentialId === credentialId ? known : { credentialId });
  return finish(credentialId, prfOutput, two.takeSecond());
}

async function finish(
  credentialId: string,
  ownerRoot: Uint8Array,
  encryptionRoot: Uint8Array | undefined,
): Promise<SignInResult> {
  const owner = ownerFromPrf(ownerRoot);
  if (encryptionRoot && encryptionRoot.length === 32) {
    return { credentialId, owner, encryption: encryptionFromRoot(encryptionRoot), ceremonies: 1 };
  }
  // Fallback: a second ceremony on the Kleos-only salt.
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: rpId(),
    credential: { credentialId },
    prfSalt: ENCRYPTION_SALT,
  });
  return { credentialId, owner, encryption: encryptionFromRoot(prfOutput), ceremonies: 2 };
}
