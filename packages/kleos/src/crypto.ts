// Receipt bodies are encrypted to the owner's public key (ECIES over
// secp256k1: ephemeral ECDH → HKDF → AES-256-GCM). The runtime never holds
// any owner secret; only the passkey-derived private key can open a body.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const INFO = utf8ToBytes("kleos.receipt.v1");

export type Sealed = {
  v: 1;
  /** Ephemeral compressed public key, hex without 0x. */
  epk: string;
  /** 12-byte AES-GCM nonce, hex. */
  nonce: string;
  /** Ciphertext with the GCM tag, hex. */
  ct: string;
};

function strip0x(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

function deriveKey(shared: Uint8Array, epk: Uint8Array): Uint8Array {
  // shared is the 33-byte compressed point; x-coordinate is bytes 1..33.
  return hkdf(sha256, shared.slice(1), epk, INFO, 32);
}

/** Encrypt bytes to a compressed secp256k1 public key. */
export function seal(plaintext: Uint8Array, recipientPublicKey: string): Sealed {
  const recipient = hexToBytes(strip0x(recipientPublicKey));
  const eph = secp256k1.utils.randomSecretKey();
  const epk = secp256k1.getPublicKey(eph, true);
  const shared = secp256k1.getSharedSecret(eph, recipient, true);
  const key = deriveKey(shared, epk);
  const nonce = randomBytes(12);
  const ct = gcm(key, nonce).encrypt(plaintext);
  return { v: 1, epk: bytesToHex(epk), nonce: bytesToHex(nonce), ct: bytesToHex(ct) };
}

/** Decrypt with the recipient's private key. Throws on a bad tag. */
export function open(sealed: Sealed, recipientPrivateKey: Uint8Array): Uint8Array {
  const epk = hexToBytes(sealed.epk);
  const shared = secp256k1.getSharedSecret(recipientPrivateKey, epk, true);
  const key = deriveKey(shared, epk);
  return gcm(key, hexToBytes(sealed.nonce)).decrypt(hexToBytes(sealed.ct));
}
