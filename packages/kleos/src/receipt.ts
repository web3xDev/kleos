// The stamp's off-chain half: a signed receipt. Its hash is what goes on
// chain; the receipt itself (with the answer) is encrypted to the owner.

import { hashMessage, keccak256, recoverMessageAddress, toBytes, type Hex } from "viem";

/** Public part of a receipt. Field order is fixed: the hash depends on it. */
export type ReceiptPublic = {
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

/** Private part: only the owner can read it. */
export type ReceiptPrivate = {
  request?: unknown;
  answer: string;
  meta?: Record<string, unknown>;
};

export type Receipt = ReceiptPublic & { signature: Hex };

const ORDER: (keyof ReceiptPublic)[] = [
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

/** Canonical JSON: fixed key order, no whitespace. */
export function canonical(pub: ReceiptPublic): string {
  const ordered: Record<string, unknown> = {};
  for (const k of ORDER) ordered[k] = pub[k];
  return JSON.stringify(ordered);
}

export function receiptHash(pub: ReceiptPublic): Hex {
  return keccak256(toBytes(canonical(pub)));
}

export function answerHash(answer: string): Hex {
  return keccak256(toBytes(answer));
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

export { hashMessage };
