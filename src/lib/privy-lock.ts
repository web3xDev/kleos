// What the agent owner signs to hand the Privy agent's rules to their passkey.
// Shared by the browser (signs it) and the server (checks it). No secrets.

export function lockMessage(agentId: bigint, publicKey: string): string {
  return [
    `Kleos: make my passkey the owner of agent #${agentId}'s Privy wallet and spending rules.`,
    "After this, only my passkey can change the rules.",
    `Owner key: ${publicKey}`,
  ].join("\n");
}
