"use client";

// The spending policy Privy enforces on an agent's runtime, read live from
// Privy. Shown only when the runtime is a Privy server wallet. Anything not
// listed is refused by Privy before a signature exists.

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Fingerprint, Lock, ShieldCheck } from "lucide-react";
import { formatUnits, parseUnits } from "viem";
import { toViemAccount } from "@category-labs/mera/viem";
import { PRIVY_API, authorizationSignature, privyPublicKey } from "kleos-sdk/privy-auth";
import { Button, Input, Mono } from "@/components/ui";
import { useToast } from "@/components/toast";
import { addresses, chain } from "@/lib/chain";
import { useSession } from "@/lib/session";
import { lockMessage } from "@/lib/privy-lock";
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
  if (c.field === "value") return `amount ${op} ${usd(BigInt(c.value))}`;
  return `${c.field} ${op} ${c.value}`;
}

/** USDC with as many decimals as the cap needs ($0.005, not $0.00). */
const usd = (atomic: bigint) => `$${formatUnits(atomic, 6)}`;

/** The per-payment cap in the rules, in USDC atomic units, if there is one. */
function capOf(rules: Rules): bigint | null {
  for (const r of rules.raw) for (const c of r.conditions ?? []) if (c.field === "value") return BigInt(String(c.value));
  return null;
}

export function SpendingRules({ agentId, owner }: { agentId: bigint; owner?: string }) {
  const [rules, setRules] = useState<Rules | null>(null);
  const [open, setOpen] = useState(false);
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState<null | "lock" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const { session, freshKeys } = useSession();
  const { notify } = useToast();
  // The controls are the agent owner's only; everyone else sees the rules.
  const isOwner = Boolean(session && owner && session.address.toLowerCase() === owner.toLowerCase());

  const load = useCallback(() => {
    fetch(`/api/agents/${agentId}/rules`)
      .then((r) => (r.ok ? r.json() : { rules: null }))
      .then((d: { rules: Rules | null }) => {
        setRules(d.rules);
        const c = d.rules ? capOf(d.rules) : null;
        if (c !== null) setCap(formatUnits(c, 6));
      })
      .catch(() => setRules(null));
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Hand the wallet and its rules to this passkey: one Touch ID, signed by the agent owner.
  async function lock() {
    setBusy("lock");
    setError(null);
    try {
      const keys = await freshKeys();
      try {
        const publicKey = privyPublicKey(keys.encryption.privyOwner());
        const signature = await toViemAccount(keys.owner.session).signMessage({ message: lockMessage(agentId, publicKey) });
        const res = await fetch("/api/privy/lock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ publicKey, signature }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `lock failed (${res.status})`);
      } finally {
        keys.owner.session.end();
      }
      notify("Rules locked to your passkey", "From now on, only your Touch ID can change what this agent may spend.", undefined, "success");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(null);
    }
  }

  // Change the per-payment cap: the update is signed here with the passkey-derived owner key.
  async function save() {
    if (!rules) return;
    setBusy("save");
    setError(null);
    try {
      const value = parseUnits(cap || "0", 6);
      if (value <= 0n) throw new Error("Enter an amount above zero.");
      const body = {
        rules: rules.raw.map((r) => ({
          ...r,
          conditions: (r.conditions ?? []).map((c) => (c.field === "value" ? { ...c, value: value.toString() } : c)),
        })),
      };
      const keys = await freshKeys();
      let signature: string;
      try {
        signature = authorizationSignature(keys.encryption.privyOwner(), {
          method: "PATCH",
          url: `${PRIVY_API}/policies/${rules.policy}`,
          body,
          appId: rules.appId,
        });
      } finally {
        keys.owner.session.end();
      }
      const res = await fetch("/api/privy/policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, signature }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `update failed (${res.status})`);
      notify("Spending rules updated", `Privy now allows at most ${usd(value)} per payment.`, undefined, "success");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(null);
    }
  }

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
        <span className="flex items-center gap-2.5">
          <ShieldCheck size={20} strokeWidth={1.5} className="shrink-0 text-success" />
          <span className="text-sm font-medium text-primary">Spending rules, enforced by Privy</span>
          <span className="text-xs text-tertiary">
            {allowed} allowed · everything else refused{rules.locked ? " · only the owner's passkey can change them" : ""}
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

            {/* Who can change these rules */}
            <div className="mt-5 border-t border-border-subtle pt-4">
              <div className="flex items-start gap-2 text-sm">
                <Lock size={16} strokeWidth={1.5} className={`mt-0.5 shrink-0 ${rules.locked ? "text-success" : "text-tertiary"}`} />
                {rules.locked ? (
                  <span className="text-secondary">
                    Owned by a key derived from the agent owner&apos;s passkey. Only that Touch ID can change these rules;
                    the server signs within them and cannot.
                  </span>
                ) : (
                  <span className="text-tertiary">Not locked yet: the app that created the wallet can still change these rules.</span>
                )}
              </div>

              {isOwner && !rules.locked && (
                <Button variant="accent" className="mt-3" onClick={lock} loading={busy === "lock"} disabled={busy !== null}>
                  <Fingerprint size={16} strokeWidth={1.5} />
                  Lock rules to my passkey
                </Button>
              )}

              {isOwner && rules.locked && capOf(rules) !== null && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="text-xs text-tertiary">Max per payment (USDC)</span>
                    <Input className="mt-1 w-36" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
                  </label>
                  <Button variant="accent" onClick={save} loading={busy === "save"} disabled={busy !== null}>
                    <Fingerprint size={16} strokeWidth={1.5} />
                    Save with Touch ID
                  </Button>
                </div>
              )}
              {error && <p className="mt-2 text-xs text-error">{error}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
