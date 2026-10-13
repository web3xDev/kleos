"use client";

// The spending policy Privy enforces on an agent's runtime, read live from
// Privy. Shown only when the runtime is a Privy server wallet. Anything not
// listed is refused by Privy before a signature exists.

import { useEffect, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { Mono } from "@/components/ui";
import { addresses, chain } from "@/lib/chain";
import { formatUsdc } from "@/lib/stamps";
import type { SpendingRules as Rules } from "@/lib/privy";

const METHOD: Record<string, string> = {
  eth_signTypedData_v4: "Signs",
  eth_signTransaction: "Sends",
  personal_sign: "Signs messages",
};

// Known contracts by name, so a rule reads as what it allows, not as hex.
const NAMES: Record<string, string> = {
  [addresses.usdc.toLowerCase()]: "USDC",
  [addresses.kleosStamps.toLowerCase()]: "KleosStamps",
  [addresses.kleosCredit.toLowerCase()]: "KleosCredit",
  [addresses.identityRegistry.toLowerCase()]: "ERC-8004 registry",
};

function describe(c: { field: string; operator: string; value: string }): string {
  const op = { eq: "=", lte: "≤", gte: "≥", lt: "<", gt: ">", in: "in" }[c.operator] ?? c.operator;
  if (c.field === "verifyingContract" || c.field === "to") return `${c.field === "to" ? "to" : "contract"} ${NAMES[c.value.toLowerCase()] ?? c.value}`;
  if (c.field === "chainId" || c.field === "chain_id") return c.value === String(chain.id) ? chain.name : `chain ${c.value}`;
  if (c.field === "value") return `amount ${op} ${formatUsdc(BigInt(c.value))}`;
  return `${c.field} ${op} ${c.value}`;
}

export function SpendingRules({ agentId }: { agentId: bigint }) {
  const [rules, setRules] = useState<Rules | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/agents/${agentId}/rules`)
      .then((r) => (r.ok ? r.json() : { rules: null }))
      .then((d: { rules: Rules | null }) => setRules(d.rules))
      .catch(() => setRules(null));
  }, [agentId]);

  if (!rules) return null;
  const allowed = rules.rules.filter((r) => r.action === "ALLOW").length;
  return (
    <div className="fade-in mt-6 rounded-[10px] border border-border bg-surface">
      {/* One line until asked: what guards this runtime, and how much */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2">
          <ShieldCheck size={16} strokeWidth={1.5} className="text-success" />
          <span className="text-sm font-medium text-primary">Spending rules, enforced by Privy</span>
          <span className="text-xs text-tertiary">
            {allowed} allowed · everything else refused
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-secondary transition-colors duration-[180ms] group-hover:text-primary">
          {open ? "Hide rules" : "Show rules"}
          <ChevronDown size={14} strokeWidth={1.5} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`} inert={!open}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border-subtle px-5 pb-5 pt-4">
            <p className="text-xs text-tertiary">
              This runtime is a Privy server wallet. Privy checks every signature against these rules before it signs,
              whatever the runtime asks. <Mono className="text-xs">policy {rules.policy}</Mono>
            </p>
            <ul className="mt-4 space-y-3">
              {rules.rules.map((r) => (
                <li key={r.name} className="text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-success">Allowed</span>
                    <span className="text-primary">{r.name}</span>
                  </div>
                  {r.conditions.length > 0 && (
                    <Mono className="mt-0.5 block text-xs text-tertiary">
                      {METHOD[r.method] ?? r.method} · {r.conditions.map(describe).join(" · ")}
                    </Mono>
                  )}
                </li>
              ))}
              <li className="text-sm">
                <span className="text-xs font-medium text-error">Refused</span> <span className="text-secondary">Everything else</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
