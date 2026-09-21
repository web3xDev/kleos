"use client";

// Every ERC-8004 agent on Monad, with the track record Kleos can prove for
// it. Most are at zero. That is the point.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { chain } from "@/lib/chain";
import { Badge, Card, Input, Label, Mono, TestnetBadge, shortHex } from "@/components/ui";

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

export default function ExplorePage() {
  const [data, setData] = useState<ExploreData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    fetch("/api/explore")
      .then(async (r) => {
        if (!r.ok) throw new Error(`scan failed (${r.status})`);
        setData(await r.json());
      })
      .catch((e) => setError(e.message));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.agents
      .filter((a) => (filter === "record" ? a.stamps > 0 : filter === "kleos" ? a.kleos : true))
      .filter((a) => !needle || String(a.id) === needle || a.name?.toLowerCase().includes(needle) || a.owner.toLowerCase().includes(needle))
      .sort((a, b) => b.stamps - a.stamps || b.id - a.id)
      .slice(0, 200);
  }, [data, q, filter]);

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[40px] font-semibold leading-none tracking-tight">Explore agents</h1>
          <p className="mt-3 text-secondary">Every agent registered on {chain.name}, and the track record each one can prove.</p>
        </div>
        <TestnetBadge />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat value={data ? data.total.toLocaleString() : null} label="Agents registered" />
        <Stat value={data ? data.withTrackRecord.toLocaleString() : null} label="With a track record" />
        <Stat value={data ? data.totalStamps.toLocaleString() : null} label="Verified actions" />
        <Stat value={data ? data.agents.filter((a) => a.kleos).length.toLocaleString() : null} label="Registered via Kleos" />
      </div>
      <p className="mt-3 text-xs text-tertiary">Read from the ERC-8004 registry and KleosStamps on Monad. Nothing here is self-reported.</p>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
          <Input className="pl-9" placeholder="Search by name, id or owner" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1">
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
              className={`h-10 rounded-[8px] px-3 text-sm ${filter === k ? "bg-surface-hover text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-6 text-sm text-error">{error}</p>}

      {!data && !error && (
        <div className="mt-6 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-[10px] bg-surface-elevated" />
          ))}
          <p className="pt-2 text-xs text-tertiary">Reading the registry from Monad. The first load takes a moment; after that it is cached.</p>
        </div>
      )}

      {data && (
        <Card className="mt-6 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border-subtle px-5 py-3 md:grid-cols-[1fr_140px_120px_120px]">
            <Label>Agent</Label>
            <Label className="hidden md:block">Runtime</Label>
            <Label className="text-right">Verified actions</Label>
            <Label className="hidden text-right md:block">Owner</Label>
          </div>
          {rows.length === 0 && <div className="px-5 py-10 text-center text-sm text-tertiary">No agents match.</div>}
          <ul className="divide-y divide-border-subtle">
            {rows.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/a/${a.id}`}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3.5 hover:bg-surface-hover md:grid-cols-[1fr_140px_120px_120px]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-primary">{a.name ?? `Agent #${a.id}`}</span>
                      {a.kleos && <Badge tone="accent">Kleos</Badge>}
                    </div>
                    <Mono className="text-xs text-tertiary">#{a.id}</Mono>
                  </div>
                  <div className="hidden md:block">
                    {a.wallet ? <Mono className="text-secondary">{shortHex(a.wallet)}</Mono> : <span className="text-xs text-tertiary">—</span>}
                  </div>
                  <div className="text-right">
                    {a.stamps > 0 ? (
                      <Mono className="text-primary">{a.stamps}</Mono>
                    ) : (
                      <span className="text-xs text-tertiary">0 · no track record yet</span>
                    )}
                  </div>
                  <div className="hidden text-right md:block">
                    <Mono className="text-tertiary">{shortHex(a.owner)}</Mono>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {data.agents.length > rows.length && filter === "all" && !q && (
            <div className="border-t border-border-subtle px-5 py-3 text-xs text-tertiary">
              Showing {rows.length} of {data.total}. Search to find a specific agent.
            </div>
          )}
        </Card>
      )}
    </main>
  );
}

function Stat({ value, label }: { value: string | null; label: string }) {
  return (
    <div>
      {value === null ? <div className="h-9 w-20 animate-pulse rounded-[6px] bg-surface-elevated" /> : <div className="metric">{value}</div>}
      <Label className="mt-1">{label}</Label>
    </div>
  );
}
