// Owner side of pairing: decode the runtime's code and submit the ERC-8004
// agentWallet proof from the passkey session.

import type { PublicClient, WalletClient } from "viem";
import { addresses } from "./chain";
import { identityRegistryAbi } from "./erc8004";

export type PairingPayload = {
  v: 1;
  network: string;
  agentId: string;
  wallet: `0x${string}`;
  owner: `0x${string}`;
  deadline: number;
  signature: `0x${string}`;
};

export function decodePairing(code: string): PairingPayload {
  const b64 = code.trim().replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    Array.from(atob(b64), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
  );
  const p = JSON.parse(json) as PairingPayload;
  if (p.v !== 1 || !p.agentId || !p.wallet || !p.signature || !p.deadline) {
    throw new Error("That is not a Kleos pairing code.");
  }
  if (p.deadline * 1000 < Date.now()) throw new Error("This pairing code has expired. Run `kleos pair` again.");
  return p;
}

/** Submit setAgentWallet. The registry verifies the runtime's signature itself. */
export async function connectRuntime(input: {
  payload: PairingPayload;
  wallet: WalletClient;
  publicClient: PublicClient;
}): Promise<`0x${string}`> {
  const { payload } = input;
  const account = input.wallet.account!;
  if (payload.owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error("This code was made for a different owner. Sign in with the passkey that registered the agent.");
  }
  const hash = await input.wallet.writeContract({
    account,
    chain: input.wallet.chain,
    address: addresses.identityRegistry,
    abi: identityRegistryAbi,
    functionName: "setAgentWallet",
    args: [BigInt(payload.agentId), payload.wallet, BigInt(payload.deadline), payload.signature],
  });
  await input.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Revoke: the registry clears agentWallet; existing stamps stay verifiable. */
export async function disconnectRuntime(input: {
  agentId: bigint;
  wallet: WalletClient;
  publicClient: PublicClient;
}): Promise<`0x${string}`> {
  const account = input.wallet.account!;
  const hash = await input.wallet.writeContract({
    account,
    chain: input.wallet.chain,
    address: addresses.identityRegistry,
    abi: identityRegistryAbi,
    functionName: "unsetAgentWallet",
    args: [input.agentId],
  });
  await input.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
