// ERC-8004 Identity Registry: who the agents are, who owns them, and which
// runtime (agentWallet) currently acts for them.
//
// The registry stores the runtime as metadata under the reserved key
// "agentWallet": set on register (to the owner), on setAgentWallet (to the
// runtime) and cleared ("0x") on unset or transfer. A wallet equal to the
// owner is not a runtime, so it is stored as none, like the site shows it.

import { indexer } from "envio";
import { emptyAgent, emptyNetwork, nameFromUri } from "./shared";

const ZERO = "0x0000000000000000000000000000000000000000";

indexer.onEvent({ contract: "IdentityRegistry", event: "Registered" }, async ({ event, context }) => {
  const id = event.params.agentId.toString();
  const existing = await context.Agent.get(id);
  context.Agent.set({
    ...(existing ?? emptyAgent(id, event.block)),
    owner: event.params.owner.toLowerCase(),
    uri: event.params.agentURI || undefined,
    name: nameFromUri(event.params.agentURI),
    registeredAt: event.block.timestamp,
    registeredBlock: event.block.number,
  });
  if (!existing) {
    const net = await context.Network.getOrCreate(emptyNetwork);
    context.Network.set({ ...net, agents: net.agents + 1 });
  }
});

indexer.onEvent({ contract: "IdentityRegistry", event: "URIUpdated" }, async ({ event, context }) => {
  const id = event.params.agentId.toString();
  const agent = (await context.Agent.get(id)) ?? emptyAgent(id, event.block);
  context.Agent.set({ ...agent, uri: event.params.newURI || undefined, name: nameFromUri(event.params.newURI) });
});

indexer.onEvent({ contract: "IdentityRegistry", event: "MetadataSet" }, async ({ event, context }) => {
  const key = event.params.metadataKey;
  if (key !== "agentWallet" && key !== "kleos.encryptionKey") return;

  const id = event.params.agentId.toString();
  const agent = (await context.Agent.get(id)) ?? emptyAgent(id, event.block);
  const value = event.params.metadataValue.toLowerCase();

  if (key === "agentWallet") {
    // 20 packed bytes = an address; "0x" = cleared.
    const wallet = value.length === 42 ? value : undefined;
    context.Agent.set({ ...agent, wallet: wallet && wallet !== agent.owner ? wallet : undefined });
  } else {
    context.Agent.set({ ...agent, kleos: value !== "0x" });
  }
});

// Ownership changes after mint. The mint itself is covered by Registered.
indexer.onEvent({ contract: "IdentityRegistry", event: "Transfer" }, async ({ event, context }) => {
  if (event.params.from.toLowerCase() === ZERO) return;
  const id = event.params.tokenId.toString();
  const agent = (await context.Agent.get(id)) ?? emptyAgent(id, event.block);
  context.Agent.set({ ...agent, owner: event.params.to.toLowerCase() });
});
