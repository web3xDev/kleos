// Stamps as the site sees them: public receipts from the store, verified in
// the browser against Monad. Kleos's own API is never the source of truth.

import { isAddressEqual, keccak256, parseAbi, recoverMessageAddress, toBytes, type PublicClient } from "viem";
import { addresses } from "./chain";
import { open, type Sealed } from "./seal";

export type ReceiptPublic = {
  v: 1;
  network: string;
  agentId: string;
  wallet: `0x${string}`;
  tool: string;
  platform: string;
  amount: string;
  asset: `0x${string}`;
  settlementTx: `0x${string}`;
  answerHash: `0x${string}`;
  timestamp: number;
};

export type Stamp = {
  receiptHash: `0x${string}`;
  receipt: ReceiptPublic & { signature: `0x${string}` };
  sealed: Sealed;
};

export const kleosStampsAbi = parseAbi([
  "function stampCount(uint256 agentId) view returns (uint64)",
  "function getStamp(bytes32 receiptHash) view returns ((uint256 agentId, bytes32 settlementTx, uint256 amount, address wallet, uint64 timestamp))",
]);

const ORDER: (keyof ReceiptPublic)[] = [
  "v", "network", "agentId", "wallet", "tool", "platform", "amount", "asset", "settlementTx", "answerHash", "timestamp",
];

export function receiptHashOf(pub: ReceiptPublic): `0x${string}` {
  const o: Record<string, unknown> = {};
  for (const k of ORDER) o[k] = pub[k];
  return keccak256(toBytes(JSON.stringify(o)));
}

export async function fetchStamps(agentId: bigint): Promise<Stamp[]> {
  const res = await fetch(`/api/stamps?agentId=${agentId}`);
  if (!res.ok) return [];
  const { stamps } = (await res.json()) as { stamps: Stamp[] };
  return stamps;
}

export type Check = { label: string; ok: boolean; detail?: string };

/**
 * Verify one stamp the way anyone could: recompute the hash, recover the
 * signer, read the anchor from KleosStamps, confirm the settlement exists
 * and moved USDC. Nothing here asks Kleos.
 */
export async function verifyStamp(publicClient: PublicClient, stamp: Stamp): Promise<Check[]> {
  const checks: Check[] = [];
  const { signature, ...pub } = stamp.receipt;

  const hash = receiptHashOf(pub);
  checks.push({ label: "Receipt hash recomputed", ok: hash.toLowerCase() === stamp.receiptHash.toLowerCase() });

  let signer: `0x${string}` | null = null;
  try {
    signer = await recoverMessageAddress({ message: { raw: toBytes(hash) }, signature });
  } catch {
    signer = null;
  }
  checks.push({
    label: "Signed by the agent's wallet",
    ok: signer !== null && isAddressEqual(signer, pub.wallet),
    detail: signer ?? undefined,
  });

  const anchor = await publicClient.readContract({
    address: addresses.kleosStamps,
    abi: kleosStampsAbi,
    functionName: "getStamp",
    args: [hash],
  });
  const anchored = anchor.timestamp !== 0n && anchor.agentId === BigInt(pub.agentId);
  checks.push({
    label: "Anchored on Monad",
    ok:
      anchored &&
      anchor.settlementTx.toLowerCase() === pub.settlementTx.toLowerCase() &&
      anchor.amount === BigInt(pub.amount) &&
      isAddressEqual(anchor.wallet, pub.wallet),
  });

  let settled = false;
  let detail: string | undefined;
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: pub.settlementTx });
    // The facilitator settles by calling the asset contract (transferWithAuthorization).
    settled = receipt.status === "success" && receipt.logs.some((l) => isAddressEqual(l.address, pub.asset));
    detail = receipt.status;
  } catch {
    settled = false;
    detail = "not found";
  }
  checks.push({ label: "Payment settled on Monad", ok: settled, detail });

  return checks;
}

export function decryptStamp(stamp: Stamp, privateKey: Uint8Array): { answer: string; request?: unknown; hashMatches: boolean } {
  const bytes = open(stamp.sealed, privateKey);
  const body = JSON.parse(new TextDecoder().decode(bytes)) as { answer: string; request?: unknown };
  const hashMatches = keccak256(toBytes(body.answer)).toLowerCase() === stamp.receipt.answerHash.toLowerCase();
  return { answer: body.answer, request: body.request, hashMatches };
}

/** Provable numbers from a list of verified stamps. */
export function trackRecord(stamps: Stamp[]) {
  const usdc = stamps.reduce((s, x) => s + BigInt(x.receipt.amount), 0n);
  const first = stamps.length ? Math.min(...stamps.map((s) => s.receipt.timestamp)) : null;
  const days = first ? Math.max(1, Math.ceil((Date.now() / 1000 - first) / 86400)) : 0;
  return {
    actions: stamps.length,
    usdc,
    days,
    tools: new Set(stamps.map((s) => s.receipt.tool)).size,
    platforms: new Set(stamps.map((s) => s.receipt.platform)).size,
    firstSeen: first,
  };
}

export function formatUsdc(atomic: bigint): string {
  const whole = atomic / 1_000_000n;
  const frac = (atomic % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `$${whole}.${frac}`;
}
