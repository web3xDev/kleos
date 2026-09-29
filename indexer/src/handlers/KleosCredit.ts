// KleosCredit: work served before payment. Each invoice is opened with the
// agent's consent and closed by the stamp of its payment; one still open past
// its due date is the agent's unpaid debt, visible to anyone.

import { indexer } from "envio";
import { emptyAgent, emptyNetwork } from "./shared";

indexer.onEvent({ contract: "KleosCredit", event: "InvoiceOpened" }, async ({ event, context }) => {
  const p = event.params;
  const agentId = p.agentId.toString();

  context.Invoice.set({
    id: p.invoiceId.toLowerCase(),
    agent_id: agentId,
    creditor: p.creditor.toLowerCase(),
    amount: p.amount,
    tool: p.tool,
    openedAt: event.block.timestamp,
    dueAt: Number(p.dueAt),
    paidAt: undefined,
    receiptHash: undefined,
    openTx: event.transaction.hash,
  });

  const agent = (await context.Agent.get(agentId)) ?? emptyAgent(agentId, event.block);
  context.Agent.set({ ...agent, invoiceCount: agent.invoiceCount + 1 });

  const net = await context.Network.getOrCreate(emptyNetwork);
  context.Network.set({ ...net, invoices: net.invoices + 1 });
});

indexer.onEvent({ contract: "KleosCredit", event: "InvoicePaid" }, async ({ event, context }) => {
  const p = event.params;
  const invoice = await context.Invoice.get(p.invoiceId.toLowerCase());
  if (invoice) context.Invoice.set({ ...invoice, paidAt: Number(p.paidAt), receiptHash: p.receiptHash.toLowerCase() });

  const agentId = p.agentId.toString();
  const agent = (await context.Agent.get(agentId)) ?? emptyAgent(agentId, event.block);
  context.Agent.set({ ...agent, invoicesPaid: agent.invoicesPaid + 1 });
});
