// The Privy-guarded demo agent: its runtime is a Privy server wallet, so every
// signature it makes (receipts, x402 payments, stamps) is checked by Privy
// against the wallet's spending policy first. Server only.

import { privyAccount } from "kleos-sdk";
import type { LocalAccount } from "viem";

const env = () => ({
  appId: process.env.PRIVY_APP_ID,
  appSecret: process.env.PRIVY_APP_SECRET,
  walletId: process.env.PRIVY_WALLET_ID,
  address: process.env.PRIVY_WALLET_ADDRESS as `0x${string}` | undefined,
  policyId: process.env.PRIVY_POLICY_ID,
});

/** The Privy runtime account, or null when Privy is not configured. */
export function privyRuntime(): LocalAccount | null {
  const { appId, appSecret, walletId, address } = env();
  if (!appId || !appSecret || !walletId || !address) return null;
  return privyAccount({ appId, appSecret, walletId, address });
}

export type SpendingRule = { name: string; method: string; action: string; conditions: { field: string; operator: string; value: string }[] };
export type SpendingRules = { wallet: string; policy: string; name: string; rules: SpendingRule[] };

/** The wallet's policy as Privy holds it: what it lets this runtime sign. */
export async function spendingRules(): Promise<SpendingRules | null> {
  const { appId, appSecret, address, policyId } = env();
  if (!appId || !appSecret || !address || !policyId) return null;
  const res = await fetch(`https://api.privy.io/v1/policies/${policyId}`, {
    headers: {
      "privy-app-id": appId,
      authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const p = (await res.json()) as {
    id: string;
    name: string;
    rules: { name: string; method: string; action: string; conditions?: { field: string; operator: string; value: unknown }[] }[];
  };
  return {
    wallet: address,
    policy: p.id,
    name: p.name,
    rules: p.rules.map((r) => ({
      name: r.name,
      method: r.method,
      action: r.action,
      conditions: (r.conditions ?? []).map((c) => ({ field: c.field, operator: c.operator, value: String(c.value) })),
    })),
  };
}
