// Architecture as layers: where each thing lives and what flows down.
// Same visual language as the mental model, more structure.

import { Label, Mono } from "@/components/ui";

type Layer = {
  where: string;
  title: string;
  items: { k: string; v: string }[];
  arrow?: string;
};

const layers: Layer[] = [
  {
    where: "Human",
    title: "Passkey",
    items: [
      { k: "salt 1", v: "owner account · secp256k1 EOA · signs registry transactions" },
      { k: "salt 2", v: "encryption root · HKDF(index) · one keypair per agent" },
    ],
    arrow: "one Touch ID, both keys, nothing stored",
  },
  {
    where: "Monad",
    title: "ERC-8004 Identity Registry",
    items: [
      { k: "token", v: "the agent · owner = the human's account" },
      { k: "metadata", v: "kleos.encryptionKey · kleos.keyIndex" },
      { k: "agentWallet", v: "the runtime's key · setAgentWallet / unsetAgentWallet" },
    ],
    arrow: "pairing: the runtime signs, the owner submits, the registry verifies",
  },
  {
    where: "Runtime",
    title: "The software that runs the agent",
    items: [
      { k: "key", v: "its own · paired once · revocable" },
      { k: "any", v: "an x402-paying runtime with the kleos package" },
    ],
    arrow: "tool call → x402 payment → settlement on Monad",
  },
  {
    where: "Tool",
    title: "The x402 service the agent pays",
    items: [
      { k: "countersign", v: "signs \"I was paid for this call\" · X-Kleos-Countersign · only payTo counts" },
      { k: "pay later", v: "serves first when Kleos Engine v0 grants credit · opens the invoice" },
    ],
    arrow: "receipt, signed by both sides",
  },
  {
    where: "Kleos",
    title: "Stamp and invoice",
    items: [
      { k: "receipt", v: "signed by the runtime, countersigned by the tool (v2) · public fields, fixed order" },
      { k: "body", v: "sealed to the owner · ECIES · the store holds ciphertext only" },
      { k: "anchor", v: "KleosStamps.stamp() · only the agentWallet · settlement required" },
      { k: "invoice", v: "KleosCredit · opened with the agent's consent · closed by a stamp" },
    ],
    arrow: "read by anyone, from chain",
  },
  {
    where: "Anyone",
    title: "Track record",
    items: [
      { k: "explore", v: "the whole registry, stamp counts from KleosStamps" },
      { k: "profile", v: "verified actions · USDC settled · days · tools · invoices" },
      { k: "verify", v: "recompute hash · recover signer · read anchor · fetch settlement · check the countersignature, in the browser" },
      { k: "decide", v: "Kleos Engine v0 · a tool's rule over stamps and invoices" },
    ],
  },
];

export function Architecture() {
  return (
    <ol>
      {layers.map((l, i) => (
        <li key={l.title}>
          <div className="grid gap-3 rounded-[10px] border border-border bg-surface p-4 md:grid-cols-[110px_1fr] md:gap-6">
            <div>
              <Label>{l.where}</Label>
              <div className="mt-1 text-[15px] font-medium text-primary">{l.title}</div>
            </div>
            <dl className="space-y-1.5">
              {l.items.map((it) => (
                <div key={it.k} className="grid grid-cols-[96px_1fr] gap-3 text-sm">
                  <dt>
                    <Mono className="text-xs text-tertiary">{it.k}</Mono>
                  </dt>
                  <dd className="text-secondary">{it.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          {l.arrow && (
            <div className="ml-6 flex items-center gap-3 py-2">
              <span className="block h-5 w-px bg-border" />
              <Mono className="text-[11px] text-tertiary">{l.arrow}</Mono>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
