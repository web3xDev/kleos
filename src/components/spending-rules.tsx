"use client";

// The spending policy Privy enforces on an agent's runtime, read live from
// Privy. Shown only when the runtime is a Privy server wallet. Anything not
// listed is refused by Privy before a signature exists.

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Label, Mono } from "@/components/ui";
import type { SpendingRules as Rules } from "@/lib/privy";

const METHOD: Record<string, string> = {
  eth_signTypedData_v4: "Signs",
  eth_signTransaction: "Sends",
  personal_sign: "Signs messages",
};

function describe(c: { field: string; operator: string; value: string }): string {
  const op = { eq: "=", lte: "≤", gte: "≥", lt: "<", gt: ">", in: "in" }[c.operator] ?? c.operator;
  return `${c.field} ${op} ${c.value}`;
}

export function SpendingRules({ agentId }: { agentId: bigint }) {
  const [rules, setRules] = useState<Rules | null>(null);

  useEffect(() => {
    fetch(`/api/agents/${agentId}/rules`)
      .then((r) => (r.ok ? r.json() : { rules: null }))
      .then((d: { rules: Rules | null }) => setRules(d.rules))
      .catch(() => setRules(null));
  }, [agentId]);

  if (!rules) return null;
  return (
    <div className="fade-in mt-6 rounded-[10px] border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} strokeWidth={1.5} className="text-success" />
          <Label>Spending rules · enforced by Privy</Label>
        </div>
        <Mono className="text-xs text-tertiary">policy {rules.policy}</Mono>
      </div>
      <p className="mt-2 text-sm text-secondary">
        This agent&apos;s runtime is a Privy server wallet. Privy checks every signature against these rules before it
        signs; anything not allowed here is refused, whatever the runtime asks.
      </p>
      <ul className="mt-4 space-y-3">
        {rules.rules.map((r) => (
          <li key={r.name} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-success">{r.action === "ALLOW" ? "Allowed" : r.action}</span>
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
  );
}
