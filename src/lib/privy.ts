// The Privy-guarded demo agent: its runtime is a Privy server wallet, so every
// signature it makes (receipts, x402 payments, stamps) is checked by Privy
// against the wallet's spending policy first. Server only.
//
// Once locked, the wallet and its policy are owned by a P-256 key derived from
// the agent owner's passkey: only Touch ID can change the rules. The server
// signs everyday requests as an additional signer, held to the policy.

import { privyAccount, secretFromPkcs8 } from "kleos-sdk";
import type { LocalAccount } from "viem";

const API = "https://api.privy.io/v1";

const env = () => ({
  appId: process.env.PRIVY_APP_ID,
  appSecret: process.env.PRIVY_APP_SECRET,
  walletId: process.env.PRIVY_WALLET_ID,
  address: process.env.PRIVY_WALLET_ADDRESS as `0x${string}` | undefined,
  policyId: process.env.PRIVY_POLICY_ID,
  signerId: process.env.PRIVY_SIGNER_ID,
  signerKey: process.env.PRIVY_SIGNER_KEY,
});

const basic = (appId: string, appSecret: string) => `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`;

/** The Privy runtime account, or null when Privy is not configured. */
export function privyRuntime(): LocalAccount | null {
  const { appId, appSecret, walletId, address, signerKey } = env();
  if (!appId || !appSecret || !walletId || !address) return null;
  return privyAccount({ appId, appSecret, walletId, address, signerKey: signerKey ? secretFromPkcs8(signerKey) : undefined });
}

/** A request to Privy's API with the app's credentials, plus an authorization signature when given. */
export async function privyApi(method: "GET" | "POST" | "PATCH", path: string, body?: unknown, signature?: string) {
  const { appId, appSecret } = env();
  if (!appId || !appSecret) throw new Error("Privy is not configured");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "privy-app-id": appId,
      authorization: basic(appId, appSecret),
      ...(signature ? { "privy-authorization-signature": signature } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Privy ${method} ${path} (${res.status}): ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export const privyIds = () => {
  const { appId, walletId, policyId, signerId } = env();
  return { appId, walletId, policyId, signerId };
};

type RawCondition = { field_source: string; field: string; operator: string; value: unknown; typed_data?: unknown };
type RawRule = { id?: string; name: string; method: string; action: string; conditions?: RawCondition[] };

export type SpendingRule = { name: string; method: string; action: string; conditions: { field: string; operator: string; value: string }[] };
export type SpendingRules = {
  wallet: string;
  policy: string;
  name: string;
  rules: SpendingRule[];
  /** True once the policy is owned by the agent owner's passkey key: only Touch ID can change it. */
  locked: boolean;
  /** For the owner's browser, which signs a policy update itself. Not a secret. */
  appId: string;
  /** The rules as Privy holds them (ids stripped), the base for an update. */
  raw: Omit<RawRule, "id">[];
};

/** The wallet's policy as Privy holds it: what it lets this runtime sign, and who may change it. */
export async function spendingRules(): Promise<SpendingRules | null> {
  const { appId, appSecret, address, policyId } = env();
  if (!appId || !appSecret || !address || !policyId) return null;
  const p = (await privyApi("GET", `/policies/${policyId}`)) as { id: string; name: string; owner_id?: string | null; rules: RawRule[] };
  return {
    wallet: address,
    policy: p.id,
    name: p.name,
    locked: Boolean(p.owner_id),
    appId,
    // Privy's rule ids are not part of an update body.
    raw: p.rules.map((r) => ({ name: r.name, method: r.method, action: r.action, conditions: r.conditions })),
    rules: p.rules.map((r) => ({
      name: r.name,
      method: r.method,
      action: r.action,
      conditions: (r.conditions ?? []).map((c) => ({ field: c.field, operator: c.operator, value: String(c.value) })),
    })),
  };
}
