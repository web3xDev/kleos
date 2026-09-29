// KleosStamps: every anchored stamp, and the running totals the site shows
// (per agent and for the whole network). Only anchored stamps exist here, so
// the chain, not Kleos's store, decides what counts as a verified action.

import { indexer } from "envio";
import { emptyAgent, emptyNetwork } from "./shared";

indexer.onEvent({ contract: "KleosStamps", event: "Stamped" }, async ({ event, context }) => {
  const p = event.params;
  const agentId = p.agentId.toString();

  context.Stamp.set({
    id: p.receiptHash.toLowerCase(),
    agent_id: agentId,
    settlementTx: p.settlementTx.toLowerCase(),
    tool: p.tool,
    platform: p.platform,
    amount: p.amount,
    wallet: p.wallet.toLowerCase(),
    timestamp: Number(p.timestamp),
    anchorTx: event.transaction.hash,
    blockNumber: event.block.number,
  });

  const agent = (await context.Agent.get(agentId)) ?? emptyAgent(agentId, event.block);
  const first = agent.stampCount === 0;
  context.Agent.set({
    ...agent,
    stampCount: agent.stampCount + 1,
    usdcSettled: agent.usdcSettled + p.amount,
    lastStampAt: Number(p.timestamp),
  });

  const net = await context.Network.getOrCreate(emptyNetwork);
  context.Network.set({
    ...net,
    stamps: net.stamps + 1,
    usdcSettled: net.usdcSettled + p.amount,
    agentsWithRecord: net.agentsWithRecord + (first ? 1 : 0),
  });
});
