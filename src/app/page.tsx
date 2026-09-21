"use client";

// Landing. Every number on it is read from chain; the example agent and
// stamp are real. If there is nothing yet, it says so.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Fingerprint, Link2, Stamp as StampIcon, Zap } from "lucide-react";
import { chain } from "@/lib/chain";
import { fetchStamps, formatUsdc, type Stamp } from "@/lib/stamps";
import { Button, Card, Label, Mono, TestnetBadge, VerifiedBadge, shortHex } from "@/components/ui";

type ExploreData = {
  total: number;
  withTrackRecord: number;
  totalStamps: number;
  agents: { id: number; name: string | null; stamps: number; wallet: `0x${string}` | null }[];
};

export default function Home() {
  const [data, setData] = useState<ExploreData | null>(null);
  const [example, setExample] = useState<{ id: number; name: string; stamps: Stamp[] } | null>(null);

  useEffect(() => {
    fetch("/api/explore")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (d: ExploreData | null) => {
        if (!d) return;
        setData(d);
        const top = [...d.agents].sort((a, b) => b.stamps - a.stamps)[0];
        if (top && top.stamps > 0) {
          const stamps = await fetchStamps(BigInt(top.id));
          setExample({ id: top.id, name: top.name ?? `Agent #${top.id}`, stamps });
        }
      })
      .catch(() => null);
  }, []);

  const usdc = example ? example.stamps.reduce((s, x) => s + BigInt(x.receipt.amount), 0n) : 0n;
  const latest = example?.stamps[0];

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 md:px-8">
      {/* Hero */}
      <section className="pt-24 pb-16 md:pt-32 md:pb-24">
        <h1 className="max-w-3xl text-[44px] font-semibold leading-[0.98] tracking-tight md:text-[72px]">
          Give your agent a track record.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-secondary">
          Kleos turns an agent&apos;s paid actions into a portable, verifiable history. Every stamp sits next to a
          payment on Monad, so it cannot be faked, and no platform owns it.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/me">
            <Button size="lg">
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
      </section>

      {/* Live numbers */}
      <section className="border-y border-border-subtle py-10">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <Stat value={data ? data.total.toLocaleString() : null} label={`Agents registered on ${chain.name}`} />
          <Stat value={data ? data.withTrackRecord.toLocaleString() : null} label="With a track record" />
          <Stat value={data ? data.totalStamps.toLocaleString() : null} label="Verified actions" />
          <Stat value={example ? formatUsdc(usdc) : data ? "$0.00" : null} label="USDC settled" testnet />
        </div>
        <p className="mt-4 text-xs text-tertiary">Read live from the ERC-8004 registry and KleosStamps. No mock numbers, ever.</p>
      </section>

      {/* Stamp */}
      <section className="grid gap-10 py-20 md:grid-cols-2 md:items-center md:py-28">
        <div>
          <h2 className="text-[32px] font-semibold leading-tight tracking-tight md:text-[40px]">Every paid action leaves a mark.</h2>
          <p className="mt-4 text-secondary">
            An x402 payment proves the action happened. Kleos signs a receipt for it, seals the answer to the owner&apos;s
            passkey, and anchors the hash on Monad next to the settlement. That is a stamp.
          </p>
          <p className="mt-4 text-secondary">
            Anyone can verify a stamp from chain. Only the owner can read what was inside.
          </p>
        </div>
        {latest && example ? (
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-primary">{latest.receipt.tool}</div>
                <div className="mt-0.5 text-xs text-tertiary">{latest.receipt.platform}</div>
              </div>
              <VerifiedBadge />
            </div>
            <div className="mt-6 flex items-end justify-between">
              <div>
                <div className="metric">{formatUsdc(BigInt(latest.receipt.amount))}</div>
                <Label className="mt-1">USDC</Label>
              </div>
              <div className="text-right">
                <Mono className="block text-secondary">{shortHex(latest.receipt.settlementTx, 8, 6)}</Mono>
                <Label className="mt-1">Settlement on Monad</Label>
              </div>
            </div>
            <div className="mt-5 border-t border-border-subtle pt-4">
              <Link href={`/a/${example.id}`} className="inline-flex items-center gap-1 text-sm text-secondary hover:text-primary">
                {example.name} <ArrowRight size={14} strokeWidth={1.5} />
              </Link>
            </div>
          </Card>
        ) : (
          <Card className="p-5">
            <div className="text-sm text-tertiary">No stamps yet. The first one will appear here.</div>
          </Card>
        )}
      </section>

      {/* How it works */}
      <section className="border-t border-border-subtle py-20 md:py-28">
        <Label>How it works</Label>
        <div className="mt-8 grid gap-8 md:grid-cols-4">
          <Step n="01" icon={<Fingerprint size={20} strokeWidth={1.5} />} title="Register" body="One passkey ceremony gives your agent an on-chain identity. No seed phrase, no wallet, no account." />
          <Step n="02" icon={<Link2 size={20} strokeWidth={1.5} />} title="Connect" body="Pair the runtime that actually runs your agent. It gets its own key; it never sees yours." />
          <Step n="03" icon={<Zap size={20} strokeWidth={1.5} />} title="Act" body="Your agent discovers tools and pays for them with x402. OnchainRouter is the first place it can." />
          <Step n="04" icon={<StampIcon size={20} strokeWidth={1.5} />} title="Build a record" body="Every paid action becomes a stamp. The record is yours, portable, and provable by anyone." />
        </div>
        <p className="mt-10 text-[24px] font-semibold tracking-tight">No platform owns the record.</p>
      </section>

      {/* Example agent */}
      {example && (
        <section className="border-t border-border-subtle py-20 md:py-28">
          <Label>A real agent</Label>
          <Card className="mt-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[24px] font-semibold leading-tight">{example.name}</div>
                <Mono className="mt-1 block text-secondary">Agent #{example.id}</Mono>
              </div>
              <TestnetBadge />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-6 md:max-w-lg">
              <div>
                <div className="metric">{example.stamps.length}</div>
                <Label className="mt-1">Verified actions</Label>
              </div>
              <div>
                <div className="metric">{formatUsdc(usdc)}</div>
                <Label className="mt-1">USDC settled</Label>
              </div>
              <div>
                <div className="metric">{new Set(example.stamps.map((s) => s.receipt.tool)).size}</div>
                <Label className="mt-1">Tools</Label>
              </div>
            </div>
            <div className="mt-6">
              <Link href={`/a/${example.id}`} className="inline-flex items-center gap-1 text-sm text-secondary hover:text-primary">
                View track record <ArrowRight size={14} strokeWidth={1.5} />
              </Link>
            </div>
          </Card>
        </section>
      )}

      {/* Closing */}
      <section className="border-t border-border-subtle py-20 md:py-28">
        <h2 className="text-[32px] font-semibold leading-tight tracking-tight md:text-[40px]">Your agent starts with zero.</h2>
        <p className="mt-2 text-[32px] font-semibold leading-tight tracking-tight text-tertiary md:text-[40px]">Every action changes that.</p>
        <div className="mt-8">
          <Link href="/me">
            <Button size="lg">
              Register your agent
              <ArrowRight size={16} strokeWidth={1.5} />
            </Button>
          </Link>
        </div>
        <p className="mt-6 text-sm text-tertiary">No platform lock-in. No reputation score. Just a verifiable history.</p>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle py-8 text-xs text-tertiary">
        <span>Kleos · a portable track record for AI agents</span>
        <span>Built on Monad · ERC-8004 · x402</span>
      </footer>
    </main>
  );
}

function Stat({ value, label, testnet }: { value: string | null; label: string; testnet?: boolean }) {
  return (
    <div>
      {value === null ? (
        <div className="h-9 w-24 animate-pulse rounded-[6px] bg-surface-elevated" />
      ) : (
        <div className="flex items-baseline gap-2">
          <div className="metric">{value}</div>
          {testnet && <TestnetBadge />}
        </div>
      )}
      <Label className="mt-1">{label}</Label>
    </div>
  );
}

function Step({ n, icon, title, body }: { n: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-secondary">{icon}</span>
        <Mono className="text-tertiary">{n}</Mono>
      </div>
      <div className="mt-4 text-lg font-semibold">{title}</div>
      <p className="mt-2 text-sm text-secondary">{body}</p>
    </div>
  );
}
