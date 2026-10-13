// The runtime side: the key that acts for an agent, the pairing proof the
// owner approves, and the stamper that records every paid action.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { LocalAccount } from "viem";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
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
  answerCommitment,
  answerHash,
  caip2,
  countersigner,
  receiptHash,
  signingMessage,
  type Countersign,
  type Receipt,
  type ReceiptPrivate,
  type ReceiptPublic,
} from "./receipt.js";

export const DEFAULT_KLEOS_URL = "https://kleos.finance";

/**
 * Runtime key file. One key per runtime, on the machine that runs the agent.
 * Losing it means pairing again; nothing else depends on it.
 */
export function runtimeKeyPath(): string {
  return process.env.KLEOS_RUNTIME_KEY_PATH ?? join(homedir(), ".kleos", "runtime.json");
}

/**
 * The runtime's account. Any wallet the runtime already uses works: pass a
 * private key via `KLEOS_RUNTIME_KEY` (or `--key`), and no file is created.
 * Otherwise a key is created once at `runtimeKeyPath()`.
 */
export function loadOrCreateRuntimeKey(explicitKey?: Hex): PrivateKeyAccount {
  const fromEnv = explicitKey ?? (process.env.KLEOS_RUNTIME_KEY as Hex | undefined);
  if (fromEnv) return privateKeyToAccount(fromEnv);
  const path = runtimeKeyPath();
  try {
    // The key file is the runtime's own (~/.kleos), never part of an app bundle:
    // the comment tells bundlers (Turbopack) not to trace the project for it.
    const { privateKey } = JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8")) as { privateKey: Hex };
    return privateKeyToAccount(privateKey);
  } catch {
    const privateKey = generatePrivateKey();
    mkdirSync(/*turbopackIgnore: true*/ join(path, ".."), { recursive: true });
    writeFileSync(/*turbopackIgnore: true*/ path, JSON.stringify({ privateKey }, null, 2), { mode: 0o600 });
    return privateKeyToAccount(privateKey);
  }
}

export type RuntimeAccount = LocalAccount;

export type Clients = { publicClient: PublicClient; wallet: WalletClient; account: RuntimeAccount };

/**
 * KLEOS_RPC_URL (e.g. a provider endpoint) first, the chain's public RPC as a
 * fallback when it errors. Without it, the public RPC alone.
 */
export function rpcTransport() {
  const url = typeof process !== "undefined" ? process.env.KLEOS_RPC_URL : undefined;
  return url ? fallback([http(url), http()]) : http();
}

export function clients(network: NetworkName, account: RuntimeAccount): Clients {
  const { chain } = networks[network];
  return {
    account,
    publicClient: createPublicClient({ chain, transport: rpcTransport() }),
    wallet: createWalletClient({ account, chain, transport: rpcTransport() }),
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
export async function pair(network: NetworkName, agentId: bigint, account: RuntimeAccount): Promise<PairingPayload> {
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
  /** The tool's countersignature from its response (`readCountersign`). Makes a v2 receipt. */
  countersign?: Countersign | null;
};

export type StampResult = {
  receiptHash: Hex;
  anchorTx: Hex;
  receipt: Receipt;
};

export type StamperOptions = {
  network?: NetworkName;
  agentId: bigint;
  /** Any viem local account: a private key, or an adapter over a custodial signer. */
  account: RuntimeAccount;
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
    // Fresh salt per stamp: the public answerHash stays opaque even for
    // short or guessable answers. It travels in the sealed body.
    const answerSalt = `0x${bytesToHex(randomBytes(32))}` as const;
    const base = {
      network: this.network,
      agentId: this.agentId.toString(),
      wallet: this.address,
      tool: input.tool,
      platform: input.platform,
      amount: input.amount.toString(),
      asset: input.asset,
      settlementTx: input.settlementTx,
      answerHash: answerHash(input.answer, answerSalt),
      timestamp: Math.floor(Date.now() / 1000),
    };
    const cs = input.countersign ? await this.checkCountersign(input) : null;
    const pub: ReceiptPublic = cs
      ? { v: 2, ...base, payTo: cs.payTo, paymentNonce: cs.nonce, answerCommit: cs.answerCommit, toolSignature: cs.signature }
      : { v: 1, ...base };
    const signature = await this.c.account.signMessage({ message: signingMessage(pub) });
    const receipt: Receipt = { ...pub, signature };
    const hash = receiptHash(pub);

    const priv: ReceiptPrivate = { answer: input.answer, answerSalt, request: input.request, meta: input.meta, toolSalt: cs?.salt };
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

  /**
   * Only carry a countersignature that is really about this call: signed by
   * the address that was paid, for this payer, amount, asset and tool, and
   * committing to the answer we got. Anything else is dropped (the stamp is
   * then a plain v1), never stored as if it were valid.
   */
  private async checkCountersign(input: StampInput): Promise<Countersign | null> {
    const c = input.countersign!;
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    const ok =
      c.network === caip2(this.network) &&
      same(c.payer, this.address) &&
      same(c.asset, input.asset) &&
      c.amount === input.amount.toString() &&
      c.tool === input.tool &&
      c.answerCommit === answerCommitment(input.answer, c.salt) &&
      same(await countersigner(c, c.signature), c.payTo);
    return ok ? c : null;
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
