// The stamp's off-chain half: a signed receipt. Its hash is what goes on
// chain; the receipt itself (with the answer) is encrypted to the owner.

import { concat, hashMessage, keccak256, recoverMessageAddress, toBytes, type Hex } from "viem";

/** Public part of a receipt. Field order is fixed: the hash depends on it.
 * v1: signed by the buyer's runtime only. v2 adds the tool's countersignature. */
export type ReceiptPublicV1 = {
  v: 1;
  network: string;
  agentId: string; // decimal string, keeps JSON exact
  wallet: `0x${string}`; // runtime signer
  tool: string;
  platform: string;
  amount: string; // atomic units, decimal string
  asset: `0x${string}`;
  settlementTx: `0x${string}`;
  answerHash: `0x${string}`; // keccak256 of the answer bytes
  timestamp: number; // unix seconds
};

export type ReceiptPublicV2 = Omit<ReceiptPublicV1, "v"> & {
  v: 2;
  /** Where the payment went; the countersignature must come from this address. */
  payTo: `0x${string}`;
  /** The EIP-3009 authorization nonce: appears in the settlement tx as AuthorizationUsed. */
  paymentNonce: `0x${string}`;
  /** The tool's own salted commitment to the answer it served. */
  answerCommit: `0x${string}`;
  /** The tool's EIP-191 signature over `countersignDigest(...)`. */
  toolSignature: Hex;
};

export type ReceiptPublic = ReceiptPublicV1 | ReceiptPublicV2;

/** Private part: only the owner can read it. Carries the salt so the owner
 * can recompute `answerHash`; without it the hash cannot be brute-forced
 * from a small set of likely answers. */
export type ReceiptPrivate = {
  request?: unknown;
  answer: string;
  /** 32-byte hex, hashed together with the answer. */
  answerSalt: Hex;
  meta?: Record<string, unknown>;
  /** v2: the tool's salt for `answerCommit`, so the owner can check the tool committed to this exact answer. */
  toolSalt?: Hex;
};

export type Receipt = ReceiptPublic & { signature: Hex };

const ORDER_V1: string[] = [
  "v",
  "network",
  "agentId",
  "wallet",
  "tool",
  "platform",
  "amount",
  "asset",
  "settlementTx",
  "answerHash",
  "timestamp",
];
const ORDER_V2: string[] = [...ORDER_V1, "payTo", "paymentNonce", "answerCommit", "toolSignature"];

/** Canonical JSON: fixed key order per version, no whitespace. */
export function canonical(pub: ReceiptPublic): string {
  const order = pub.v === 2 ? ORDER_V2 : ORDER_V1;
  const ordered: Record<string, unknown> = {};
  for (const k of order) ordered[k] = (pub as Record<string, unknown>)[k];
  return JSON.stringify(ordered);
}

export function receiptHash(pub: ReceiptPublic): Hex {
  return keccak256(toBytes(canonical(pub)));
}

/**
 * keccak256(salt || answer). The salt is random per stamp and lives only in
 * the sealed body, so a public hash reveals nothing even when the answer is
 * short or predictable.
 */
export function answerHash(answer: string, salt: Hex): Hex {
  return keccak256(concat([toBytes(salt), toBytes(answer)]));
}

/** What the runtime signs: EIP-191 over the canonical receipt hash. */
export function signingMessage(pub: ReceiptPublic): { raw: Uint8Array } {
  return { raw: toBytes(receiptHash(pub)) };
}

/** Check the signature was made by `pub.wallet` over this exact receipt. */
export async function verifyReceiptSignature(receipt: Receipt): Promise<boolean> {
  const { signature, ...pub } = receipt;
  const recovered = await recoverMessageAddress({ message: signingMessage(pub), signature });
  return recovered.toLowerCase() === pub.wallet.toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Tool countersignature                                               */
/* ------------------------------------------------------------------ */

/**
 * What the tool signs when it serves a paid call: "I was paid `amount` of
 * `asset` by `payer`, into `payTo`, with authorization `nonce`, for `tool`,
 * and this is my commitment to the answer I served."
 * The nonce is unique per payment and shows up in the settlement tx, so a
 * countersignature cannot be reused for another payment.
 */
export type CountersignFields = {
  v: 1;
  network: string;
  tool: string;
  payer: `0x${string}`;
  payTo: `0x${string}`;
  asset: `0x${string}`;
  amount: string;
  nonce: `0x${string}`;
  answerCommit: `0x${string}`;
};

/** Sent by the tool in the `X-Kleos-Countersign` response header (base64url JSON). */
export type Countersign = CountersignFields & { signature: Hex; salt: Hex };

export const COUNTERSIGN_HEADER = "x-kleos-countersign";

const CS_ORDER: (keyof CountersignFields)[] = ["v", "network", "tool", "payer", "payTo", "asset", "amount", "nonce", "answerCommit"];

export function countersignDigest(f: CountersignFields): Hex {
  const ordered: Record<string, unknown> = {};
  for (const k of CS_ORDER) ordered[k] = typeof f[k] === "string" && k !== "tool" && k !== "network" ? String(f[k]).toLowerCase() : f[k];
  return keccak256(toBytes(JSON.stringify(ordered)));
}

/** keccak256(salt || answer), the tool's own salt: public commitment, private opening. */
export function answerCommitment(answer: string, salt: Hex): Hex {
  return keccak256(concat([toBytes(salt), toBytes(answer)]));
}

/** Who signed a countersignature (must equal `payTo` to count). */
export async function countersigner(f: CountersignFields, signature: Hex): Promise<`0x${string}`> {
  return recoverMessageAddress({ message: { raw: toBytes(countersignDigest(f)) }, signature });
}

/**
 * Countersignatures name the network the way x402 does (CAIP-2); receipts use
 * Kleos's network names. This maps one to the other.
 */
const CAIP2: Record<string, string> = { "monad-testnet": "eip155:10143", monad: "eip155:143" };
export function caip2(network: string): string {
  return CAIP2[network] ?? network;
}

/** The countersign fields a v2 receipt commits to. */
export function countersignFieldsOf(pub: ReceiptPublicV2): CountersignFields {
  return {
    v: 1,
    network: caip2(pub.network),
    tool: pub.tool,
    payer: pub.wallet,
    payTo: pub.payTo,
    asset: pub.asset,
    amount: pub.amount,
    nonce: pub.paymentNonce,
    answerCommit: pub.answerCommit,
  };
}

export function encodeCountersign(c: Countersign): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCountersign(header: string): Countersign | null {
  try {
    const c = JSON.parse(Buffer.from(header.trim(), "base64url").toString("utf8")) as Countersign;
    return c.v === 1 && c.signature && c.nonce && c.payTo ? c : null;
  } catch {
    return null;
  }
}

export { hashMessage };
