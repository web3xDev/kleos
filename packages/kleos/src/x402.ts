// Paying client for Monad and a helper that turns one paid call into a stamp.
// This is the "add Kleos to your runtime" surface: wrap fetch, call the
// tool, and every settled payment leaves a stamp.

import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import type { RuntimeAccount } from "./runtime.js";
import { networks, type NetworkName } from "./chain.js";
import { clients } from "./runtime.js";
import type { Stamper, StampResult } from "./runtime.js";
import { COUNTERSIGN_HEADER, decodeCountersign, type Countersign } from "./receipt.js";

/** The tool's countersignature, if the tool sent one (see `countersignPaidCall`). */
export function readCountersign(res: Response): Countersign | null {
  const raw = res.headers.get(COUNTERSIGN_HEADER);
  return raw ? decodeCountersign(raw) : null;
}

export type Settlement = {
  success: boolean;
  transaction: `0x${string}`;
  network: string;
  payer?: string;
};

/** Decode x402's PAYMENT-RESPONSE header (base64 JSON). */
export function readSettlement(res: Response): Settlement | null {
  const raw = res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Settlement;
  } catch {
    return null;
  }
}

/**
 * A fetch that pays x402 402s on Monad with the runtime key. Spend control:
 * only this network's USDC, at most `maxPerCall` atomic units per payment
 * (default 0.05 USDC). The balance is the overall limit.
 */
export function payingFetch(
  network: NetworkName,
  account: RuntimeAccount,
  opts: { maxPerCall?: bigint } = {},
): typeof fetch {
  const { publicClient } = clients(network, account);
  const n = networks[network];
  const signer = toClientEvmSigner(account, publicClient);
  const client = x402Client.fromConfig({
    schemes: [{ network: `eip155:${n.chain.id}`, client: new ExactEvmScheme(signer) }],
    spendControls: {
      allowedAssets: [
        { network: `eip155:${n.chain.id}`, asset: n.usdc, maxAmountPerPayment: (opts.maxPerCall ?? 50_000n).toString() },
      ],
    },
  });
  return wrapFetchWithPayment(fetch, client);
}

export type PaidCall = {
  answer: string;
  settlement: Settlement;
  status: number;
};

/**
 * Call a paid tool and stamp it. Returns null for the stamp when the call
 * did not settle (no payment, no stamp); the failure is the caller's to
 * report to the owner as self-reported.
 */
export async function callAndStamp(input: {
  fetch: typeof fetch;
  url: string;
  tool: string;
  platform: string;
  amount: bigint;
  asset: `0x${string}`;
  stamper: Stamper;
  init?: RequestInit;
  request?: unknown;
}): Promise<{ call: PaidCall | null; stamp: StampResult | null; error?: string }> {
  const res = await input.fetch(input.url, input.init);
  const answer = await res.text();
  const settlement = readSettlement(res);

  if (!res.ok || !settlement?.success || !settlement.transaction) {
    return {
      call: null,
      stamp: null,
      error: !res.ok ? `tool returned ${res.status}` : "no settlement in response",
    };
  }

  const stamp = await input.stamper.stamp({
    tool: input.tool,
    platform: input.platform,
    amount: input.amount,
    asset: input.asset,
    settlementTx: settlement.transaction,
    answer,
    request: input.request,
    meta: { url: input.url, status: res.status },
    countersign: readCountersign(res),
  });

  return { call: { answer, settlement, status: res.status }, stamp };
}
