"use client";

// See a stamp being born. One click runs the demo agent through a real
// paid call on Monad and shows every step as it lands.

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Loader2, Play, X } from "lucide-react";
import { chain } from "@/lib/chain";
import { Button, Card, Label, Mono, shortHex } from "@/components/ui";
import { JsonView } from "@/components/json-view";
import { Mark } from "@/components/mark";

type Status = "idle" | "start" | "done" | "error";
type Row = { key: string; title: string; who: string; status: Status; detail?: string; ms?: number };

const ROWS: Omit<Row, "status">[] = [
  { key: "agent", title: "Agent wakes up", who: "Agent #1910 · runtime checks it is the registered wallet" },
  { key: "tool", title: "Calls a paid tool", who: "x402 · $0.01 · kleos-demo/monad-block" },
  { key: "payment", title: "Payment settles on Monad", who: "USDC transferWithAuthorization, submitted by the facilitator" },
  { key: "stamp", title: "Receipt signed and sealed", who: "EIP-191 by the runtime · body encrypted to the owner" },
  { key: "anchor", title: "Stamp anchored on Monad", who: "KleosStamps.stamp() · only the registered runtime can" },
];

// Grows a step's details open instead of popping them in: animates the
// row's height (grid 0fr → 1fr) and fades the content.
function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
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

export default function TryPage() {
  const [rows, setRows] = useState<Row[]>(ROWS.map((r) => ({ ...r, status: "idle" })));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function run() {
    setRunning(true);
    setError(null);
    setProfile(null);
    setAnswer(null);
    setRows(ROWS.map((r) => ({ ...r, status: "idle" })));
    try {
      const res = await fetch("/api/demo/run", { method: "POST" });
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
          const ev = JSON.parse(line) as { step: string; status: Status; detail?: string; ms?: number };
          if (ev.step === "done") {
            setProfile(ev.detail ?? null);
            continue;
          }
          if (ev.step === "error") {
            setError(plainError(ev.detail ?? "failed"));
            setRows((rs) => rs.map((r) => (r.status === "start" ? { ...r, status: "error" } : r)));
            continue;
          }
          if (ev.step === "tool" && ev.status === "done") setAnswer(ev.detail ?? null);
          update(ev.step, { status: ev.status, detail: ev.step === "tool" && ev.status === "done" ? undefined : ev.detail, ms: ev.ms });
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

      {/* Run bar: what is about to run, and who pays for it */}
      <Card className="mt-8 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Mono className="text-[11px] tracking-[0.14em] text-primary">DEMO AGENT #1910 · {chain.name.toUpperCase()} · REAL SETTLEMENT</Mono>
            <div className="mt-1.5 text-xs text-tertiary">Kleos-owned, funded by us · $0.01 per run</div>
          </div>
          <Button variant="accent" onClick={run} loading={running} disabled={running}>
            <Play size={16} strokeWidth={1.5} />
            Run an action
          </Button>
        </div>
      </Card>

      {/* Protocol timeline: titles always, mechanism and proof once a step starts */}
      <ol className="mt-8">
        {rows.map((r, i) => {
          const last = i === rows.length - 1;
          const isTx = r.key === "payment" || r.key === "anchor";
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
                        ) : isTx && r.detail.startsWith("0x") ? (
                          <a
                            href={`${chain.blockExplorers.default.url}/tx/${r.detail}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-secondary hover:text-primary"
                          >
                            {shortHex(r.detail, 12, 10)} <ArrowUpRight size={12} strokeWidth={1.5} />
                          </a>
                        ) : r.key === "stamp" && r.detail.startsWith("0x") ? (
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

      {/* The point of the run: the record moved */}
      {profile && (
        <Card className="mt-8 p-6">
          <div className="flex items-center gap-2">
            <Mark size={16} className="text-accent" />
            <Mono className="text-[11px] tracking-[0.14em] text-primary">KLEOS</Mono>
          </div>
          <div className="mt-4 flex items-baseline justify-between gap-4">
            <div className="text-lg font-semibold text-primary">Track record updated</div>
            <Mono className="text-secondary">#1910</Mono>
          </div>
          <div className="mt-1 text-sm text-secondary">One more verified action, provable by anyone.</div>
          <Link href={profile} className="mt-5 inline-block">
            <Button variant="accent">
              View agent profile <ArrowRight size={14} strokeWidth={1.5} />
            </Button>
          </Link>
        </Card>
      )}

      {answer && (
        <div className="mt-8 max-w-2xl">
          <Label>What the agent got back</Label>
          <JsonView value={answer} className="mt-2 max-h-48 !p-3 !text-xs" />
          <p className="mt-2 text-xs text-tertiary">
            Shown here because this is the demo agent. On a real agent, the answer is sealed to its owner.
          </p>
        </div>
      )}
    </main>
  );
}
