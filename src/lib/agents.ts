// Agent registration and lookup against the ERC-8004 Identity Registry.

import { decodeEventLog, parseEther, toHex, type PublicClient, type WalletClient } from "viem";
import { addresses } from "./chain";
import {
  META_ENCRYPTION_KEY,
  META_KEY_INDEX,
  hexToUtf8,
  identityRegistryAbi,
  parseRegistration,
  registrationUri,
} from "./erc8004";
import type { EncryptionKeys } from "./passkey";

export type Agent = {
  id: bigint;
  name: string;
  owner: `0x${string}`;
  // ERC-8004 agentWallet. register() defaults it to the owner, which is not a
  // runtime; we report null until the owner pairs a distinct signer.
  wallet: `0x${string}` | null;
  encryptionKey: `0x${string}` | null;
  keyIndex: number | null;
};

const ZERO = "0x0000000000000000000000000000000000000000";

const GAS_FLOOR = parseEther("0.05");

/**
 * Ask the drip endpoint to top up the owner on testnet, then wait until the
 * RPC actually reports the balance. A receipt can arrive a few seconds before
 * the node used for sending sees the new state; sending earlier fails with
 * "insufficient balance".
 */
export async function ensureGas(publicClient: PublicClient, address: `0x${string}`): Promise<void> {
  if ((await publicClient.getBalance({ address })) >= GAS_FLOOR) return;

  const res = await fetch("/api/drip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`gas drip failed: ${body.error ?? res.status}`);
  }

  for (let i = 0; i < 30; i++) {
    if ((await publicClient.getBalance({ address })) >= GAS_FLOOR) {
      // Monad checks a sender's balance against state a few blocks behind the
      // tip; a transfer that just landed can still read as "insufficient" to it.
      // Give it a few blocks before the caller sends its transaction.
      await new Promise((r) => setTimeout(r, 3000));
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("gas drip did not land in time, try again");
}

/**
 * Mint the agent. One transaction: the registration JSON as the token URI
 * plus Kleos metadata (encryption pubkey and the owner-local key index it
 * was derived from). Returns the new agent id from the Registered event.
 */
export async function registerAgent(input: {
  name: string;
  wallet: WalletClient;
  publicClient: PublicClient;
  encryption: EncryptionKeys;
  keyIndex: number;
}): Promise<Agent> {
  const { publicKey } = input.encryption.forIndex(input.keyIndex);
  const account = input.wallet.account!;

  const hash = await input.wallet.writeContract({
    account,
    chain: input.wallet.chain,
    address: addresses.identityRegistry,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [
      registrationUri({ name: input.name }),
      [
        { metadataKey: META_ENCRYPTION_KEY, metadataValue: publicKey },
        { metadataKey: META_KEY_INDEX, metadataValue: toHex(String(input.keyIndex)) },
      ],
    ],
  });
  const receipt = await input.publicClient.waitForTransactionReceipt({ hash });

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== addresses.identityRegistry.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: identityRegistryAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "Registered") {
        rememberAgent(account.address, ev.args.agentId);
        return {
          id: ev.args.agentId,
          name: input.name,
          owner: ev.args.owner,
          wallet: null,
          encryptionKey: publicKey,
          keyIndex: input.keyIndex,
        };
      }
    } catch {
      // not our event
    }
  }
  throw new Error("Registered event not found in receipt");
}

/** Read one agent straight from the registry. */
/**
 * One agent's identity, in a single multicall (one RPC request instead of
 * five, so the public RPC's rate limit is not hit when several agents load).
 * Retries transient failures; throws only if the chain keeps refusing.
 */
export async function loadAgent(publicClient: PublicClient, id: bigint): Promise<Agent> {
  let lastError: unknown;
  for (const wait of [0, 400, 1200]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      return await readAgent(publicClient, id);
    } catch (e) {
      // A revert is an answer (e.g. no such token), not a hiccup: do not retry it.
      if (/revert/i.test(String(e))) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

async function readAgent(publicClient: PublicClient, id: bigint): Promise<Agent> {
  const reg = { address: addresses.identityRegistry, abi: identityRegistryAbi } as const;
  const [owner, uri, wallet, encKey, keyIndex] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { ...reg, functionName: "ownerOf", args: [id] },
      { ...reg, functionName: "tokenURI", args: [id] },
      { ...reg, functionName: "getAgentWallet", args: [id] },
      { ...reg, functionName: "getMetadata", args: [id, META_ENCRYPTION_KEY] },
      { ...reg, functionName: "getMetadata", args: [id, META_KEY_INDEX] },
    ],
  });
  const card = parseRegistration(uri);
  return {
    id,
    name: card?.name ?? `Agent #${id}`,
    owner,
    wallet: wallet === ZERO || wallet.toLowerCase() === owner.toLowerCase() ? null : wallet,
    encryptionKey: encKey === "0x" ? null : encKey,
    keyIndex: keyIndex === "0x" ? null : Number(hexToUtf8(keyIndex)),
  };
}

// Local cache of agent ids per owner. A convenience only: a fresh device
// rebuilds the list from chain: the registry listing (Envio HyperSync) is the source of truth.
function cacheKey(owner: string) {
  return `kleos.agents.${owner.toLowerCase()}`;
}

export function rememberAgent(owner: string, id: bigint): void {
  try {
    const ids = new Set(cachedAgentIds(owner).map(String));
    ids.add(String(id));
    localStorage.setItem(cacheKey(owner), JSON.stringify([...ids]));
  } catch {
    // untrusted storage
  }
}

export function cachedAgentIds(owner: string): bigint[] {
  try {
    const raw = localStorage.getItem(cacheKey(owner));
    return raw ? (JSON.parse(raw) as string[]).map(BigInt) : [];
  } catch {
    return [];
  }
}
