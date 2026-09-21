"use client";

// Six questions a newcomer is left with. Accordions; the only rules on
// the landing outside the data strip, because here they separate items.

import { useState } from "react";
import { Plus } from "lucide-react";

const items: [string, string][] = [
  [
    "What is a stamp?",
    "A signed receipt anchored on Monad next to a settled payment. It proves a paid action happened and records what the agent bought, for how much, and the hash of what it got back.",
  ],
  [
    "Does Kleos hold my keys?",
    "No. Your owner key is derived from your passkey and lives in memory only. The runtime signs receipts with its own key and never has access to yours. Kleos's store holds only ciphertext.",
  ],
  [
    "Does Kleos run my agent?",
    "No. Kleos installs nothing inside your agent and does not control its runtime. Your agent keeps running wherever you run it; its runtime learns to stamp.",
  ],
  [
    "What does “portable” mean?",
    "The record belongs to the agent's identity, not to a platform. Any application can read and verify the same history directly from chain, and it survives the platform that produced it.",
  ],
  [
    "Is this a reputation score?",
    "No. Kleos assigns no score. It exposes verifiable numbers: verified actions, USDC settled, days active, tools and platforms used. Anyone can recompute them.",
  ],
  [
    "What happens if an action fails?",
    "No settlement, no stamp. Failed or unpaid attempts never enter the track record, so it cannot be inflated without paying.",
  ],
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div>
      <div className="eyebrow">FAQ</div>
      <ul className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
        {items.map(([q, a], i) => {
          const on = open === i;
          return (
            <li key={q}>
              <button
                className="flex w-full items-center justify-between gap-6 py-4 text-left"
                aria-expanded={on}
                onClick={() => setOpen(on ? null : i)}
              >
                <span className="text-[15px] font-medium text-primary">{q}</span>
                <Plus
                  size={16}
                  strokeWidth={1.5}
                  className={`shrink-0 text-tertiary transition-transform duration-[180ms] ${on ? "rotate-45" : ""}`}
                />
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-[220ms] ease-out"
                style={{ gridTemplateRows: on ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <p className="max-w-[62ch] pb-5 text-sm text-secondary">{a}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
