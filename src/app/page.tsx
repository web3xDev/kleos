"use client";

// Landing. The product is placed inside the page: a real agent card in the
// hero, a real stamp, a real profile preview. Every number is read from
// chain; when there is nothing yet, the page says so.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Loader2, X } from "lucide-react";
import { addresses, chain } from "@/lib/chain";
import { useSession } from "@/lib/session";
import { fetchStamps, formatUsdc, verifyStamp, type Check as VerifyCheck, type Stamp } from "@/lib/stamps";
import { Button, Card, Label, Mono, VerifiedBadge, shortHex } from "@/components/ui";
import { Mark } from "@/components/mark";
import { Reveal } from "@/components/reveal";
import { Pipeline } from "@/components/pipeline";
import { Faq } from "@/components/faq";
import { Mascot } from "@/components/mascot";

type ExploreData = {
  total: number;
  withTrackRecord: number;
  totalStamps: number;
  agents: { id: number; name: string | null; stamps: number; wallet: `0x${string}` | null }[];
};

type Example = { id: number; name: string; wallet: `0x${string}` | null; stamps: Stamp[] };

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Small "KLEOS / X" tag that marks a block as a piece of the real interface. */
function Chrome({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2">
      <Mark size={12} className="text-tertiary" />
      <Mono className="text-[11px] tracking-wide text-tertiary">KLEOS / {path}</Mono>
    </div>
  );
}

function ConnectedPill({ label }: { label: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-success-muted px-2.5 text-xs font-medium text-success">{label}</span>
  );
}

