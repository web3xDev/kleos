"use client";

// Owner view: sign in with a passkey, register agents, see their state.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Fingerprint, Loader2, Plus, Link2, Unlink } from "lucide-react";
import { useSession, SESSION_MINUTES, hadSession } from "@/lib/session";
import { cachedAgentIds, ensureGas, loadAgent, registerAgent, type Agent } from "@/lib/agents";
import { fetchStamps, formatUsdc } from "@/lib/stamps";
import { disconnectRuntime } from "@/lib/pairing";
import { hasStoredCredential } from "@/lib/passkey";
import { chain } from "@/lib/chain";
import { Badge, Button, Card, Input, Label, Mono, shortHex } from "@/components/ui";
import { ConnectRuntime } from "@/components/connect-runtime";
import { useToast } from "@/components/toast";

type Progress = "idle" | "gas" | "signing" | "done";

const steps: { key: Progress; label: string }[] = [
  { key: "gas", label: "Preparing your account" },
  { key: "signing", label: `Registering on ${chain.name}` },
];

export default function MePage() {
  const { session, publicClient, busy, error, signIn, create, end, secondsLeft } = useSession();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<Progress>("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [ended, setEnded] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [connecting, setConnecting] = useState<Agent | null>(null);
  const [summary, setSummary] = useState<Map<string, { actions: number; usdc: bigint }>>(new Map());
  const [revoking, setRevoking] = useState<Agent | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const { notify } = useToast();

  useEffect(() => {
    setReturning(hasStoredCredential());
    setEnded(hadSession());
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoadingAgents(true);
    try {
      const list = await Promise.all(cachedAgentIds(session.address).map((id) => loadAgent(publicClient, id)));
      setAgents(list.sort((a, b) => Number(b.id - a.id)));
      const sums = await Promise.all(
        list.map(async (a) => {
          const stamps = await fetchStamps(a.id);
          return [String(a.id), { actions: stamps.length, usdc: stamps.reduce((t, x) => t + BigInt(x.receipt.amount), 0n) }] as const;
        }),
      );
      setSummary(new Map(sums));
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
      await ensureGas(publicClient, session.address);
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
      setShowRegister(false);
      setProgress("idle");
    } catch (err) {
      setTxError(err instanceof Error ? err.message : String(err));
      setProgress("idle");
    }
  }

  async function onRevoke() {
    if (!session || !revoking) return;
    setRevokeBusy(true);
    try {
      await ensureGas(publicClient, session.address);
      await disconnectRuntime({ agentId: revoking.id, wallet: session.wallet, publicClient });
      notify("Runtime revoked", "It can no longer create stamps for this agent. Existing stamps remain verifiable.");
      setRevoking(null);
      void refresh();
    } catch (err) {
      notify("Could not revoke", err instanceof Error ? err.message : String(err));
    } finally {
      setRevokeBusy(false);
    }
  }

  const working = progress === "gas" || progress === "signing";
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  if (!session) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-4 py-24 md:px-8">
        <div className="mx-auto max-w-md">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-secondary">
            <Fingerprint size={22} strokeWidth={1.5} />
          </div>
          <h1 className="mt-6 text-[40px] font-semibold leading-none tracking-tight">
            {ended ? "Your session ended" : "Your agents"}
          </h1>
          <p className="mt-4 text-secondary">
            {ended
              ? "Your agents are onchain. Your session is not. Your signing and encryption keys live in memory only; reloading clears them by design. One Touch ID restores the same keys."
              : "One passkey. No seed phrase, no extension, no account. Nothing is stored on this device; your keys are derived from your passkey each time."}
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Button size="lg" loading={busy} onClick={returning ? signIn : create}>
              {busy ? "Waiting for passkey" : ended ? "Continue with passkey" : returning ? "Sign in" : "Create passkey"}
            </Button>
            <Button size="lg" variant="ghost" disabled={busy} onClick={returning ? create : signIn}>
              {returning ? "Use a new passkey" : "I already have one"}
            </Button>
          </div>
          {error && <p className="mt-4 text-sm text-error">{error}</p>}
          <p className="mt-10 text-xs text-tertiary">
            Works in Safari and with Google Password Manager. Chrome&apos;s own passkey store does not support the
            key-derivation feature Kleos relies on.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[40px] font-semibold leading-none tracking-tight">Your agents</h1>
          <div className="mt-3">
            <Mono className="text-secondary">{shortHex(session.address, 8, 6)}</Mono>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-tertiary">
            Session ends in <Mono className="text-xs text-secondary">{mm}:{ss}</Mono> of {SESSION_MINUTES}
          </span>
          <Button variant="ghost" onClick={end}>
            End session
          </Button>
          <Button onClick={() => setShowRegister((v) => !v)}>
            <Plus size={16} strokeWidth={1.5} />
            Register agent
          </Button>
        </div>
      </div>

      {showRegister && (
        <Card className="mt-8 p-6">
          <form onSubmit={onRegister}>
            <h2 className="text-[24px] font-semibold leading-tight">Register your agent</h2>
            <p className="mt-1 text-sm text-secondary">Give your agent an on-chain identity.</p>
            <div className="mt-5 flex gap-2">
              <Input
                placeholder="Agent name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={working}
                autoFocus
              />
              <Button type="submit" disabled={!name.trim() || working} loading={working} className="shrink-0">
                Register
              </Button>
            </div>
            {working && (
              <ol className="mt-5 space-y-2 text-sm">
                {steps.map((s, i) => {
                  const done = steps.findIndex((x) => x.key === progress) > i;
                  const active = s.key === progress;
                  return (
                    <li key={s.key} className={`flex items-center gap-2 ${done || active ? "text-primary" : "text-tertiary"}`}>
                      {done ? (
                        <Check size={16} strokeWidth={2} className="text-success" />
                      ) : active ? (
                        <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-secondary" />
                      ) : (
                        <span className="inline-block h-4 w-4" />
                      )}
                      {s.label}
                    </li>
                  );
                })}
              </ol>
            )}
            {txError && <p className="mt-4 text-sm text-error">{txError}</p>}
            <p className="mt-5 text-xs text-tertiary">
              Confirms with your passkey session. Registers an ERC-8004 identity and writes your agent&apos;s
              encryption key next to it.
            </p>
          </form>
        </Card>
      )}

      {connecting && (
        <div className="mt-8">
          <ConnectRuntime
            agent={connecting}
            onCancel={() => setConnecting(null)}
            onDone={() => {
              setConnecting(null);
              void refresh();
            }}
          />
        </div>
      )}

      {revoking && (
        <Card className="mt-8 p-6">
          <h2 className="text-[24px] font-semibold leading-tight">Revoke this runtime?</h2>
          <p className="mt-2 text-sm text-secondary">
            <Mono className="text-primary">{shortHex(revoking.wallet ?? "")}</Mono> will no longer be able to create stamps for{" "}
            {revoking.name}. Existing stamps remain verifiable.
          </p>
          <div className="mt-5 flex gap-2">
            <Button onClick={onRevoke} loading={revokeBusy} disabled={revokeBusy}>
              Revoke runtime
            </Button>
            <Button variant="ghost" onClick={() => setRevoking(null)} disabled={revokeBusy}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <section className="mt-10">
        {loadingAgents && agents.length === 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-[10px] bg-surface-elevated" />
            ))}
          </div>
        )}

        {!loadingAgents && agents.length === 0 && (
          <Card className="p-10 text-center">
            <p className="text-secondary">No agents yet.</p>
            <p className="mt-1 text-sm text-tertiary">Register one to give it an identity and start a track record.</p>
            <Button className="mt-6" onClick={() => setShowRegister(true)}>
              <Plus size={16} strokeWidth={1.5} />
              Register agent
            </Button>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((a) => (
            <Card key={String(a.id)} hover className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold leading-tight">{a.name}</div>
                  <Mono className="mt-1 block text-secondary">Agent #{String(a.id)}</Mono>
                </div>
                {a.wallet ? (
                  <Badge tone="success">
                    <Check size={12} strokeWidth={2} />
                    Runtime connected
                  </Badge>
                ) : (
                  <Badge>Not connected</Badge>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4">
                <div>
                  <div className="metric">{summary.get(String(a.id))?.actions ?? "–"}</div>
                  <Label className="mt-1">Verified actions</Label>
                </div>
                <div>
                  <div className="metric">{summary.has(String(a.id)) ? formatUsdc(summary.get(String(a.id))!.usdc) : "–"}</div>
                  <Label className="mt-1">USDC settled</Label>
                </div>
              </div>

              {!a.wallet ? (
                <p className="mt-4 rounded-[8px] border border-border-subtle bg-background px-3 py-2.5 text-xs text-secondary">
                  <span className="text-primary">Identity ready.</span> Nothing can stamp actions yet. Connect the runtime that runs this agent.
                </p>
              ) : (summary.get(String(a.id))?.actions ?? 0) === 0 ? (
                <p className="mt-4 rounded-[8px] border border-border-subtle bg-background px-3 py-2.5 text-xs text-secondary">
                  <span className="text-primary">Ready.</span> Its first paid action will create the first stamp.
                </p>
              ) : null}

              <dl className="mt-5 space-y-2 border-t border-border-subtle pt-4">
                <div className="flex items-baseline justify-between gap-4">
                  <dt>
                    <Label>Runtime</Label>
                  </dt>
                  <dd>
                    <Mono className="text-secondary">{a.wallet ? shortHex(a.wallet) : "—"}</Mono>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt>
                    <Label>Encryption key</Label>
                  </dt>
                  <dd>
                    <Mono className="text-secondary">{a.encryptionKey ? shortHex(a.encryptionKey, 8, 6) : "—"}</Mono>
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex items-center gap-2">
                {!a.wallet ? (
                  <Button variant="secondary" onClick={() => setConnecting(a)}>
                    <Link2 size={16} strokeWidth={1.5} />
                    Connect runtime
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setRevoking(a)}>
                    <Unlink size={16} strokeWidth={1.5} />
                    Revoke runtime
                  </Button>
                )}
                <Link href={`/a/${a.id}`} className="ml-auto inline-flex items-center gap-1 text-sm text-secondary hover:text-primary">
                  View agent <ArrowRight size={14} strokeWidth={1.5} />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
