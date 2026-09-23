"use client";

// See a stamp being born. One click runs the demo agent through a real
// paid call on Monad and shows every step as it lands.

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, Play, X } from "lucide-react";
import { chain } from "@/lib/chain";
import { Button, Card, Label, Mono, shortHex } from "@/components/ui";
import { JsonView } from "@/components/json-view";

type Status = "idle" | "start" | "done" | "error";
type Row = { key: string; title: string; who: string; status: Status; detail?: string; ms?: number };

const ROWS: Omit<Row, "status">[] = [
  { key: "agent", title: "Agent wakes up", who: "Agent #1910 · runtime checks it is the registered wallet" },
  { key: "tool", title: "Calls a paid tool", who: "x402 · 0.01 USDC · kleos-demo/monad-block" },
  { key: "payment", title: "Payment settles on Monad", who: "USDC transferWithAuthorization, submitted by the facilitator" },
  { key: "stamp", title: "Receipt signed and sealed", who: "EIP-191 by the runtime wallet · body encrypted to the owner" },
  { key: "anchor", title: "Stamp anchored on Monad", who: "KleosStamps.stamp() · only the registered runtime can" },
];

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
            setError(ev.detail ?? "failed");
            continue;
          }
          if (ev.step === "tool" && ev.status === "done") setAnswer(ev.detail ?? null);
          update(ev.step, { status: ev.status, detail: ev.step === "tool" && ev.status === "done" ? undefined : ev.detail, ms: ev.ms });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-12 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[40px] font-semibold leading-none tracking-tight">See a stamp being born.</h1>
          <p className="mt-3 max-w-xl text-secondary">
            Our demo agent makes one real paid call on {chain.name} and stamps it. Nothing is mocked: the payment
            settles, the receipt is anchored, and the profile updates.
          </p>
        </div>
      </div>

      <Card className="mt-8 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-tertiary">
            This demo agent is owned by Kleos and funded by us. Each run costs it 0.01 USDC.
          </div>
          <Button variant="accent" onClick={run} loading={running} disabled={running}>
            <Play size={16} strokeWidth={1.5} />
            Run an action
          </Button>
        </div>
      </Card>

      <ol className="mt-6 divide-y divide-border-subtle rounded-[10px] border border-border bg-surface">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start gap-4 px-5 py-4">
            <div className="mt-0.5 w-5">
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
              <div className={`text-sm font-medium ${r.status === "idle" ? "text-tertiary" : "text-primary"}`}>{r.title}</div>
              <div className="mt-0.5 text-xs text-tertiary">{r.who}</div>
              {r.detail && (
                <div className="mt-2">
                  {r.detail.startsWith("0x") && r.detail.length === 66 ? (
                    <a
                      href={`${chain.blockExplorers.default.url}/tx/${r.detail}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-secondary underline decoration-transparent underline-offset-2 hover:text-primary hover:decoration-current"
                    >
                      {shortHex(r.detail, 12, 10)}
                    </a>
                  ) : (
                    <Mono className={`text-xs ${r.status === "error" ? "text-error" : "text-secondary"}`}>{r.detail}</Mono>
                  )}
                </div>
              )}
            </div>
            {r.ms !== undefined && r.status !== "idle" && (
              <Mono className="hidden text-[11px] text-tertiary sm:block">{(r.ms / 1000).toFixed(1)}s</Mono>
            )}
          </li>
        ))}
      </ol>

      {answer && (
        <div className="mt-6">
          <Label>What the agent got back</Label>
          <JsonView value={answer} className="mt-2" />
          <p className="mt-2 text-xs text-tertiary">
            Shown here because this is the demo agent. On a real agent, the answer is sealed to its owner.
          </p>
        </div>
      )}

      {error && <p className="mt-6 text-sm text-error">{error}</p>}

      {profile && (
        <Card className="mt-8 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="text-sm font-medium">Track record updated</div>
            <div className="mt-0.5 text-xs text-tertiary">One more verified action, provable by anyone.</div>
          </div>
          <Link href={profile}>
            <Button variant="secondary">
              View agent profile <ArrowRight size={14} strokeWidth={1.5} />
            </Button>
          </Link>
        </Card>
      )}
    </main>
  );
}
