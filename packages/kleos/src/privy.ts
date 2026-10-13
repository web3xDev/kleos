// A Privy server wallet as the agent's runtime account. Privy holds the key and
// enforces the wallet's policy (spending rules) before it signs anything; the
// runtime only asks. The result is a viem account, so Stamper, payingFetch and
// the credit flow use it unchanged.
//
// Uses Privy's REST API (POST /v1/wallets/{id}/rpc) with the app's credentials.
// Server only: the app secret must never reach a browser.

import { getTypesForEIP712Domain, toHex, type Hex, type LocalAccount, type TypedDataDefinition } from "viem";
import { toAccount } from "viem/accounts";
import { PRIVY_API as API, authorizationSignature } from "./privy-auth.js";

export type PrivyConfig = {
  appId: string;
  appSecret: string;
  /** The server wallet's Privy id. */
  walletId: string;
  /** Its address, so signing needs no extra lookup. */
  address: `0x${string}`;
  /**
   * The signer's P-256 secret, when the wallet has an owner: requests are then
   * authorized as that signer, and Privy holds them to the signer's policy.
   */
  signerKey?: Uint8Array;
};

/** JSON with bigints as decimal strings, the way Privy's API takes them. */
const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

async function rpc<T>(cfg: PrivyConfig, body: Record<string, unknown>): Promise<T> {
  const url = `${API}/wallets/${cfg.walletId}/rpc`;
  const sent = json(body);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "privy-app-id": cfg.appId,
      authorization: `Basic ${Buffer.from(`${cfg.appId}:${cfg.appSecret}`).toString("base64")}`,
      // Signed over exactly the body that is sent.
      ...(cfg.signerKey
        ? { "privy-authorization-signature": authorizationSignature(cfg.signerKey, { method: "POST", url, body: JSON.parse(sent), appId: cfg.appId }) }
        : {}),
    },
    body: sent,
  });
  const text = await res.text();
  // A policy refusal comes back as an error here: the runtime cannot get around it.
  if (!res.ok) throw new Error(`Privy refused ${String(body.method)} (${res.status}): ${text.slice(0, 200)}`);
  return (JSON.parse(text) as { data: T }).data;
}

/** A viem account whose every signature is made, under policy, by a Privy server wallet. */
export function privyAccount(cfg: PrivyConfig): LocalAccount {
  return toAccount({
    address: cfg.address,

    async signMessage({ message }) {
      const hex = typeof message === "string" ? toHex(message) : typeof message.raw === "string" ? message.raw : toHex(message.raw);
      const out = await rpc<{ signature: Hex }>(cfg, { method: "personal_sign", params: { message: hex, encoding: "hex" } });
      return out.signature;
    },

    async signTypedData(def) {
      const { domain = {}, types, primaryType, message } = def as TypedDataDefinition;
      const out = await rpc<{ signature: Hex }>(cfg, {
        method: "eth_signTypedData_v4",
        params: {
          typed_data: {
            domain,
            types: { EIP712Domain: getTypesForEIP712Domain({ domain }), ...types },
            primary_type: primaryType,
            message,
          },
        },
      });
      return out.signature;
    },

    async signTransaction(tx) {
      const out = await rpc<{ signed_transaction: Hex }>(cfg, {
        method: "eth_signTransaction",
        params: {
          transaction: {
            to: tx.to ?? undefined,
            value: tx.value !== undefined ? toHex(tx.value) : undefined,
            data: tx.data,
            chain_id: tx.chainId,
            nonce: tx.nonce,
            gas_limit: tx.gas !== undefined ? toHex(tx.gas) : undefined,
            max_fee_per_gas: "maxFeePerGas" in tx && tx.maxFeePerGas !== undefined ? toHex(tx.maxFeePerGas) : undefined,
            max_priority_fee_per_gas:
              "maxPriorityFeePerGas" in tx && tx.maxPriorityFeePerGas !== undefined ? toHex(tx.maxPriorityFeePerGas) : undefined,
            type: 2,
          },
        },
      });
      return out.signed_transaction;
    },
  }) as LocalAccount;
}
