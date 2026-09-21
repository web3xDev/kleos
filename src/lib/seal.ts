// Browser-side half of the receipt encryption (mirror of packages/kleos
// crypto.ts): open a body sealed to the owner's per-agent key.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const INFO = utf8ToBytes("kleos.receipt.v1");

export type Sealed = { v: 1; epk: string; nonce: string; ct: string };

export function open(sealed: Sealed, recipientPrivateKey: Uint8Array): Uint8Array {
  const epk = hexToBytes(sealed.epk);
  const shared = secp256k1.getSharedSecret(recipientPrivateKey, epk, true);
  const key = hkdf(sha256, shared.slice(1), epk, INFO, 32);
  return gcm(key, hexToBytes(sealed.nonce)).decrypt(hexToBytes(sealed.ct));
}
