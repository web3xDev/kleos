"use client";

// Owner view: sign in with a passkey, register agents, see their state.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BadgeCheck, Check, Fingerprint, Fuel, Loader2, Lock, LogOut, Plus, Link2, Unlink, X } from "lucide-react";
import { Mark } from "@/components/mark";
import { useSession, SESSION_MINUTES, hadSession } from "@/lib/session";
import { cachedAgentIds, ensureGas, loadAgent, registerAgent, rememberAgent, type Agent } from "@/lib/agents";
import { fetchStamps, formatUsdc } from "@/lib/stamps";
import { disconnectRuntime } from "@/lib/pairing";
import { chain } from "@/lib/chain";
import { Modal } from "@/components/modal";
import { Badge, Button, Card, Input, Label, Mono, Shimmer, shortHex } from "@/components/ui";
import { ConnectRuntime } from "@/components/connect-runtime";
import { useToast } from "@/components/toast";

type Progress = "idle" | "gas" | "signing" | "done";

const steps: { key: Progress; label: string }[] = [
  { key: "gas", label: "Preparing your account" },
  { key: "signing", label: `Registering on ${chain.name}` },
];

// Last known list per owner, kept for the life of the tab so navigating back
// to this page shows the agents at once instead of reloading from nothing.
let remembered: { owner: string; agents: Agent[]; summary: Map<string, { actions: number; usdc: bigint }> } | null = null;

/** Time left in the session as a small ring; turns amber in the last two minutes. */
function SessionRing({ fraction, low }: { fraction: number; low: boolean }) {
  const r = 5.5;
  const c = 2 * Math.PI * r;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="-rotate-90">
      <circle cx="7" cy="7" r={r} fill="none" stroke="var(--border)" strokeWidth="1.5" />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke={low ? "var(--warning)" : "var(--success)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, fraction)))}
        style={{ transition: "stroke-dashoffset 1s linear, stroke 180ms" }}
      />
    </svg>
  );
}

