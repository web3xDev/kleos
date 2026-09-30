"use client";

// See a stamp being born. One click runs the demo agent through a real
// paid call on Monad and shows every step as it lands. Two modes:
//   Pay first: the classic x402 call, stamped.
//   Pay later: the same tool reads the agent's Kleos record and, by its own
//   rule, serves it before payment; the credit is an invoice on KleosCredit.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Ban, Check, Loader2, Play, X } from "lucide-react";
import { chain } from "@/lib/chain";
import { Button, Card, Label, Mono, shortHex } from "@/components/ui";
import { JsonView } from "@/components/json-view";
import { Wordmark } from "@/components/mark";
import { Segmented } from "@/components/segmented";
import { SmoothHeight } from "@/components/smooth-height";

type Status = "idle" | "start" | "done" | "declined" | "error";
type Row = { key: string; title: string; who: string; status: Status; detail?: string; ms?: number };
type Mode = "first" | "later";
type Kind = "classic" | "credit" | "newcomer";

const PAY_LATER_ROWS: Omit<Row, "status">[] = [
  { key: "ask", title: "Agent asks to pay later", who: "Signs consent to be invoiced (EIP-712, by its runtime)" },
  { key: "record", title: "Kleos Engine v0 decides", who: "Reads stamps and invoices from Monad, applies the tool's rule" },
  { key: "served", title: "Served before payment", who: "The answer arrives now. Nothing has been paid yet" },
  { key: "invoice", title: "Invoice opened on Monad", who: "KleosCredit.open() · only with the agent's signed consent" },
  { key: "pay", title: "Agent pays the invoice", who: "x402 · $0.01 to the tool" },
  { key: "stamp", title: "Stamp anchored, countersigned", who: "The payment joins the track record" },
  { key: "close", title: "Invoice closed on Monad", who: "KleosCredit.pay() · closed by that stamp" },
];

// Detail values that are transaction hashes, per mode (they link to the explorer).
const TX_KEYS: Record<Mode, string[]> = { first: ["payment", "anchor"], later: ["invoice", "pay", "stamp", "close"] };

const ROWS: Omit<Row, "status">[] = [
  { key: "agent", title: "Agent wakes up", who: "Agent #1910 · runtime checks it is the registered wallet" },
  { key: "tool", title: "Calls a paid tool", who: "x402 · $0.01 · kleos-demo/monad-block" },
  { key: "countersign", title: "Tool countersigns", who: "Signed by the address that was paid · commits to the answer it served" },
  { key: "payment", title: "Payment settles on Monad", who: "USDC transferWithAuthorization, submitted by the facilitator" },
  { key: "stamp", title: "Receipt signed and sealed", who: "EIP-191 by the runtime · body encrypted to the owner" },
  { key: "anchor", title: "Stamp anchored on Monad", who: "KleosStamps.stamp() · only the registered runtime can" },
];

