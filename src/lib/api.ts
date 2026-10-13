// Shared shapes and helpers for the public API. Everything served here is
// either read from chain or verifiable against it; nothing is a score.

import { createPublicClient, isAddressEqual, recoverMessageAddress, toBytes, type PublicClient, type TransactionReceipt } from "viem";
import { receiptHash, type ReceiptPublic } from "kleos/receipt";
import { checkCountersign } from "./countersign";
import { addresses, chain, serverTransport } from "./chain";
import { kleosStampsAbi } from "./stamps";
import { listStamps, type StoredStamp } from "./store";

export const publicClient: PublicClient = createPublicClient({ chain, transport: serverTransport() });

// Anchors are permanent, so a hash seen anchored once never needs re-reading.
const anchoredSeen = new Set<string>();

/**
 * Stored receipts that are actually anchored on KleosStamps for this agent.
 * The store also holds bodies whose anchor never landed (e.g. the runtime ran
 * out of gas after storing); those are not stamps and are never served.
 */
export async function listAnchoredStamps(agentId: string): Promise<StoredStamp[]> {
  const stored = await listStamps(agentId);
  const unknown = stored.filter((s) => !anchoredSeen.has(s.receiptHash.toLowerCase()));
  if (unknown.length) {
    const res = await publicClient.multicall({
      contracts: unknown.map((s) => ({
        address: addresses.kleosStamps,
        abi: kleosStampsAbi,
        functionName: "getStamp" as const,
        args: [s.receiptHash as `0x${string}`],
      })),
    });
    res.forEach((r, i) => {
      if (r.status === "success" && r.result.timestamp !== 0n && r.result.agentId === BigInt(agentId)) {
        anchoredSeen.add(unknown[i].receiptHash.toLowerCase());
      }
    });
  }
  return stored.filter((s) => anchoredSeen.has(s.receiptHash.toLowerCase()));
}

export function stampPublic(s: StoredStamp) {
  const { signature, ...pub } = s.receipt as unknown as ReceiptPublic & { signature: `0x${string}` };
  return { receiptHash: s.receiptHash, ...pub, signature };
}

export function trackRecordOf(stamps: StoredStamp[]) {
  const usdc = stamps.reduce((t, s) => t + BigInt(s.receipt.amount as string), 0n);
  const first = stamps.length ? Math.min(...stamps.map((s) => s.receipt.timestamp)) : null;
  return {
    verifiedActions: stamps.length,
    usdcSettled: usdc.toString(),
    usdcSettledFormatted: `${usdc / 1_000_000n}.${(usdc % 1_000_000n).toString().padStart(6, "0").slice(0, 2)}`,
    firstSeen: first,
    daysActive: first ? Math.max(1, Math.ceil((Date.now() / 1000 - first) / 86400)) : 0,
    tools: [...new Set(stamps.map((s) => s.receipt.tool as string))],
    platforms: [...new Set(stamps.map((s) => s.receipt.platform as string))],
  };
}

/** The same five checks the browser runs, server-side, for callers without a wallet library. */
export async function verifyStored(s: StoredStamp) {
  const { signature, ...pub } = s.receipt as unknown as Record<string, unknown> & { signature: `0x${string}` };
  const hash = receiptHash(pub as unknown as ReceiptPublic);
  // ok: null = not applicable (v1 stamps have no countersignature).
  const checks: { label: string; ok: boolean | null; detail?: string }[] = [];

  checks.push({ label: "receiptHashRecomputed", ok: hash.toLowerCase() === s.receiptHash.toLowerCase(), detail: hash });

  let signer: string | null = null;
  try {
    signer = await recoverMessageAddress({ message: { raw: toBytes(hash) }, signature });
  } catch {
    signer = null;
  }
  checks.push({
    label: "signedByAgentWallet",
    ok: signer !== null && isAddressEqual(signer as `0x${string}`, pub.wallet as `0x${string}`),
    detail: signer ?? undefined,
  });

  const anchor = await publicClient.readContract({
    address: addresses.kleosStamps,
    abi: kleosStampsAbi,
    functionName: "getStamp",
    args: [hash],
  });
  checks.push({
    label: "anchoredOnMonad",
    ok:
      anchor.timestamp !== 0n &&
      anchor.agentId === BigInt(pub.agentId as string) &&
      anchor.settlementTx.toLowerCase() === (pub.settlementTx as string).toLowerCase() &&
      anchor.amount === BigInt(pub.amount as string) &&
      isAddressEqual(anchor.wallet, pub.wallet as `0x${string}`),
    detail: anchor.timestamp !== 0n ? `anchored at ${anchor.timestamp}` : "not anchored",
  });

  let settled = false;
  let detail: string | undefined;
  let settlement: TransactionReceipt | null = null;
  try {
    const r = await publicClient.getTransactionReceipt({ hash: pub.settlementTx as `0x${string}` });
    settlement = r;
    settled = r.status === "success" && r.logs.some((l) => isAddressEqual(l.address, pub.asset as `0x${string}`));
    detail = `${r.status}, block ${r.blockNumber}`;
  } catch {
    detail = "transaction not found";
  }
  checks.push({ label: "paymentSettledOnMonad", ok: settled, detail });

  const cs = await checkCountersign(publicClient, pub as unknown as ReceiptPublic, settlement);
  checks.push({ label: "countersignedByTool", ok: cs.ok, detail: cs.detail });

  return { receiptHash: s.receiptHash, agentId: pub.agentId, valid: checks.every((c) => c.ok !== false), checks };
}

export const apiHeaders = { "cache-control": "public, max-age=15", "access-control-allow-origin": "*" };
