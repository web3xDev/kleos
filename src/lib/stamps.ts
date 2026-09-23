// Stamps as the site sees them: public receipts from the store, verified in
// the browser against Monad. Kleos's own API is never the source of truth.

import { concat, isAddressEqual, keccak256, parseAbi, recoverMessageAddress, toBytes, type PublicClient, type TransactionReceipt } from "viem";
import { answerCommitment, receiptHash, type ReceiptPublic } from "kleos/receipt";
import { addresses } from "./chain";
import { checkCountersign } from "./countersign";
import { open, type Sealed } from "./seal";

export type { ReceiptPublic };

export type Stamp = {
  receiptHash: `0x${string}`;
  receipt: ReceiptPublic & { signature: `0x${string}` };
  sealed: Sealed;
};

export const kleosStampsAbi = parseAbi([
  "function stampCount(uint256 agentId) view returns (uint64)",
  "function getStamp(bytes32 receiptHash) view returns ((uint256 agentId, bytes32 settlementTx, uint256 amount, address wallet, uint64 timestamp))",
]);

/** Canonical receipt hash, v1 or v2: the same function the runtime signs with. */
export function receiptHashOf(pub: ReceiptPublic): `0x${string}` {
  return receiptHash(pub);
}

export async function fetchStamps(agentId: bigint): Promise<Stamp[]> {
  const res = await fetch(`/api/stamps?agentId=${agentId}`);
  if (!res.ok) return [];
  const { stamps } = (await res.json()) as { stamps: Stamp[] };
  return stamps;
}

/** ok: null means "not applicable" (a v1 stamp has no countersignature); it never fails a stamp. */
export type Check = { label: string; ok: boolean | null; detail?: string };

export const COUNTERSIGN_LABEL = "Countersigned by the tool";

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
  let settlement: TransactionReceipt | null = null;
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: pub.settlementTx });
    settlement = receipt;
    // The facilitator settles by calling the asset contract (transferWithAuthorization).
    settled = receipt.status === "success" && receipt.logs.some((l) => isAddressEqual(l.address, pub.asset));
    detail = receipt.status;
  } catch {
    settled = false;
    detail = "not found";
  }
  checks.push({ label: "Payment settled on Monad", ok: settled, detail });

  const cs = await checkCountersign(publicClient, pub, settlement);
  checks.push({ label: COUNTERSIGN_LABEL, ok: cs.ok, detail: cs.signer ?? cs.detail });

  return checks;
}

/** A stamp passes when no check failed; "not applicable" (null) is not a failure. */
export function passed(checks: Check[]): boolean {
  return checks.every((c) => c.ok !== false);
}

export function decryptStamp(
  stamp: Stamp,
  privateKey: Uint8Array,
): { answer: string; request?: unknown; hashMatches: boolean; toolCommitMatches: boolean | null } {
  const bytes = open(stamp.sealed, privateKey);
  const body = JSON.parse(new TextDecoder().decode(bytes)) as {
    answer: string;
    answerSalt?: `0x${string}`;
    toolSalt?: `0x${string}`;
    request?: unknown;
  };
  // The hash is keccak256(salt || answer). Stamps written before salts
  // existed carry no salt and hash the answer alone.
  const computed = body.answerSalt
    ? keccak256(concat([toBytes(body.answerSalt), toBytes(body.answer)]))
    : keccak256(toBytes(body.answer));
  // v2: the tool committed to the answer it served; the owner can open that commitment.
  const r = stamp.receipt;
  const toolCommitMatches =
    r.v === 2 && body.toolSalt ? answerCommitment(body.answer, body.toolSalt).toLowerCase() === r.answerCommit.toLowerCase() : null;
  return {
    answer: body.answer,
    request: body.request,
    hashMatches: computed.toLowerCase() === r.answerHash.toLowerCase(),
    toolCommitMatches,
  };
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