export default function MePage() {
  const { session, publicClient, busy, error, signIn, confirm, create, end, secondsLeft } = useSession();
  const cached = session && remembered?.owner === session.address.toLowerCase() ? remembered : null;
  const [agents, setAgents] = useState<Agent[]>(cached?.agents ?? []);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<Progress>("idle");
  const [txError, setTxError] = useState<string | null>(null);
  // null until the tab's session flag is read, so the title never flashes.
  const [ended, setEnded] = useState<boolean | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [connecting, setConnecting] = useState<Agent | null>(null);
  const [summary, setSummary] = useState<Map<string, { actions: number; usdc: bigint }>>(cached?.summary ?? new Map());
  const loadRun = useRef(0);
  const [revoking, setRevoking] = useState<Agent | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  // "passkey" while Touch ID is asked, "sending" while the revoke tx lands.
  const [revokeStage, setRevokeStage] = useState<"passkey" | "sending" | null>(null);
  // The last agent asked about, so the modal's text survives while it animates closed.
  const [shownRevoke, setShownRevoke] = useState<Agent | null>(null);
  const [shownConnect, setShownConnect] = useState<Agent | null>(null);
  const { notify } = useToast();

  useEffect(() => {
    // Reads a non-secret sessionStorage flag once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnded(hadSession());
  }, []);

  // After a reload the keys are gone by design (memory only). Ask for the passkey
  // right away instead of waiting for a click; if the prompt is dismissed or the
  // browser wants a click first, the button is still there and no error shows.
  const autoPrompted = useRef(false);
  useEffect(() => {
    if (ended !== true || session || busy || autoPrompted.current) return;
    autoPrompted.current = true;
    void signIn({ quiet: true });
  }, [ended, session, busy, signIn]);

  const refresh = useCallback(async () => {
    if (!session) return;
    // Only the latest run may write: an older, slower run never overwrites it.
    const run = ++loadRun.current;
    const owner = session.address.toLowerCase();
    const previous = remembered?.owner === owner ? remembered : null;
    setLoadingAgents(true);
    try {
      // Agents come from chain: every registry token owned by this passkey's
      // address. The local cache only adds ones registered moments ago that
      // the registry scan has not picked up yet.
      const owned = await fetch("/api/explore")
        .then((r) => (r.ok ? r.json() : { agents: [] }))
        .then((d: { agents: { id: number; owner: string }[] }) =>
          d.agents.filter((a) => a.owner.toLowerCase() === session.address.toLowerCase()).map((a) => BigInt(a.id)),
        )
        .catch(() => [] as bigint[]);
      const ids = [...new Set([...owned, ...cachedAgentIds(session.address)].map(String))].map(BigInt);
      const loaded = await Promise.all(
        ids.map(async (id) => {
          try {
            return await loadAgent(publicClient, id);
          } catch {
            // A read that keeps failing never drops an agent: keep the last known copy.
            return previous?.agents.find((a) => a.id === id) ?? null;
          }
        }),
      );
      if (run !== loadRun.current) return;
      const list = loaded
        .filter((a): a is Agent => a !== null && a.owner.toLowerCase() === owner)
        .sort((a, b) => Number(b.id - a.id));
      list.forEach((a) => rememberAgent(session.address, a.id));
      setAgents(list);

      // Each card fills in as soon as its own stamps arrive: one slow agent (a long
      // record over a slow RPC) never holds the others' numbers back.
      const sums = new Map(previous?.summary);
      await Promise.allSettled(
        list.map(async (a) => {
          const st = await fetchStamps(a.id);
          if (run !== loadRun.current) return;
          sums.set(String(a.id), { actions: st.length, usdc: st.reduce((t, x) => t + BigInt(x.receipt.amount), 0n) });
          setSummary(new Map(sums));
        }),
      );
      if (run !== loadRun.current) return;
      remembered = { owner, agents: list, summary: sums };
    } finally {
      if (run === loadRun.current) setLoadingAgents(false);
    }
  }, [session, publicClient]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the owner's agents when the session starts
    void refresh();
  }, [refresh]);

  // Keep the tab-level copy in step with every change (register, connect, revoke).
  useEffect(() => {
    if (session && agents.length) remembered = { owner: session.address.toLowerCase(), agents, summary };
  }, [session, agents, summary]);

  // Every open starts clean: no leftover name or error from the last attempt.
  // (Reset on open, not on close, so the form does not blank out while it fades away.)
  function openRegister() {
    setName("");
    setTxError(null);
    setProgress("idle");
    setShowRegister(true);
  }

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !name.trim()) return;
    setTxError(null);
    try {
      setProgress("gas");
      await ensureGas(publicClient, session.address);
      setProgress("signing");
      const register = () =>
        registerAgent({
          name: name.trim(),
          wallet: session.wallet,
          publicClient,
          encryption: session.keys.encryption,
          keyIndex: agents.length,
        });
      // Monad checks balances against state a few blocks behind, and the public RPC
      // sits in front of several nodes, some of which lag further. A funded account
      // can still get "insufficient balance" from one of them: try again, backing off.
      let agent: Agent | null = null;
      for (const wait of [0, 3000, 6000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        try {
          agent = await register();
          break;
        } catch (err) {
          if (!/insufficient balance/i.test(String(err)) || wait === 6000) throw err;
        }
      }
      if (!agent) throw new Error("registration did not go through");
      setProgress("done");
      setAgents((a) => [agent, ...a]);
      // Minted a moment ago: it cannot have stamps yet, so its totals are known.
      setSummary((s) => new Map(s).set(String(agent.id), { actions: 0, usdc: 0n }));
      setName("");
      setShowRegister(false);
      setProgress("idle");
    } catch (err) {
      // Chain errors are pages long; show one sentence.
      const msg = err instanceof Error ? err.message : String(err);
      setTxError(
        /insufficient balance/i.test(msg)
          ? "Your account's gas hasn't reached Monad yet. Wait a few seconds and try again."
          : /user rejected|denied|not allowed/i.test(msg)
            ? "The passkey prompt was dismissed."
            : msg.split("\n")[0].slice(0, 160),
      );
      setProgress("idle");
    }
  }

  async function onRevoke() {
    if (!session || !revoking) return;
    setRevokeBusy(true);
    try {
      // Irreversible for this runtime: ask for the passkey even inside a live session.
      setRevokeStage("passkey");
      await confirm();
      setRevokeStage("sending");
      await ensureGas(publicClient, session.address);
      await disconnectRuntime({ agentId: revoking.id, wallet: session.wallet, publicClient });
      notify("Runtime revoked", "It can no longer create stamps for this agent. Existing stamps remain verifiable.");
      setRevoking(null);
      void refresh();
    } catch (err) {
      notify("Could not revoke", err instanceof Error ? err.message : String(err));
    } finally {
      setRevokeBusy(false);
      setRevokeStage(null);
    }
  }

  const working = progress === "gas" || progress === "signing";
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  if (!session) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-4 pb-32 pt-24 md:px-8">
        <div className="mx-auto max-w-md">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-secondary">
            <Fingerprint size={22} strokeWidth={1.5} />
          </div>
          <h1 className={`mt-6 text-[40px] font-semibold leading-none tracking-tight ${ended === null ? "invisible" : ""}`}>
            {ended ? "Your session ended" : "Sign in to Kleos"}
          </h1>
          <p className={`mt-4 text-secondary ${ended === null ? "invisible" : ""}`}>
            {ended
              ? "Your agents are onchain. Your session is not. Your signing and encryption keys live in memory only; reloading clears them by design. One Touch ID restores the same keys."
              : "One passkey. No seed phrase, no extension, no account. Your keys are derived from your passkey each time, on any device where it syncs."}
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Button size="lg" variant="accent" disabled={busy} onClick={() => signIn()}>
              {/* The idle labels are stacked invisibly so the button keeps its width;
                  the waiting state (spinner + "Waiting…") is narrower, so the row
                  never re-wraps when it is pressed. */}
              <span className="grid">
                {["Continue with passkey", "Sign in with passkey"].map((l) => (
                  <span key={l} aria-hidden className="invisible col-start-1 row-start-1 whitespace-nowrap">
                    {l}
                  </span>
                ))}
                <span className="col-start-1 row-start-1 inline-flex items-center justify-center gap-2 whitespace-nowrap">
                  {busy && <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />}
                  {busy ? "Waiting…" : ended ? "Continue with passkey" : "Sign in with passkey"}
                </span>
              </span>
            </Button>
            <Button size="lg" variant="ghost" disabled={busy} onClick={create}>
              New here? Create a passkey
            </Button>
          </div>
          {error && <p className="mt-4 text-sm text-error">{error}</p>}
          <p className="mt-10 text-xs text-tertiary">
            Works with passkeys saved in iCloud Keychain or Google Password Manager.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-32 pt-12 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[40px] font-semibold leading-none tracking-tight">My agents</h1>
          <div className="mt-3">
            {/* Your owner address, open on the explorer (same arrow link as the profile's addresses) */}
            <a
              href={`${chain.blockExplorers.default.url}/address/${session.address}`}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-1 font-mono text-[13px] text-secondary hover:text-primary"
            >
              {shortHex(session.address, 8, 6)}
              <ArrowUpRight size={12} strokeWidth={1.5} className="text-tertiary group-hover:text-primary" />
            </a>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Session pill: a ring that empties as the session runs out, the time left, and a way out */}
          <div className="flex h-9 items-center rounded-full border border-border bg-surface pl-3 pr-1">
            <span tabIndex={0} aria-describedby="session-info" className="group/time relative flex items-center outline-none">
              <SessionRing fraction={secondsLeft / (SESSION_MINUTES * 60)} low={secondsLeft < 120} />
              <span className="ml-2 text-[13px] text-secondary">
                Signed in <span className="text-tertiary">·</span>{" "}
                <span className="font-mono tabular-nums text-primary">
                  {mm}:{ss}
                </span>
              </span>
              <span
                id="session-info"
                role="tooltip"
                className="pointer-events-none absolute left-0 top-full z-20 mt-3 w-60 rounded-[8px] border border-border bg-surface-elevated p-3 text-xs leading-relaxed text-secondary opacity-0 transition-opacity duration-[120ms] group-hover/time:opacity-100 group-focus-visible/time:opacity-100"
              >
                Time left before you are signed out. To continue after that, sign in again with your passkey.
              </span>
            </span>
            <span aria-hidden className="mx-2 h-4 w-px bg-border" />
            <span className="group/end relative flex">
              <button
                type="button"
                onClick={end}
                aria-label="End session"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-tertiary hover:bg-surface-hover hover:text-primary"
              >
                <LogOut size={14} strokeWidth={1.5} />
              </button>
              <span
                aria-hidden
                className="pointer-events-none absolute right-0 top-full z-20 mt-2 whitespace-nowrap rounded-[8px] border border-border bg-surface-elevated px-2.5 py-1.5 text-xs text-secondary opacity-0 transition-opacity duration-[120ms] group-hover/end:opacity-100 group-focus-within/end:opacity-100"
              >
                End session
              </span>
            </span>
          </div>
          <Button variant="accent" onClick={openRegister}>
            <Plus size={16} strokeWidth={1.5} />
            Register your agent
          </Button>
        </div>
      </div>

      {/* Register in a modal over the blurred page; it cannot be dismissed while the transaction runs */}
      <Modal open={showRegister} onClose={() => setShowRegister(false)} locked={working} labelledBy="register-title">
        <Card className="overflow-hidden">
          <form onSubmit={onRegister}>
            {/* Header: brand tile, title, close */}
            <div className="flex items-start gap-4 px-6 pt-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-accent/15">
                <Mark size={22} className="text-accent" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="register-title" className="text-[22px] font-semibold leading-tight">Register your agent</h2>
                <p className="mt-1 text-sm text-secondary">Give it an onchain identity it keeps across platforms.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegister(false)}
                disabled={working}
                aria-label="Close"
                className="-mr-2 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-tertiary enabled:hover:bg-surface-hover enabled:hover:text-primary disabled:opacity-40"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            {/* Name */}
            <div className="px-6 pt-6">
              <Label>Agent name</Label>
              <Input
                className="mt-2"
                placeholder="e.g. Research Agent"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={working}
                autoFocus
              />
              <p className="mt-1.5 text-xs text-tertiary">Public. Shown on Explore and on the agent&apos;s profile.</p>
            </div>

            {/* What happens, or live progress once it runs */}
            <div className="mx-6 mt-5 rounded-[10px] border border-border-subtle bg-background p-4">
              {working ? (
                <ol className="space-y-2.5 text-sm">
                  {steps.map((s, i) => {
                    const done = steps.findIndex((x) => x.key === progress) > i;
                    const active = s.key === progress;
                    return (
                      <li key={s.key} className={`flex items-center gap-3 ${done || active ? "text-primary" : "text-tertiary"}`}>
                        {done ? (
                          <Check size={16} strokeWidth={2} className="text-success" />
                        ) : active ? (
                          <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-secondary" />
                        ) : (
                          <span className="inline-block h-4 w-4 rounded-full border border-border" />
                        )}
                        {s.label}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <ul className="space-y-3 text-sm">
                  <li className="flex gap-3">
                    <Fingerprint size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" />
                    <span className="text-secondary">
                      <span className="text-primary">Confirmed by your passkey session.</span> No wallet pop-up.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <BadgeCheck size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" />
                    <span className="text-secondary">
                      <span className="text-primary">An ERC-8004 identity on {chain.name},</span> owned by your passkey address.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <Lock size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" />
                    <span className="text-secondary">
                      <span className="text-primary">Your encryption key is written next to it,</span> so only you can read what
                      the agent was paid to get.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <Fuel size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" />
                    <span className="text-secondary">
                      <span className="text-primary">Gas is on us</span> on testnet.
                    </span>
                  </li>
                </ul>
              )}
            </div>
            {txError && <p className="mx-6 mt-4 text-sm text-error">{txError}</p>}

            {/* Footer */}
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-border-subtle px-6 py-4">
              <Button type="button" variant="ghost" onClick={() => setShowRegister(false)} disabled={working}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={!name.trim() || working} loading={working}>
                {working ? "Registering…" : "Register agent"}
              </Button>
            </div>
          </form>
        </Card>
      </Modal>

      {/* Connect a runtime in a modal, opened right where the button was pressed. `shownConnect`
          keeps the form on screen while the modal fades out. */}
      <Modal open={Boolean(connecting)} onClose={() => setConnecting(null)} width="xl" labelledBy="connect-title">
        {shownConnect && (
          <ConnectRuntime
            key={String(shownConnect.id)}
            agent={shownConnect}
            onCancel={() => setConnecting(null)}
            onDone={() => {
              setConnecting(null);
              void refresh();
            }}
          />
        )}
      </Modal>

      {/* Confirm in a modal over the blurred page. `shownRevoke` keeps the text during the close animation. */}
      <Modal open={Boolean(revoking)} onClose={() => setRevoking(null)} locked={revokeBusy} labelledBy="revoke-title">
        {shownRevoke && (
        <Card className="p-6">
          <h2 id="revoke-title" className="text-[24px] font-semibold leading-tight">Revoke this runtime?</h2>
          <p className="mt-2 text-sm text-secondary">
            <Mono className="text-primary">{shortHex(shownRevoke.wallet ?? "")}</Mono> will no longer be able to create stamps for{" "}
            {shownRevoke.name}. Existing stamps remain verifiable. You will confirm with your passkey.
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="danger" onClick={onRevoke} loading={revokeBusy} disabled={revokeBusy}>
              {!revokeBusy && <Fingerprint size={16} strokeWidth={1.5} />}
              {revokeStage === "passkey" ? "Waiting for passkey…" : revokeStage === "sending" ? "Revoking…" : "Revoke with passkey"}
            </Button>
            <Button variant="ghost" onClick={() => setRevoking(null)} disabled={revokeBusy}>
              Cancel
            </Button>
          </div>
        </Card>
        )}
      </Modal>

      <section className="mt-10">
        {loadingAgents && agents.length === 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <Card key={i} className="p-5" aria-hidden>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold leading-tight"><Shimmer>Agent name</Shimmer></div>
                    <Mono className="mt-1 block"><Shimmer>Agent #0000</Shimmer></Mono>
                  </div>
                  <span className="h-6 w-28 animate-pulse rounded-full bg-surface-elevated" />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <div className="metric"><Shimmer>00</Shimmer></div>
                    <Label className="mt-1">Verified actions</Label>
                  </div>
                  <div>
                    <div className="metric"><Shimmer>$0.00</Shimmer></div>
                    <Label className="mt-1">USDC settled</Label>
                  </div>
                </div>
                <p className="mt-4 rounded-[8px] border border-border-subtle bg-background px-3 py-2.5 text-xs text-secondary">
                  <Shimmer>Identity ready. Nothing can stamp actions yet. Connect the runtime that runs this agent.</Shimmer>
                </p>
                <dl className="mt-5 space-y-2 border-t border-border-subtle pt-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt><Label>Runtime</Label></dt>
                    <dd><Mono><Shimmer>0x0000…0000</Shimmer></Mono></dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt><Label>Encryption key</Label></dt>
                    <dd><Mono><Shimmer>0x000000…000000</Shimmer></Mono></dd>
                  </div>
                </dl>
                <div className="mt-5 flex items-center gap-2">
                  <span className="h-10 w-40 animate-pulse rounded-[10px] bg-surface-elevated" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {!loadingAgents && agents.length === 0 && (
          <Card className="p-10 text-center">
            <p className="text-secondary">No agents yet.</p>
            <p className="mt-1 text-sm text-tertiary">Register one to give it an identity and start a track record.</p>
            <Button variant="accent" className="mt-6" onClick={openRegister}>
              <Plus size={16} strokeWidth={1.5} />
              Register your agent
            </Button>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((a) => (
            <Card key={String(a.id)} hover className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold leading-tight">{a.name}</div>
                  <Mono className="mt-1 block text-secondary">Agent #{String(a.id)}</Mono>
                </div>
                {a.wallet ? (
                  <Badge tone="success">
                    <Check size={12} strokeWidth={2} />
                    Runtime paired
                  </Badge>
                ) : (
                  <Badge>No runtime</Badge>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4">
                <div>
                  <div className="metric">{summary.has(String(a.id)) ? summary.get(String(a.id))!.actions : <Shimmer>00</Shimmer>}</div>
                  <Label className="mt-1">Verified actions</Label>
                </div>
                <div>
                  <div className="metric">{summary.has(String(a.id)) ? formatUsdc(summary.get(String(a.id))!.usdc) : <Shimmer>$0.00</Shimmer>}</div>
                  <Label className="mt-1">USDC settled</Label>
                </div>
              </div>

              {!a.wallet ? (
                <p className="mt-4 rounded-[8px] border border-border-subtle bg-background px-3 py-2.5 text-xs text-secondary">
                  <span className="text-primary">Identity ready.</span> Nothing can stamp actions yet. Connect the runtime that runs this agent.
                </p>
              ) : !summary.has(String(a.id)) ? (
                <p aria-hidden className="mt-4 rounded-[8px] border border-border-subtle bg-background px-3 py-2.5 text-xs text-secondary">
                  <Shimmer>Ready. Its first paid action will create the first stamp.</Shimmer>
                </p>
              ) : summary.get(String(a.id))!.actions === 0 ? (
                <p className="mt-4 rounded-[8px] border border-border-subtle bg-background px-3 py-2.5 text-xs text-secondary">
                  <span className="text-primary">Ready.</span> Its first paid action will create the first stamp.
                </p>
              ) : (
                <p className="mt-4 rounded-[8px] border border-border-subtle bg-background px-3 py-2.5 text-xs text-secondary">
                  <span className="text-primary">Stamping.</span> Every paid action it makes adds to its record.
                </p>
              )}

              {/* pinned to the bottom so cards in a row line up even when one has a note */}
              <div className="mt-auto">
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
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setConnecting(a);
                      setShownConnect(a);
                    }}
                  >
                    <Link2 size={16} strokeWidth={1.5} />
                    Connect runtime
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRevoking(a);
                      setShownRevoke(a);
                    }}
                  >
                    <Unlink size={16} strokeWidth={1.5} />
                    Revoke runtime
                  </Button>
                )}
                <Link href={`/a/${a.id}`} className="ml-auto inline-flex items-center gap-1 text-sm text-secondary hover:text-primary">
                  View agent <ArrowRight size={14} strokeWidth={1.5} />
                </Link>
              </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
