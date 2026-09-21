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
    if ((await publicClient.getBalance({ address })) >= GAS_FLOOR) return;
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
export async function loadAgent(publicClient: PublicClient, id: bigint): Promise<Agent> {
  const reg = { address: addresses.identityRegistry, abi: identityRegistryAbi } as const;
  const [owner, uri, wallet, encKey, keyIndex] = await Promise.all([
    publicClient.readContract({ ...reg, functionName: "ownerOf", args: [id] }),
    publicClient.readContract({ ...reg, functionName: "tokenURI", args: [id] }),
    publicClient.readContract({ ...reg, functionName: "getAgentWallet", args: [id] }),
    publicClient.readContract({ ...reg, functionName: "getMetadata", args: [id, META_ENCRYPTION_KEY] }),
    publicClient.readContract({ ...reg, functionName: "getMetadata", args: [id, META_KEY_INDEX] }),
  ]);
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
// rebuilds the list from chain (HyperSync) once that path is wired.
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
