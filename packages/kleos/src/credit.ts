// Pay later with a track record. A tool reads an agent's Kleos record from
// chain and, by its own rule, serves it before payment. The credit becomes an
// invoice on KleosCredit: opened with the agent's signed consent, closed by
// the stamp of the payment. Unpaid invoices stay visible past their due date.
//
// Wire format (all base64url JSON, except the signature header):
//   402 body `{ kleosCredit: CreditTerms }`   tool → agent: what credit it offers
//   X-Kleos-Credit: CreditRequest               agent → tool: signed consent to be invoiced
//   X-Kleos-Invoice: InvoiceNotice              tool → agent: the invoice it opened
//   X-Kleos-Paid: 0x… signature                 tool → agent, on the paid invoice call:
//                                               "I was paid for this invoice" (EIP-712)

import type { LocalAccount, PublicClient } from "viem";
import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import {
  creditDomain,
  creditRequestTypes,
  identityRegistryAbi,
  kleosCreditAbi,
  kleosStampsAbi,
  networks,
  paymentReceivedTypes,
  type NetworkName,
} from "./chain.js";
import { clients, type Stamper, type StampResult } from "./runtime.js";
import { readCountersign, readSettlement } from "./x402.js";

export const CREDIT_HEADER = "x-kleos-credit";
export const INVOICE_HEADER = "x-kleos-invoice";
export const PAID_HEADER = "x-kleos-paid";

/** What a tool offers: its terms and the rule it applies to the agent's record. */
export type CreditTerms = {
  v: 1;
  network: NetworkName;
  creditor: `0x${string}`; // the tool's address: opens the invoice and receives the payment
  amount: string; // atomic units of asset
  asset: `0x${string}`;
  tool: string;
  dueInSeconds: number;
  rule: { minVerifiedActions: number; maxOverdueInvoices: number };
};

/** The agent's EIP-712 consent, as KleosCredit.open expects it. */
export type CreditRequest = {
  v: 1;
  agentId: string;
  creditor: `0x${string}`;
  amount: string;
  dueAt: number;
  invoiceId: `0x${string}`;
  tool: string;
  signature: `0x${string}`;
};

export type InvoiceNotice = {
  v: 1;
  invoiceId: `0x${string}`;
  agentId: string;
  amount: string;
  dueAt: number;
  openTx: `0x${string}`;
  payUrl: string;
};

/** What the chain says about an agent, for a credit decision. */
export type AgentRecord = {
  agentId: string;
  verifiedActions: number;
  invoices: { total: number; open: number; overdue: number; paidLate: number };
};

export type CreditDecision = { granted: boolean; reason: string; record: AgentRecord };