export default function Home() {
  const { publicClient } = useSession();
  const [data, setData] = useState<ExploreData | null>(null);
  const [example, setExample] = useState<Example | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [checks, setChecks] = useState<VerifyCheck[][] | null>(null);

  useEffect(() => {
    fetch("/api/explore")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (d: ExploreData | null) => {
        if (!d) return;
        setData(d);
        const top = [...d.agents].sort((a, b) => b.stamps - a.stamps)[0];
        if (top && top.stamps > 0) {
          const stamps = await fetchStamps(BigInt(top.id));
          setExample({ id: top.id, name: top.name ?? `Agent #${top.id}`, wallet: top.wallet, stamps });
          // Verify the example's stamps in the browser, for real, against Monad.
          const results: VerifyCheck[][] = [];
          for (const st of stamps.slice(0, 5)) results.push(await verifyStamp(publicClient, st));
          setChecks(results);
        }
      })
      .catch(() => null)
      .finally(() => setLoaded(true));
  }, [publicClient]);

  // One row per check label: passed only when every verified stamp passed it.
  const CHECKS = ["Receipt hash recomputed", "Signed by the agent's wallet", "Anchored on Monad", "Payment settled on Monad"];
  const checkRows = CHECKS.map((label) => ({
    label,
    ok: checks ? checks.every((cs) => cs.find((c) => c.label === label)?.ok) : null,
  }));
  const passed = checkRows.filter((c) => c.ok).length;

  const usdc = example ? example.stamps.reduce((s, x) => s + BigInt(x.receipt.amount), 0n) : 0n;
  const latest = example?.stamps[0];
  const tools = example ? new Set(example.stamps.map((s) => s.receipt.tool)).size : 0;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 md:px-8">
      {/* Hero: copy on the left, the real product on the right */}
      <section className="grid gap-12 pt-24 pb-20 md:grid-cols-[1.2fr_1fr] md:items-center md:pt-40 md:pb-36">
        <div>
          <h1 className="max-w-2xl text-[44px] font-semibold leading-[0.98] tracking-tight md:text-[64px]">
            Give your agent a track record.
          </h1>
          <p className="mt-6 max-w-lg text-lg text-secondary">
            Kleos turns an agent&apos;s paid actions into a portable, verifiable history. Every paid action leaves a
            stamp next to its settlement on Monad. Anyone can verify the record.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/me">
              <Button size="lg" variant="accent">
                Register your agent
                <ArrowRight size={16} strokeWidth={1.5} />
              </Button>
            </Link>
            <Link href="/explore">
              <Button size="lg" variant="secondary">
                Explore agents
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-tertiary">Creates an ERC-8004 identity for an agent you already run. One passkey, no wallet.</p>
        </div>

        {/* Live agent card, with the mascot peeking from behind it */}
        <div className="group relative md:w-full md:max-w-sm md:justify-self-end">
          {/* peeking from behind the card's left edge: pivot at the bottom-right,
              body hidden behind the card, head leaning out */}
          <Mascot
            size={56}
            className="absolute -left-[18px] top-[34%] z-0 origin-bottom-right -rotate-[22deg] transition-transform duration-[180ms] group-hover:-rotate-[26deg]"
          />
          <Card className="relative z-10 overflow-hidden">
            <Chrome path={example ? `AGENT #${example.id}` : "AGENT"} />
            {example ? (
              <Link href={`/a/${example.id}`} className="block p-5 hover:bg-surface-hover">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold leading-tight">{example.name}</div>
                    <Mono className="mt-1 block text-secondary">Agent #{example.id}</Mono>
                  </div>
                  {example.wallet ? (
                    <ConnectedPill label="Runtime paired" />
                  ) : (
                    <span className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-xs text-secondary">No runtime</span>
                  )}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <div className="metric">{example.stamps.length}</div>
                    <Label className="mt-1">Verified actions</Label>
                  </div>
                  <div>
                    <div className="metric">{formatUsdc(usdc)}</div>
                    <Label className="mt-1">USDC settled</Label>
                  </div>
                </div>
              </Link>
            ) : null}
            {example && latest ? (
              <div className="border-t border-border-subtle px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <Label>Latest stamp</Label>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                    <Check size={12} strokeWidth={2} /> Verified
                  </span>
                </div>
                <div className="mt-3 flex items-start gap-3">
                  <Check size={14} strokeWidth={2} className="mt-1 shrink-0 text-success" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-primary">{latest.receipt.tool}</div>
                    <div className="mt-0.5 text-xs text-tertiary">
                      {formatUsdc(BigInt(latest.receipt.amount))} USDC · {timeAgo(latest.receipt.timestamp)}
                    </div>
                    <a
                      href={`${chain.blockExplorers.default.url}/tx/${latest.receipt.settlementTx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 font-mono text-xs text-secondary hover:text-primary"
                    >
                      Settlement {shortHex(latest.receipt.settlementTx, 6, 4)} <ArrowUpRight size={12} strokeWidth={1.5} />
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5">
                {loaded ? (
                  <>
                    <div className="text-sm text-secondary">No agent has a track record yet.</div>
                    <div className="mt-1 text-xs text-tertiary">The first one will appear here.</div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="h-6 w-40 animate-pulse rounded-[6px] bg-surface-elevated" />
                    <div className="h-9 w-24 animate-pulse rounded-[6px] bg-surface-elevated" />
                    <div className="h-10 w-full animate-pulse rounded-[6px] bg-surface-elevated" />
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* A stamp */}
      <section className="grid gap-10 py-20 md:grid-cols-2 md:items-center md:py-36">
        <div>
          <Reveal>
            <h2 className="text-[32px] font-semibold leading-tight tracking-tight md:text-[40px]">Every paid action leaves a stamp.</h2>
          </Reveal>
          <ol className="mt-8">
            {[
              ["01", "Payment settles", "A payment for a tool lands on Monad. That is the proof the action happened."],
              ["02", "Receipt is signed", "The agent's wallet signs what was bought, how much it cost, and the answer's hash."],
              ["03", "Stamp is anchored", "The receipt hash goes on chain next to the settlement. Anyone can check it."],
            ].map(([n, t, b], i, arr) => (
              <li key={n}>
                <Reveal className="flex gap-4" delay={90 + i * 100}>
                  <div className="flex flex-col items-center">
                    <Mono className="mt-0.5 w-6 text-tertiary">{n}</Mono>
                    {i < arr.length - 1 && <span className="my-2 block w-px flex-1 bg-border" />}
                  </div>
                  <div className="pb-7">
                    <div className="text-[15px] font-medium text-primary">{t}</div>
                    <div className="mt-1 text-sm text-secondary">{b}</div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>

        <Reveal delay={380}>
        <Card className="overflow-hidden">
          <Chrome path="STAMP" />
          {latest && example ? (
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <VerifiedBadge />
                <Mark size={16} className="text-tertiary" />
              </div>
              <div className="mt-5">
                <div className="text-lg font-semibold leading-tight">{latest.receipt.tool}</div>
                <div className="mt-0.5 text-sm text-tertiary">{latest.receipt.platform}</div>
              </div>
              <div className="mt-6 flex items-end justify-between gap-4">
                <div>
                  <div className="metric">{formatUsdc(BigInt(latest.receipt.amount))}</div>
                  <Label className="mt-1">USDC</Label>
                </div>
                <div className="text-right">
                  <a
                    href={`${chain.blockExplorers.default.url}/tx/${latest.receipt.settlementTx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block font-mono text-[13px] text-secondary underline-offset-2 hover:text-primary hover:underline"
                  >
                    {shortHex(latest.receipt.settlementTx, 8, 6)}
                  </a>
                  <Label className="mt-1">Settlement on Monad</Label>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-border-subtle pt-4">
                <span className="text-xs text-tertiary">{timeAgo(latest.receipt.timestamp)}</span>
                <Link href={`/a/${example.id}`} className="inline-flex items-center gap-1 text-sm text-secondary hover:text-primary">
                  Agent #{example.id} <ArrowRight size={14} strokeWidth={1.5} />
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-5 text-sm text-tertiary">No stamps yet. The first one will appear here.</div>
          )}
        </Card>
        </Reveal>
      </section>

      {/* Network state */}
      <Reveal>
      <section className="border-y border-border-subtle py-7">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <Label className="text-[11px]">Live on {chain.name}</Label>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <a
              href={`${chain.blockExplorers.default.url}/address/${addresses.identityRegistry}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[11px] text-tertiary hover:text-secondary"
            >
              ERC-8004 registry <ArrowUpRight size={11} strokeWidth={1.5} />
            </a>
            <a
              href={`${chain.blockExplorers.default.url}/address/${addresses.kleosStamps}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[11px] text-tertiary hover:text-secondary"
            >
              KleosStamps <ArrowUpRight size={11} strokeWidth={1.5} />
            </a>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat value={data ? data.total.toLocaleString() : null} label="Agents registered" />
          <Stat
            value={data ? data.withTrackRecord.toLocaleString() : null}
            label={data?.withTrackRecord === 1 ? "Agent with a track record" : "Agents with a track record"}
          />
          <Stat value={data ? data.totalStamps.toLocaleString() : null} label="Verified actions" />
          <Stat value={example ? formatUsdc(usdc) : data ? "$0.00" : null} label="USDC settled" />
        </div>
      </section>
      </Reveal>

      {/* How it works: one pipeline, ending in a real stamp */}
      <Reveal>
      <section className="py-20 md:py-36">
        <div className="eyebrow">How it works</div>
        <h2 className="mt-4 max-w-2xl text-[32px] font-semibold leading-tight tracking-tight md:text-[40px]">
          One paid action becomes a permanent record.
        </h2>

        <Pipeline stamp={latest && example ? { amount: formatUsdc(BigInt(latest.receipt.amount)), agentId: example.id } : null} />

        <p className="mt-14 text-[24px] font-semibold tracking-tight">No platform owns the record.</p>
      </section>
      </Reveal>

      {/* A real record: the example, verified live in this browser */}
      {example && (
        <Reveal>
        <section className="py-20 md:py-36">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow">Verify a real record</div>
              <p className="mt-3 max-w-md text-sm text-secondary">
                This record is being verified right now, in your browser, directly against Monad. No Kleos API is consulted.
              </p>
            </div>
            <Link href={`/a/${example.id}`} className="hidden items-center gap-1 text-sm text-secondary hover:text-primary md:inline-flex">
              Open profile <ArrowRight size={14} strokeWidth={1.5} />
            </Link>
          </div>
          <Card className="mt-6 overflow-hidden">
            <Chrome path={`AGENT #${example.id} / VERIFY`} />
            <div className="grid md:grid-cols-[1fr_1fr]">
              <div className="p-6 md:border-r md:border-border-subtle">
                <div className="text-[24px] font-semibold leading-tight">{example.name}</div>
                <div className="mt-2 flex items-center gap-3">
                  <Mono className="text-secondary">Agent #{example.id}</Mono>
                  {example.wallet && <ConnectedPill label="Active" />}
                </div>
                <div className="mt-6 grid grid-cols-3 gap-6">
                  <div>
                    <div className="metric">{example.stamps.length}</div>
                    <Label className="mt-1">Verified actions</Label>
                  </div>
                  <div>
                    <div className="metric">{formatUsdc(usdc)}</div>
                    <Label className="mt-1">USDC settled</Label>
                  </div>
                  <div>
                    <div className="metric">{tools}</div>
                    <Label className="mt-1">{tools === 1 ? "Tool" : "Tools"}</Label>
                  </div>
                </div>
              </div>
              <div className="bg-surface-elevated p-6">
                <Label>Verification</Label>
                <div className="mt-2 flex items-baseline justify-between gap-4">
                  <span className="text-sm font-medium text-primary">
                    {checks ? (passed === checkRows.length ? "Record verified" : "Verification finished") : "Verifying"}
                  </span>
                  <Mono className="text-xs text-secondary">
                    {checks ? `${passed} / ${checkRows.length} checks passed` : "checking"}
                  </Mono>
                </div>
                <ul className="mt-4 space-y-2">
                  {checkRows.map((c, i) => {
                    const icon =
                      c.ok === null ? (
                        <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-tertiary" />
                      ) : c.ok ? (
                        <Check size={14} strokeWidth={2} className="text-success" />
                      ) : (
                        <X size={14} strokeWidth={2} className="text-error" />
                      );
                    // Evidence for the first two checks, from the latest stamp.
                    const evidence =
                      i === 0 && latest
                        ? { k: "Receipt hash", v: shortHex(latest.receiptHash, 10, 8) }
                        : i === 1 && latest
                          ? { k: "Signer", v: shortHex(latest.receipt.wallet, 8, 6) }
                          : null;
                    return (
                      <li key={c.label} className="text-sm">
                        {evidence && checks ? (
                          <details className="group">
                            <summary className="flex cursor-pointer list-none items-center justify-between">
                              <span className={c.ok === false ? "text-error" : "text-primary"}>{c.label}</span>
                              {icon}
                            </summary>
                            <div className="mt-1.5 flex items-baseline gap-3 pl-0.5">
                              <Label className="text-[10px]">{evidence.k}</Label>
                              <Mono className="text-xs text-secondary">{evidence.v}</Mono>
                            </div>
                          </details>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className={c.ok === false ? "text-error" : "text-primary"}>{c.label}</span>
                            {icon}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-5 text-xs text-tertiary">
                  Kleos does not decide whether this record is valid. Your browser does.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-6 py-4">
              <span className="text-xs text-tertiary">
                {example.stamps.length} {example.stamps.length === 1 ? "stamp" : "stamps"} · each one recomputed, signature-checked, read from KleosStamps, settlement fetched
              </span>
              <Link href={`/a/${example.id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Verify this profile <ArrowRight size={14} strokeWidth={1.5} />
              </Link>
            </div>
          </Card>
        </section>
        </Reveal>
      )}

      {/* FAQ */}
      <Reveal>
      <section className="py-20 md:py-36">
        <Faq />
      </section>
      </Reveal>

      {/* Closing */}
      <Reveal>
      <section className="py-20 md:py-36">
        <div>
        <h2 className="text-[32px] font-semibold leading-tight tracking-tight md:text-[40px]">Your agent starts with zero.</h2>
        <p className="mt-2 text-[32px] font-semibold leading-tight tracking-tight text-tertiary md:text-[40px]">Every action changes that.</p>
        <div className="mt-8">
          <Link href="/me">
            <Button size="lg" variant="accent">
              Register your agent
              <ArrowRight size={16} strokeWidth={1.5} />
            </Button>
          </Link>
        </div>
        <p className="mt-6 text-sm text-tertiary">No platform owns the record. No reputation score. Just a verifiable history.</p>
        </div>

      </section>
      </Reveal>

    </main>
  );
}

function Stat({ value, label }: { value: string | null; label: string }) {
  return (
    <div>
      {value === null ? <div className="h-9 w-24 animate-pulse rounded-[6px] bg-surface-elevated" /> : <div className="metric">{value}</div>}
      <Label className="mt-1">{label}</Label>
    </div>
  );
}
