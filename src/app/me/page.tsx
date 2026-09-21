"use client";

// Owner view. Functional first; the design pass comes once the flow is proven.

import { useCallback, useEffect, useState } from "react";
import { formatEther } from "viem";
import { useSession } from "@/lib/session";
import { cachedAgentIds, ensureGas, loadAgent, registerAgent, type Agent } from "@/lib/agents";
import { hasStoredCredential } from "@/lib/passkey";
import { chain, addresses } from "@/lib/chain";

type Progress = "idle" | "gas" | "signing" | "confirming" | "done";

export default function MePage() {
  const { session, publicClient, busy, error, signIn, create, end, secondsLeft } = useSession();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<Progress>("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [returning, setReturning] = useState(false);

  useEffect(() => setReturning(hasStoredCredential()), []);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoadingAgents(true);
    try {
      const [bal, list] = await Promise.all([
        publicClient.getBalance({ address: session.address }),
        Promise.all(cachedAgentIds(session.address).map((id) => loadAgent(publicClient, id))),
      ]);
      setBalance(bal);
      setAgents(list.sort((a, b) => Number(b.id - a.id)));
    } finally {
      setLoadingAgents(false);
    }
  }, [session, publicClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !name.trim()) return;
    setTxError(null);
    try {
      setProgress("gas");
      await ensureGas(session.address);
      setProgress("signing");
      const agent = await registerAgent({
        name: name.trim(),
        wallet: session.wallet,
        publicClient,
        encryption: session.keys.encryption,
        keyIndex: agents.length,
      });
      setProgress("done");
      setAgents((a) => [agent, ...a]);
      setName("");
      void refresh();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : String(err));
      setProgress("idle");
    }
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-2xl font-semibold">Your agents</h1>
        <p className="mt-2 opacity-70">
          Sign in with your passkey. Nothing is stored on this device; your keys come from your finger.
        </p>
        <div className="mt-6 flex gap-2">
          <button
            className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
            disabled={busy}
            onClick={returning ? signIn : create}
          >
            {busy ? "Waiting for passkey…" : returning ? "Sign in" : "Create passkey"}
          </button>
          <button className="rounded-md border px-4 py-2 disabled:opacity-50" disabled={busy} onClick={returning ? create : signIn}>
            {returning ? "New passkey" : "I already have one"}
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your agents</h1>
          <p className="mt-1 font-mono text-xs opacity-60">
            {session.address}
            {balance !== null && ` · ${Number(formatEther(balance)).toFixed(3)} MON`}
          </p>
        </div>
        <div className="text-right text-xs opacity-60">
          <div>session ends in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</div>
          <button className="underline" onClick={end}>
            end session
          </button>
        </div>
      </header>

      <form onSubmit={onRegister} className="mt-8 rounded-lg border p-4">
        <h2 className="font-medium">Register an agent</h2>
        <p className="mt-1 text-sm opacity-70">Gives your agent an on-chain identity (ERC-8004 on {chain.name}).</p>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-md border px-3 py-2"
            placeholder="Agent name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={progress !== "idle" && progress !== "done"}
          />
          <button
            className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
            disabled={!name.trim() || (progress !== "idle" && progress !== "done")}
          >
            Register
          </button>
        </div>
        {progress !== "idle" && progress !== "done" && (
          <ol className="mt-3 space-y-1 text-sm opacity-70">
            <li>{progress === "gas" ? "→" : "✓"} Preparing your account</li>
            <li>{progress === "signing" ? "→" : progress === "confirming" ? "✓" : " "} Registering on Monad</li>
            <li>{progress === "confirming" ? "→" : " "} Confirming</li>
          </ol>
        )}
        {txError && <p className="mt-3 text-sm text-red-600">{txError}</p>}
      </form>

      <section className="mt-8">
        <h2 className="font-medium">
          Agents {loadingAgents && <span className="text-xs opacity-50">loading…</span>}
        </h2>
        {agents.length === 0 && !loadingAgents && (
          <p className="mt-2 text-sm opacity-60">No agents yet. Register one above.</p>
        )}
        <ul className="mt-3 space-y-3">
          {agents.map((a) => (
            <li key={String(a.id)} className="rounded-lg border p-4">
              <div className="flex items-baseline justify-between">
                <div className="font-medium">{a.name}</div>
                <div className="font-mono text-xs opacity-60">Agent #{String(a.id)}</div>
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs opacity-70">
                <dt>runtime</dt>
                <dd>{a.wallet ?? "not connected"}</dd>
                <dt>encryption key</dt>
                <dd className="break-all">{a.encryptionKey ?? "—"}</dd>
                <dt>key index</dt>
                <dd>{a.keyIndex ?? "—"}</dd>
              </dl>
              <a
                className="mt-2 inline-block text-xs underline opacity-70"
                href={`${chain.blockExplorers.default.url}/address/${addresses.identityRegistry}`}
                target="_blank"
                rel="noreferrer"
              >
                registry on explorer
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