const enc = (x: unknown) => Buffer.from(JSON.stringify(x)).toString("base64url");
function dec<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(Buffer.from(s.trim(), "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
export const encodeCredit = enc;
export const decodeCreditRequest = (s: string | null) => dec<CreditRequest>(s);
export const decodeInvoiceNotice = (s: string | null) => dec<InvoiceNotice>(s);

/* ------------------------------------------------------------------ */
/* Tool side                                                           */
/* ------------------------------------------------------------------ */

/** Read an agent's record straight from chain: anchored stamps and invoice history. */
export async function readAgentRecord(publicClient: PublicClient, network: NetworkName, agentId: bigint): Promise<AgentRecord> {
  const n = networks[network];
  const [count, ids] = await Promise.all([
    publicClient.readContract({ address: n.kleosStamps, abi: kleosStampsAbi, functionName: "stampCount", args: [agentId] }),
    publicClient.readContract({ address: n.kleosCredit, abi: kleosCreditAbi, functionName: "invoicesOf", args: [agentId] }),
  ]);
  const invoices = ids.length
    ? await publicClient.multicall({
        allowFailure: false,
        contracts: ids.map((id) => ({ address: n.kleosCredit, abi: kleosCreditAbi, functionName: "getInvoice" as const, args: [id] })),
      })
    : [];
  const now = BigInt(Math.floor(Date.now() / 1000));
  return {
    agentId: agentId.toString(),
    verifiedActions: Number(count),
    invoices: {
      total: invoices.length,
      open: invoices.filter((i) => i.paidAt === 0n && i.dueAt >= now).length,
      overdue: invoices.filter((i) => i.paidAt === 0n && i.dueAt < now).length,
      paidLate: invoices.filter((i) => i.paidAt !== 0n && i.paidAt > i.dueAt).length,
    },
  };
}

/**
 * Kleos Engine v0: the tool's own rule, applied to the record. Kleos gives the
 * facts; the tool sets the bar. Later versions score the record (counterparty
 * spread, payment timeliness, self-dealing patterns) instead of a fixed rule.
 */
export function decideCredit(record: AgentRecord, rule: CreditTerms["rule"]): CreditDecision {
  if (record.verifiedActions < rule.minVerifiedActions) {
    return { granted: false, reason: `${record.verifiedActions} verified actions, rule needs ${rule.minVerifiedActions}`, record };
  }
  if (record.invoices.overdue > rule.maxOverdueInvoices) {
    return { granted: false, reason: `${record.invoices.overdue} unpaid overdue invoice(s)`, record };
  }
  return { granted: true, reason: `${record.verifiedActions} verified actions, no unpaid invoices`, record };
}

/**
 * Check a credit request against the terms and the chain, and if granted, open
 * the invoice on KleosCredit from the tool's account. KleosCredit itself
 * rejects a consent not signed by the agent's wallet.
 */
export async function grantCredit(input: {
  account: LocalAccount; // the creditor (tool) key
  network: NetworkName;
  terms: CreditTerms;
  request: CreditRequest;
  payUrl: string;
}): Promise<{ decision: CreditDecision; invoice?: InvoiceNotice }> {
  const { account, network, terms, request: r } = input;
  const { publicClient, wallet } = clients(network, account);
  const agentId = BigInt(r.agentId);

  const record = await readAgentRecord(publicClient, network, agentId);
  const decision = decideCredit(record, terms.rule);
  if (!decision.granted) return { decision };

  // The request must be for exactly these terms.
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  if (!same(r.creditor, terms.creditor) || r.amount !== terms.amount || r.tool !== terms.tool || r.dueAt > now + terms.dueInSeconds + 60 || r.dueAt <= now) {
    return { decision: { granted: false, reason: "request does not match the terms", record } };
  }
  const agentWallet = await publicClient.readContract({
    address: networks[network].identityRegistry,
    abi: identityRegistryAbi,
    functionName: "getAgentWallet",
    args: [agentId],
  });
  if (/^0x0{40}$/i.test(agentWallet)) return { decision: { granted: false, reason: "agent has no runtime to sign for it", record } };

  const openTx = await wallet.writeContract({
    account,
    chain: networks[network].chain,
    address: networks[network].kleosCredit,
    abi: kleosCreditAbi,
    functionName: "open",
    args: [agentId, BigInt(r.amount), BigInt(r.dueAt), r.invoiceId, r.tool, r.signature],
  });
  await publicClient.waitForTransactionReceipt({ hash: openTx });
  return {
    decision,
    invoice: { v: 1, invoiceId: r.invoiceId, agentId: r.agentId, amount: r.amount, dueAt: r.dueAt, openTx, payUrl: input.payUrl },
  };
}

/**
 * Tool side, on the paid invoice call: sign "I was paid for this invoice".
 * KleosCredit only closes an invoice with this signature from its creditor, so
 * an agent cannot close it with a payment that went somewhere else. Return it
 * in the PAID_HEADER of the paid response; x402 only delivers that response
 * once the payment settled.
 */
export async function acknowledgePayment(input: {
  account: LocalAccount; // the creditor (tool) key
  network: NetworkName;
  invoiceId: `0x${string}`;
  amount: bigint;
}): Promise<{ name: string; value: `0x${string}` }> {
  const value = await input.account.signTypedData({
    domain: creditDomain(input.network),
    types: paymentReceivedTypes,
    primaryType: "PaymentReceived",
    message: { invoiceId: input.invoiceId, amount: input.amount },
  });
  return { name: PAID_HEADER, value };
}

/* ------------------------------------------------------------------ */
/* Agent side                                                          */
/* ------------------------------------------------------------------ */

/** Sign consent to be invoiced on these terms. */
export async function requestCredit(input: {
  account: LocalAccount; // the agent's runtime (its ERC-8004 agentWallet)
  agentId: bigint;
  terms: CreditTerms;
}): Promise<CreditRequest> {
  const { account, agentId, terms } = input;
  const dueAt = Math.floor(Date.now() / 1000) + terms.dueInSeconds;
  const invoiceId = `0x${bytesToHex(randomBytes(32))}` as `0x${string}`;
  const signature = await account.signTypedData({
    domain: creditDomain(terms.network),
    types: creditRequestTypes,
    primaryType: "CreditRequest",
    message: { agentId, creditor: terms.creditor, amount: BigInt(terms.amount), dueAt: BigInt(dueAt), invoiceId, tool: terms.tool },
  });
  return { v: 1, agentId: agentId.toString(), creditor: terms.creditor, amount: terms.amount, dueAt, invoiceId, tool: terms.tool, signature };
}

/**
 * Pay an invoice: pay its x402 URL, stamp the payment (countersigned by the
 * tool), then close the invoice on KleosCredit with that stamp and the tool's
 * acknowledgement from the paid response.
 */
export async function payInvoice(input: {
  fetch: typeof fetch; // a paying fetch (payingFetch)
  invoice: InvoiceNotice;
  stamper: Stamper;
  account: LocalAccount;
  network: NetworkName;
  tool: string;
  platform: string;
  asset: `0x${string}`;
}): Promise<{ stamp: StampResult; settlementTx: `0x${string}`; closeTx: `0x${string}` }> {
  const res = await input.fetch(input.invoice.payUrl);
  const answer = await res.text();
  const settlement = readSettlement(res);
  if (!res.ok || !settlement?.success || !settlement.transaction) throw new Error(`invoice payment did not settle (${res.status})`);
  const creditorSig = res.headers.get(PAID_HEADER) as `0x${string}` | null;
  if (!creditorSig) throw new Error("the tool did not acknowledge the payment (no X-Kleos-Paid header); the invoice cannot close without it");

  const stamp = await input.stamper.stamp({
    tool: input.tool,
    platform: input.platform,
    amount: BigInt(input.invoice.amount),
    asset: input.asset,
    settlementTx: settlement.transaction,
    answer,
    meta: { invoiceId: input.invoice.invoiceId },
    countersign: readCountersign(res),
  });

  const { publicClient, wallet } = clients(input.network, input.account);
  const closeTx = await wallet.writeContract({
    account: input.account,
    chain: networks[input.network].chain,
    address: networks[input.network].kleosCredit,
    abi: kleosCreditAbi,
    functionName: "pay",
    args: [input.invoice.invoiceId, stamp.receiptHash, creditorSig],
  });
  await publicClient.waitForTransactionReceipt({ hash: closeTx });
  return { stamp, settlementTx: settlement.transaction, closeTx };
}
