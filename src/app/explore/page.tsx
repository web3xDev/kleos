"use client";

// Explore: every ERC-8004 agent on Monad, and the few that already have a
// track record anyone can verify. The contrast (thousands with identity,
// very few with history) is the page's story, so it leads.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { chain } from "@/lib/chain";
import { fetchStamps, formatUsdc } from "@/lib/stamps";
import { Card, Input, Label, Mono, shortHex } from "@/components/ui";

type ExploreAgent = {
  id: number;
  name: string | null;
  owner: `0x${string}`;
  wallet: `0x${string}` | null;
  stamps: number;
  kleos: boolean;
};
type ExploreData = { total: number; withTrackRecord: number; totalStamps: number; agents: ExploreAgent[]; scannedAt: number };

type Filter = "all" | "record" | "kleos";

const PAGE = 24;

function KleosTag() {
  return <Mono className="text-[10px] tracking-[0.12em] text-accent-text">KLEOS</Mono>;
}

export default function ExplorePage() {
  const [data, setData] = useState<ExploreData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  // USDC settled for the featured agents, read from their stamps.
  const [settled, setSettled] = useState<Map<number, bigint>>(new Map());

  useEffect(() => {
    fetch("/api/explore")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Could not read the registry (${r.status}). Try again in a moment.`);
        setData(await r.json());
      })
      .catch((e) => setError(e.message));
  }, []);

  const featured = useMemo(
    () => (data ? data.agents.filter((a) => a.stamps > 0).sort((a, b) => b.stamps - a.stamps).slice(0, 6) : []),
    [data],
  );

  useEffect(() => {
    if (featured.length === 0) return;
    Promise.all(
      featured.map(async (a) => {
        const stamps = await fetchStamps(BigInt(a.id));
        return [a.id, stamps.reduce((t, s) => t + BigInt(s.receipt.amount), 0n)] as const;
      }),
    ).then((pairs) => setSettled(new Map(pairs)));
  }, [featured]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.agents
      .filter((a) => (filter === "record" ? a.stamps > 0 : filter === "kleos" ? a.kleos : true))
      .filter((a) => !needle || String(a.id) === needle || a.name?.toLowerCase().includes(needle) || a.owner.toLowerCase().includes(needle))
      .sort((a, b) => b.stamps - a.stamps || b.id - a.id);
  }, [data, q, filter]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE, current * PAGE + PAGE);

  useEffect(() => setPage(0), [q, filter]);

  const totalSettled = [...settled.values()].reduce((t, v) => t + v, 0n);
  const viaKleos = data ? data.agents.filter((a) => a.kleos).length : 0;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-8 md:py-16">
      {/* Header */}
      <Mono className="text-[11px] tracking-[0.12em] text-tertiary">{chain.name.toUpperCase()} · ERC-8004 REGISTRY</Mono>
      <h1 className="mt-3 text-[40px] font-semibold leading-none tracking-tight">Explore agents</h1>
      <p className="mt-3 text-secondary">Every agent registered on {chain.name}. See the history each one can prove.</p>

      {/* The contrast: identity vs. history */}
      <section className="mt-10">
        {data ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <span className="text-[44px] font-semibold leading-none tracking-tight tabular-nums md:text-[56px]">
                {data.total.toLocaleString()}
              </span>
              <span className="text-lg text-secondary">agents registered on Monad</span>
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <span className="text-[44px] font-semibold leading-none tracking-tight tabular-nums text-accent-text md:text-[56px]">
                {data.withTrackRecord.toLocaleString()}
              </span>
              <span className="text-lg text-secondary">
                with a verifiable track record
              </span>
            </div>
            <p className="mt-5 font-mono text-[13px] text-tertiary">
              {data.totalStamps.toLocaleString()} verified actions
              {settled.size > 0 && <> · {formatUsdc(totalSettled)} USDC settled</>} · {viaKleos} registered via Kleos
            </p>
          </>
        ) : (
          <div className="space-y-3">
            <div className="h-12 w-72 animate-pulse rounded-[8px] bg-surface-elevated" />
            <div className="h-12 w-80 animate-pulse rounded-[8px] bg-surface-elevated" />
          </div>
        )}
      </section>

      {/* Agents with a track record */}
      {featured.length > 0 && (
        <section className="mt-14">
          <div className="eyebrow">Agents with a track record</div>
          <p className="mt-2 text-sm text-secondary">
            {featured.length === 1 ? "One agent has" : `${featured.length} agents have`} a history anyone can verify.
          </p>
          <div className={`mt-5 grid gap-4 ${featured.length === 1 ? "md:max-w-xl" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {featured.map((a) => (
              <Link key={a.id} href={`/a/${a.id}`} className="group">
                <Card hover className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold leading-tight text-primary">{a.name ?? `Agent #${a.id}`}</div>
                      <Mono className="mt-1 block text-secondary">#{a.id}</Mono>
                    </div>
                    {a.kleos && <KleosTag />}
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-4">
                    <div>
                      <div className="metric">{a.stamps}</div>
                      <Label className="mt-1">Verified actions</Label>
                    </div>
                    <div>
                      <div className="metric">{settled.has(a.id) ? formatUsdc(settled.get(a.id)!) : "–"}</div>
                      <Label className="mt-1">USDC settled</Label>
                    </div>
                  </div>
                  <div className="mt-6 inline-flex items-center gap-1 text-sm text-secondary group-hover:text-primary">
                    View track record <ArrowRight size={14} strokeWidth={1.5} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* All agents */}
      <section className="mt-16">
        <div className="eyebrow">All agents</div>

        <div className="relative mt-5 w-full md:max-w-[560px]">
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-tertiary" />
          <Input
            className="h-12 pl-10 text-[15px]"
            placeholder="Search by name, id or owner"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="mt-4 flex gap-1">
          {(
            [
              ["all", "All"],
              ["record", "With track record"],
              ["kleos", "Via Kleos"],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`h-9 rounded-[8px] px-3 text-sm ${filter === k ? "bg-surface-elevated text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 text-sm text-error">{error}</p>}

        {!data && !error && (
          <div className="mt-6 space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-[10px] bg-surface-elevated" />
            ))}
            <p className="pt-2 text-xs text-tertiary">Reading Monad&apos;s agent registry… The first scan can take a little longer.</p>
          </div>
        )}

        {data && (
          <Card className="mt-5 overflow-hidden">
            <div className="hidden grid-cols-[1fr_150px_120px_130px_24px] items-center gap-4 border-b border-border-subtle px-5 py-3 md:grid">
              <Label>Agent</Label>
              <Label>Agent wallet</Label>
              <Label className="text-right">Verified actions</Label>
              <Label className="text-right">Owner</Label>
              <span />
            </div>
            {rows.length === 0 && <div className="px-5 py-10 text-center text-sm text-tertiary">No agents match.</div>}
            <ul className="divide-y divide-border-subtle">
              {visible.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/a/${a.id}`}
                    className="group grid grid-cols-[1fr_auto_16px] items-center gap-4 px-5 py-3.5 hover:bg-surface-hover md:grid-cols-[1fr_150px_120px_130px_24px]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-primary">{a.name ?? `Agent #${a.id}`}</span>
                        {a.kleos && <KleosTag />}
                      </div>
                      <Mono className="text-xs text-tertiary">#{a.id}</Mono>
                    </div>
                    <div className="hidden md:block">
                      {a.wallet ? <Mono className="text-secondary">{shortHex(a.wallet)}</Mono> : <span className="text-xs text-disabled">—</span>}
                    </div>
                    <div className="text-right">
                      <Mono className={a.stamps > 0 ? "text-primary" : "text-disabled"}>{a.stamps}</Mono>
                      <span className="ml-1.5 text-xs text-tertiary md:hidden">{a.stamps === 1 ? "action" : "actions"}</span>
                    </div>
                    <div className="hidden text-right md:block">
                      <Mono className="text-tertiary">{shortHex(a.owner)}</Mono>
                    </div>
                    <ArrowRight
                      size={14}
                      strokeWidth={1.5}
                      className="justify-self-end text-tertiary opacity-0 transition-opacity duration-[180ms] group-hover:opacity-100"
                    />
                  </Link>
                </li>
              ))}
            </ul>
            {rows.length > PAGE && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
                <span className="text-xs text-tertiary">
                  Showing {(current * PAGE + 1).toLocaleString()}–{Math.min(rows.length, (current + 1) * PAGE).toLocaleString()} of{" "}
                  {rows.length.toLocaleString()} agents
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-border px-3 text-sm text-secondary hover:border-border-hover hover:bg-surface-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-transparent"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={current === 0}
                  >
                    <ChevronLeft size={14} strokeWidth={1.5} />
                    Previous
                  </button>
                  <Mono className="w-16 text-center text-xs text-secondary">
                    {current + 1} / {pages}
                  </Mono>
                  <button
                    className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-border px-3 text-sm text-secondary hover:border-border-hover hover:bg-surface-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-transparent"
                    onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                    disabled={current >= pages - 1}
                  >
                    Next
                    <ChevronRight size={14} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            )}
          </Card>
        )}
        <p className="mt-4 text-xs text-tertiary">Read from the ERC-8004 registry and KleosStamps on Monad. Nothing here is self-reported.</p>
      </section>
    </main>
  );
}