// Grows a step's details open instead of popping them in: animates the
// row's height (grid 0fr → 1fr) and fades the content.
// Opens its height first; the content then settles in: it rises a little,
// comes into focus and fades in, slightly behind the height so it never
// appears before there is room for it. Closing reverses without the delay.
function Expand({ open, children, slow = false }: { open: boolean; children: React.ReactNode; slow?: boolean }) {
  const ease = "cubic-bezier(0.2, 0, 0, 1)";
  const height = slow ? 600 : 320;
  const content = slow ? 520 : 280;
  return (
    <div
      className={`grid ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      style={{ transition: `grid-template-rows ${height}ms ${ease}` }}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          style={{
            opacity: open ? 1 : 0,
            transform: open ? "none" : "translateY(12px) scale(0.985)",
            filter: open ? "none" : "blur(6px)",
            transformOrigin: "50% 0",
            transition: `opacity ${content}ms ${ease}, transform ${content}ms ${ease}, filter ${content}ms ${ease}`,
            transitionDelay: open ? `${Math.round(height / 5)}ms` : "0ms",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// Chain errors are long and technical; show one plain sentence instead.
function plainError(msg: string): string {
  if (/insufficient (balance|funds)/i.test(msg)) return "The demo agent is out of gas right now. Try again in a little while.";
  if (/busy/i.test(msg)) return msg;
  if (/not this agent's wallet/i.test(msg)) return "The demo runtime is no longer paired to agent #1910.";
  return msg.split("\n")[0].slice(0, 160);
}

const idle = (mode: Mode): Row[] => (mode === "first" ? ROWS : PAY_LATER_ROWS).map((r) => ({ ...r, status: "idle" }));

export default function TryPage() {
  const [mode, setMode] = useState<Mode>("first");
  const [kind, setKind] = useState<Kind>("classic");
  const [rows, setRows] = useState<Row[]>(idle("first"));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  // Pay later outcomes other than "paid": credit declined, or invoice left unpaid (dev only).
  const [declined, setDeclined] = useState<string | null>(null);
  const [unpaid, setUnpaid] = useState(false);
  // The open invoice's due date (unix seconds), and a clock that ticks while it is unpaid.
  const [dueAt, setDueAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!unpaid || dueAt === null) return;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [unpaid, dueAt]);

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function reset(next: Mode) {
    setError(null);
    setProfile(null);
    setAnswer(null);
    setDeclined(null);
    setUnpaid(false);
    setDueAt(null);
    setRows(idle(next));
  }

  function switchMode(next: Mode) {
    if (running || next === mode) return;
    setMode(next);
    reset(next);
  }

  async function run(k: Kind, opts: { skipPayment?: boolean } = {}) {
    setRunning(true);
    setKind(k);
    reset(k === "classic" ? "first" : "later");
    // The step that carries the tool's answer, per flow.
    const answerStep = k === "classic" ? "tool" : "served";
    try {
      const res =
        k === "classic"
          ? await fetch("/api/demo/run", { method: "POST" })
          : await fetch("/api/demo/credit", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ as: k === "credit" ? "agent" : "newcomer", skipPayment: opts.skipPayment }),
            });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `demo failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { step: string; status: Status; detail?: string; ms?: number; dueAt?: number };
          if (ev.dueAt) setDueAt(ev.dueAt);
          if (ev.step === "done") {
            setProfile(ev.detail ?? null);
            continue;
          }
          if (ev.step === "error") {
            setError(plainError(ev.detail ?? "failed"));
            setRows((rs) => rs.map((r) => (r.status === "start" ? { ...r, status: "error" } : r)));
            continue;
          }
          if (ev.step === "declined") {
            setDeclined(ev.detail ?? "Credit declined.");
            continue;
          }
          if (ev.step === "pay" && ev.status === "declined") setUnpaid(true);
          const isAnswer = ev.step === answerStep && ev.status === "done";
          if (isAnswer) setAnswer(ev.detail ?? null);
          update(ev.step, { status: ev.status, detail: isAnswer ? undefined : ev.detail, ms: ev.ms });
        }
      }
    } catch (e) {
      setError(plainError(e instanceof Error ? e.message : String(e)));
      setRows((rs) => rs.map((r) => (r.status === "start" ? { ...r, status: "error" } : r)));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-32 pt-12 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[40px] font-semibold leading-none tracking-tight">See a stamp being born.</h1>
          <p className="mt-3 max-w-xl text-secondary">
            Our demo agent makes one real paid call on {chain.name} and stamps it. Nothing is mocked: the payment
            settles, the receipt is anchored, and the profile updates.
          </p>
        </div>
      </div>

      {/* Two ways to buy the same tool call */}
      <Segmented
        label="Demo"
        className="mt-8"
        options={[
          ["first", "Pay first"],
          ["later", "Pay later, with a track record"],
        ]}
        value={mode}
        onChange={switchMode}
        disabled={running}
      />

      {/* Run bar: what is about to run, and who pays for it */}
      <Card className="mt-4 p-5">
        {/* Switching the toggle: the box resizes smoothly and the new content fades in (keyed on mode) */}
        <SmoothHeight>
        <div key={mode} className="swap-in">
        {mode === "first" ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Mono className="text-[11px] tracking-[0.14em] text-primary">DEMO AGENT #1910 · {chain.name.toUpperCase()} · REAL SETTLEMENT</Mono>
              <div className="mt-1.5 text-xs text-tertiary">Kleos-owned, funded by us · $0.01 per run</div>
            </div>
            <Button variant="accent" onClick={() => run("classic")} loading={running} disabled={running}>
              <Play size={16} strokeWidth={1.5} />
              Run an action
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-md">
              <Mono className="text-[11px] tracking-[0.14em] text-primary">SAME TOOL · ASKED FOR CREDIT</Mono>
              <div className="mt-1.5 text-xs text-tertiary">
                The tool reads the agent&apos;s Kleos record and applies its own rule: at least 20 verified actions, no unpaid
                invoices. Kleos gives the facts; the tool decides.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => run("newcomer")} disabled={running}>
                Run as a new agent
              </Button>
              <Button variant="accent" onClick={() => run("credit")} loading={running && kind === "credit"} disabled={running}>
                <Play size={16} strokeWidth={1.5} />
                Run as Agent #1910
              </Button>
            </div>
          </div>
        )}
        {/* Dev only: take credit and do not pay, to see an overdue invoice on the profile */}
        {mode === "later" && process.env.NODE_ENV === "development" && (
          <button
            className="mt-3 text-xs text-tertiary underline decoration-dotted underline-offset-2 enabled:hover:text-secondary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => run("credit", { skipPayment: true })}
            disabled={running}
          >
            Dev: take credit and leave the invoice unpaid
          </button>
        )}
        </div>
        </SmoothHeight>
      </Card>

      {/* Desktop: the steps on the left, what they produce (record, answer) on the right */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
      <div className="min-w-0">
      {/* Protocol timeline: titles always, mechanism and proof once a step starts. Keyed on mode so a toggle swap fades in. */}
      <ol key={mode} className="swap-in">
        {rows.map((r, i) => {
          const last = i === rows.length - 1;
          const isTx = TX_KEYS[mode].includes(r.key);
          return (
            <li key={r.key} className="relative flex gap-4 pb-6 last:pb-0">
              {!last && <span aria-hidden className="absolute left-[9px] top-7 bottom-1 w-px bg-border-subtle" />}
              <div className="mt-0.5 flex w-5 shrink-0 justify-center">
                {r.status === "start" ? (
                  <Loader2 size={18} strokeWidth={1.5} className="animate-spin text-secondary" />
                ) : r.status === "done" ? (
                  <Check size={18} strokeWidth={2} className="text-success" />
                ) : r.status === "error" ? (
                  <X size={18} strokeWidth={2} className="text-error" />
                ) : r.status === "declined" ? (
                  // A decision, not a failure: neutral, not red.
                  <Ban size={18} strokeWidth={1.5} className="text-secondary" />
                ) : (
                  <span className="block h-[18px] w-[18px] rounded-full border border-border" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                  <Mono className="inline-block w-[18px] shrink-0 text-xs text-tertiary">{String(i + 1).padStart(2, "0")}</Mono>
                  <span className={`text-sm font-medium transition-colors duration-300 ${r.status === "idle" ? "text-tertiary" : "text-primary"}`}>{r.title}</span>
                  {r.ms !== undefined && r.status !== "idle" && (
                    <Mono className="ml-auto text-[11px] text-tertiary">{(r.ms / 1000).toFixed(1)}s</Mono>
                  )}
                </div>
                <Expand open={r.status !== "idle"}>
                  <div className="pl-[30px]">
                    <div className="pt-0.5 text-xs text-tertiary">{r.who}</div>
                    <Expand open={Boolean(r.detail)}>
                      {r.detail && (
                      <div className="pt-2">
                        {r.status === "error" ? (
                          <Mono className="text-xs text-error">{r.detail}</Mono>
                        ) : r.key === "countersign" && r.detail.startsWith("0x") ? (
                          <a
                            href={`${chain.blockExplorers.default.url}/address/${r.detail}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-secondary hover:text-primary"
                          >
                            <span className="text-tertiary">Tool </span>
                            {shortHex(r.detail, 8, 6)} <ArrowUpRight size={12} strokeWidth={1.5} />
                          </a>
                        ) : isTx && r.detail.startsWith("0x") ? (
                          <a
                            href={`${chain.blockExplorers.default.url}/tx/${r.detail}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-secondary hover:text-primary"
                          >
                            {shortHex(r.detail, 12, 10)} <ArrowUpRight size={12} strokeWidth={1.5} />
                          </a>
                        ) : mode === "first" && r.key === "stamp" && r.detail.startsWith("0x") ? (
                          <Mono className="text-xs text-secondary">
                            <span className="text-tertiary">Receipt hash </span>
                            {shortHex(r.detail, 12, 10)}
                          </Mono>
                        ) : (
                          <Mono className="text-xs text-secondary">{r.detail}</Mono>
                        )}
                      </div>
                      )}
                    </Expand>
                  </div>
                </Expand>
              </div>
            </li>
          );
        })}
      </ol>

      {error && <p className="mt-6 text-sm text-error">{error}</p>}
      </div>

      {/* Every block grows open and fades in (Expand), so nothing pops in or pushes others abruptly */}
      <div className="lg:sticky lg:top-24">
      {/* Before the first run, say what will land here */}
      <Expand open={!profile && !answer && !declined} slow>
        <div className="pb-6">
        <div className="rounded-[10px] border border-dashed border-border p-6">
          <Wordmark size={20} muted />
          <p className="mt-4 text-sm text-secondary">The result lands here.</p>
          <p className="mt-1 text-sm text-tertiary">
            {mode === "first"
              ? "First what the tool answered, then the agent's updated track record."
              : "The tool's decision, then either the answer before payment or a request to pay first."}
          </p>
        </div>
        </div>
      </Expand>

      {/* Pay later, declined: the record was not enough for this tool's rule */}
      <Expand open={Boolean(declined)} slow>
      {declined && (
        <div className="pb-6">
        <Card className="p-6">
          <Wordmark size={20} />
          <div className="mt-4 text-lg font-semibold text-primary">Credit declined</div>
          <div className="mt-1 text-sm text-secondary">{declined}</div>
          <p className="mt-3 text-xs text-tertiary">
            Same tool, same request. The only difference between this agent and #1910 is a record anyone can verify.
          </p>
          <Button variant="accent" className="mt-5" onClick={() => run("credit")} disabled={running}>
            Now run as Agent #1910 <ArrowRight size={14} strokeWidth={1.5} />
          </Button>
        </Card>
        </div>
      )}
      </Expand>

      {/* The point of the run: the record moved */}
      <Expand open={Boolean(profile)} slow>
      {profile && (
        <div className="pb-6">
        {/* A purple light runs once around the card when the record moved (not for an unpaid invoice) */}
        <Card className={`p-6 ${unpaid ? "" : "border-sweep"}`}>
          <Wordmark size={20} />
          <div className="mt-4 flex items-baseline justify-between gap-4">
            <div className="text-lg font-semibold text-primary">
              {kind === "classic"
                ? "Track record updated"
                : unpaid
                  ? dueAt !== null && now >= dueAt
                    ? "Invoice overdue"
                    : "Invoice left unpaid"
                  : "Served first, paid after"}
            </div>
            <Mono className="text-secondary">#1910</Mono>
          </div>
          <div className="mt-1 text-sm text-secondary">
            {kind === "classic"
              ? "One more verified action, provable by anyone."
              : unpaid
                ? dueAt === null
                  ? "It turns overdue soon, and the agent's profile will show it as unpaid."
                  : now < dueAt
                    ? (
                      <>
                        It turns overdue in{" "}
                        <Mono className="tabular-nums text-primary">
                          {Math.floor((dueAt - now) / 60)}:{String((dueAt - now) % 60).padStart(2, "0")}
                        </Mono>
                        , and the agent&apos;s profile will show it as unpaid.
                      </>
                    )
                    : <span className="text-error">It is overdue now. The agent&apos;s profile shows it as unpaid.</span>
                : "The invoice closed with a countersigned stamp: one more verified action, and a clean credit history."}
          </div>
          <Link href={profile} className="mt-5 inline-block">
            <Button variant="accent">
              View agent profile <ArrowRight size={14} strokeWidth={1.5} />
            </Button>
          </Link>
        </Card>
        </div>
      )}
      </Expand>

      <Expand open={Boolean(answer)} slow>
      {answer && (
        <div>
          <Label>What the agent got back</Label>
          <JsonView value={answer} className="mt-2 max-h-48 !p-3 !text-xs" />
          <p className="mt-2 text-xs text-tertiary">
            Shown here because this is the demo agent. On a real agent, the answer is sealed to its owner.
          </p>
        </div>
      )}
      </Expand>
      </div>
      </div>
    </main>
  );
}
