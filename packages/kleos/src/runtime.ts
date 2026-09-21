// The runtime side: the key that acts for an agent, the pairing proof the
// owner approves, and the stamper that records every paid action.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  META_ENCRYPTION_KEY,
  agentWalletDomain,
  agentWalletTypes,
  identityRegistryAbi,
  kleosStampsAbi,
  networks,
  type NetworkName,
} from "./chain.js";
import { seal, type Sealed } from "./crypto.js";
import {
  answerHash,
  receiptHash,
  signingMessage,
  type Receipt,
  type ReceiptPrivate,
  type ReceiptPublic,
} from "./receipt.js";

export const DEFAULT_KLEOS_URL = "https://kleos.xyz";

/**
 * Runtime key file. One key per runtime, on the machine that runs the agent.
 * Losing it means pairing again; nothing else depends on it.
 */
export function runtimeKeyPath(): string {
  return process.env.KLEOS_RUNTIME_KEY_PATH ?? join(homedir(), ".kleos", "runtime.json");
}

export function loadOrCreateRuntimeKey(): PrivateKeyAccount {
  const path = runtimeKeyPath();
  try {
    const { privateKey } = JSON.parse(readFileSync(path, "utf8")) as { privateKey: Hex };
    return privateKeyToAccount(privateKey);
  } catch {
    const privateKey = generatePrivateKey();
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify({ privateKey }, null, 2), { mode: 0o600 });
    return privateKeyToAccount(privateKey);
  }
}

export type Clients = { publicClient: PublicClient; wallet: WalletClient; account: PrivateKeyAccount };

export function clients(network: NetworkName, account: PrivateKeyAccount): Clients {
  const { chain } = networks[network];
  return {
    account,
    publicClient: createPublicClient({ chain, transport: http() }),
    wallet: createWalletClient({ account, chain, transport: http() }),
  };
}

/** What the owner pastes into Kleos to approve this runtime. */
export type PairingPayload = {
  v: 1;
  network: NetworkName;
  agentId: string;
  wallet: `0x${string}`;
  owner: `0x${string}`;
  deadline: number;
  signature: Hex;
};

/**
 * Build the ERC-8004 agentWallet proof: this runtime signs "I am agent N's
 * wallet" for the current owner, valid for a few minutes. The owner submits
 * it to the registry with their passkey session; the registry checks the
 * signature. No Kleos server is trusted anywhere in this step.
 */
export async function pair(network: NetworkName, agentId: bigint, account: PrivateKeyAccount): Promise<PairingPayload> {
  const { publicClient } = clients(network, account);
  const owner = await publicClient.readContract({
    address: networks[network].identityRegistry,
    abi: identityRegistryAbi,
    functionName: "ownerOf",
    args: [agentId],
  });
  // The registry allows at most 5 minutes; leave margin for the owner to paste it.
  const deadline = Math.floor(Date.now() / 1000) + 4 * 60;
  const signature = await account.signTypedData({
    domain: agentWalletDomain(network),
    types: agentWalletTypes,
    primaryType: "AgentWalletSet",
    message: { agentId, newWallet: account.address, owner, deadline: BigInt(deadline) },
  });
  return { v: 1, network, agentId: agentId.toString(), wallet: account.address, owner, deadline, signature };
}

export function encodePairing(p: PairingPayload): string {
  return Buffer.from(JSON.stringify(p)).toString("base64url");
}

export function decodePairing(code: string): PairingPayload {
  const p = JSON.parse(Buffer.from(code.trim(), "base64url").toString("utf8")) as PairingPayload;
  if (p.v !== 1 || !p.agentId || !p.wallet || !p.signature) throw new Error("not a Kleos pairing code");
  return p;
}

export type StampInput = {
  tool: string;
  platform: string;
  /** Amount paid, atomic units of `asset`. */
  amount: bigint;
  asset: `0x${string}`;
  settlementTx: `0x${string}`;
  answer: string;
  request?: unknown;
  meta?: Record<string, unknown>;
};

export type StampResult = {
  receiptHash: Hex;
  anchorTx: Hex;
  receipt: Receipt;
};

