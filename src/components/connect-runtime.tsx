"use client";

// "Connect runtime": paste the code the runtime printed, confirm with the
// passkey session, the registry records the runtime as the agent's wallet.

import { useState } from "react";
import { Check, ChevronRight, Loader2, Terminal } from "lucide-react";
import { useSession } from "@/lib/session";
import { ensureGas, type Agent } from "@/lib/agents";
import { connectRuntime, decodePairing } from "@/lib/pairing";
import { Button, Card, Mono, shortHex } from "@/components/ui";
import { MentalModel } from "@/components/mental-model";

type Step = "idle" | "gas" | "submitting" | "done";

export function ConnectRuntime({ agent, onDone, onCancel }: { agent: Agent; onDone: () => void; onCancel: () => void }) {
  const { session, publicClient } = useSession();
  const [code, setCode] = useState("");
  const [explainer, setExplainer] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<`0x${string}` | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);
    try {
      const payload = decodePairing(code);
      if (payload.agentId !== String(agent.id)) {
        throw new Error(`This code is for Agent #${payload.agentId}, not #${agent.id}.`);
      }
      setRuntime(payload.wallet);
      setStep("gas");
      // The owner pays for setAgentWallet; the runtime needs gas to anchor stamps later.
      await ensureGas(publicClient, session.address);
      await ensureGas(publicClient, payload.wallet);
      setStep("submitting");
      await connectRuntime({ payload, wallet: session.wallet, publicClient });
      setStep("done");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("idle");
    }
  }

  const working = step === "gas" || step === "submitting";

  return (
    <Card className="p-6">
      <h2 id="connect-title" className="text-[24px] font-semibold leading-tight">Connect your runtime</h2>
      <p className="mt-1 text-sm text-secondary">
        Your runtime is the software that runs {agent.name} and spends its wallet: an MCP server, a bot, a wallet process.
      </p>

      {/* A button + animated grid row instead of <details>, which can only open and close instantly */}
      <div className="mt-4 rounded-[8px] border border-border-subtle bg-background p-4">
        <button
          type="button"
          onClick={() => setExplainer((o) => !o)}
          aria-expanded={explainer}
          className="flex w-full items-center gap-1.5 text-left text-xs text-tertiary hover:text-secondary"
        >
          <ChevronRight size={12} strokeWidth={1.5} className={`transition-transform duration-300 ${explainer ? "rotate-90" : ""}`} />
          What is what: you, agent, runtime, tool, stamp
        </button>
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${explainer ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
          inert={!explainer}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="pt-4">
              <MentalModel compact />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[8px] border border-border-subtle bg-background p-4">
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <Terminal size={14} strokeWidth={1.5} />
          In the terminal where your agent runs
        </div>
        <Mono className="mt-2 block text-primary">npx kleos pair {String(agent.id)}</Mono>
      </div>

      <form onSubmit={submit} className="mt-5">
        <label className="label">Paste pairing code</label>
        <textarea
          className="mt-2 h-24 w-full resize-none rounded-[8px] border border-border bg-background p-3 font-mono text-xs text-primary placeholder:text-tertiary focus:border-border-hover focus:outline-none disabled:opacity-50"
          placeholder={`The code printed by npx kleos pair ${String(agent.id)}`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={working}
          spellCheck={false}
        />
        {runtime && (
          <p className="mt-2 text-xs text-tertiary">
            Runtime <Mono className="text-xs text-secondary">{shortHex(runtime)}</Mono>
          </p>
        )}
        {working && (
          <ol className="mt-4 space-y-2 text-sm">
            <li className="flex items-center gap-2 text-primary">
              {step === "gas" ? (
                <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-secondary" />
              ) : (
                <Check size={16} strokeWidth={2} className="text-success" />
              )}
              Preparing accounts
            </li>
            <li className={`flex items-center gap-2 ${step === "submitting" ? "text-primary" : "text-tertiary"}`}>
              {step === "submitting" ? (
                <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-secondary" />
              ) : (
                <span className="inline-block h-4 w-4" />
              )}
              Recording the runtime on Monad
            </li>
          </ol>
        )}
        {error && <p className="mt-3 text-sm text-error">{error}</p>}
        <div className="mt-5 flex gap-2">
          <Button type="submit" variant="accent" disabled={!code.trim() || working} loading={working}>
            Connect runtime
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={working}>
            Cancel
          </Button>
        </div>
        <p className="mt-4 text-xs text-tertiary">
          The code is a signature by your runtime&apos;s key. The registry checks it; Kleos never sees a private key.
          You can revoke the runtime at any time.
        </p>
      </form>
    </Card>
  );
}
