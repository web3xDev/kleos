// Invoices as the site sees them: read in the browser from KleosCredit.
// Work served before payment; open until a stamp closes it, overdue after its
// due date. Nothing here asks Kleos.

import { parseAbi, type PublicClient } from "viem";
import { addresses } from "./chain";

export const kleosCreditAbi = parseAbi([
  "function invoicesOf(uint256 agentId) view returns (bytes32[])",
  "function getInvoice(bytes32 invoiceId) view returns ((uint256 agentId, address creditor, uint256 amount, uint64 openedAt, uint64 dueAt, uint64 paidAt, bytes32 receiptHash, string tool))",
]);

export type InvoiceStatus = "open" | "overdue" | "paid" | "paid-late";

export type Invoice = {
  id: `0x${string}`;
  creditor: `0x${string}`;
  amount: bigint;
  openedAt: number;
  dueAt: number;
  paidAt: number | null;
  receiptHash: `0x${string}` | null;
  tool: string;
};

export function invoiceStatus(inv: Invoice, now = Math.floor(Date.now() / 1000)): InvoiceStatus {
  if (inv.paidAt !== null) return inv.paidAt > inv.dueAt ? "paid-late" : "paid";
  return now > inv.dueAt ? "overdue" : "open";
}

/** Every invoice opened for an agent, newest first. */
export async function fetchInvoices(publicClient: PublicClient, agentId: bigint): Promise<Invoice[]> {
  const ids = await publicClient.readContract({
    address: addresses.kleosCredit,
    abi: kleosCreditAbi,
    functionName: "invoicesOf",
    args: [agentId],
  });
  if (!ids.length) return [];
  const rows = await publicClient.multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({ address: addresses.kleosCredit, abi: kleosCreditAbi, functionName: "getInvoice" as const, args: [id] })),
  });
  return rows
    .map((r, i) => ({
      id: ids[i],
      creditor: r.creditor,
      amount: r.amount,
      openedAt: Number(r.openedAt),
      dueAt: Number(r.dueAt),
      paidAt: r.paidAt === 0n ? null : Number(r.paidAt),
      receiptHash: r.paidAt === 0n ? null : r.receiptHash,
      tool: r.tool,
    }))
    .sort((a, b) => b.openedAt - a.openedAt);
}

/** "3 min", "2 h", "4 d": for "due in …" and "… overdue". */
export function span(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}