export type StamperOptions = {
  network?: NetworkName;
  agentId: bigint;
  account: PrivateKeyAccount;
  /** Where sealed receipts are stored. Untrusted: it only ever sees ciphertext. */
  kleosUrl?: string;
  /** Owner encryption pubkey; read from the agent's ERC-8004 metadata when omitted. */
  ownerPublicKey?: string;
};

/**
 * Records paid actions for one agent. Each `stamp()` signs a receipt, seals
 * its body to the owner, stores the ciphertext, and anchors the hash next to
 * the settlement on Monad.
 */
export class Stamper {
  private readonly network: NetworkName;
  private readonly agentId: bigint;
  private readonly c: Clients;
  private readonly kleosUrl: string;
  private ownerPublicKey?: string;

  constructor(opts: StamperOptions) {
    this.network = opts.network ?? "monad-testnet";
    this.agentId = opts.agentId;
    this.c = clients(this.network, opts.account);
    this.kleosUrl = (opts.kleosUrl ?? process.env.KLEOS_URL ?? DEFAULT_KLEOS_URL).replace(/\/$/, "");
    this.ownerPublicKey = opts.ownerPublicKey;
  }

  get address(): `0x${string}` {
    return this.c.account.address;
  }

  private async ownerKey(): Promise<string> {
    if (this.ownerPublicKey) return this.ownerPublicKey;
    const raw = await this.c.publicClient.readContract({
      address: networks[this.network].identityRegistry,
      abi: identityRegistryAbi,
      functionName: "getMetadata",
      args: [this.agentId, META_ENCRYPTION_KEY],
    });
    if (raw === "0x") throw new Error(`agent ${this.agentId} has no ${META_ENCRYPTION_KEY}; register it through Kleos`);
    // Stored as raw 33 bytes.
    this.ownerPublicKey = bytesToHex(hexToBytes(raw.slice(2)));
    return this.ownerPublicKey;
  }

  /** Is this runtime the agent's wallet right now? False after a revoke. */
  async isPaired(): Promise<boolean> {
    const wallet = await this.c.publicClient.readContract({
      address: networks[this.network].identityRegistry,
      abi: identityRegistryAbi,
      functionName: "getAgentWallet",
      args: [this.agentId],
    });
    return wallet.toLowerCase() === this.address.toLowerCase();
  }

  async stamp(input: StampInput): Promise<StampResult> {
    const pub: ReceiptPublic = {
      v: 1,
      network: this.network,
      agentId: this.agentId.toString(),
      wallet: this.address,
      tool: input.tool,
      platform: input.platform,
      amount: input.amount.toString(),
      asset: input.asset,
      settlementTx: input.settlementTx,
      answerHash: answerHash(input.answer),
      timestamp: Math.floor(Date.now() / 1000),
    };
    const signature = await this.c.account.signMessage({ message: signingMessage(pub) });
    const receipt: Receipt = { ...pub, signature };
    const hash = receiptHash(pub);

    const priv: ReceiptPrivate = { answer: input.answer, request: input.request, meta: input.meta };
    const sealed = seal(utf8ToBytes(JSON.stringify(priv)), await this.ownerKey());

    // Store first, anchor second: an anchored hash with no body is a stamp
    // whose answer the owner can never read; a stored body with no anchor is
    // just an orphan blob.
    await this.store(hash, receipt, sealed);

    const anchorTx = await this.c.wallet.writeContract({
      account: this.c.account,
      chain: networks[this.network].chain,
      address: networks[this.network].kleosStamps,
      abi: kleosStampsAbi,
      functionName: "stamp",
      args: [this.agentId, hash, input.settlementTx, input.tool, input.platform, input.amount],
    });
    await this.c.publicClient.waitForTransactionReceipt({ hash: anchorTx });

    return { receiptHash: hash, anchorTx, receipt };
  }

  private async store(hash: Hex, receipt: Receipt, sealed: Sealed): Promise<void> {
    const res = await fetch(`${this.kleosUrl}/api/stamps`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ receiptHash: hash, receipt, sealed }),
    });
    if (!res.ok) throw new Error(`kleos store failed: ${res.status} ${await res.text()}`);
  }
}
