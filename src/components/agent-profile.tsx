"use client";

// The agent profile: identity, track record, stamp feed, verify. One
// component, two modes: public (answers locked) and owner (answers open).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, Lock, ShieldCheck, X } from "lucide-react";
import { useSession } from "@/lib/session";
import { loadAgent, type Agent } from "@/lib/agents";
import { chain } from "@/lib/chain";
import {
  decryptStamp,
  fetchStamps,
  formatUsdc,
  trackRecord,
  verifyStamp,
  type Check as VerifyCheck,
  type Stamp,
} from "@/lib/stamps";
import { ActiveBadge, Badge, Button, Card, Label, Mono, TestnetBadge, VerifiedBadge, shortHex } from "@/components/ui";

type Verification = { running: boolean; results: Map<string, VerifyCheck[]>; done: number; total: number };

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function AgentProfile({ agentId }: { agentId: bigint }) {
  const { session, publicClient } = useSession();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [loading, setLoading] = useState(true);
  const [openStamp, setOpenStamp] = useState<string | null>(null);
  const [verification, setVerification] = useState<Verification>({ running: false, results: new Map(), done: 0, total: 0 });
  const [decrypted, setDecrypted] = useState<Map<string, { answer: string; hashMatches: boolean }>>(new Map());

  const isOwner = Boolean(session && agent && session.address.toLowerCase() === agent.owner.toLowerCase());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([loadAgent(publicClient, agentId).catch(() => null), fetchStamps(agentId)]);
      if (!a) setNotFound(true);
      setAgent(a);
      setStamps(s);
    } finally {
      setLoading(false);
    }
  }, [agentId, publicClient]);

  useEffect(() => {
    void load();
  }, [load]);

  const record = useMemo(() => trackRecord(stamps), [stamps]);

  async function verifyAll() {
    setVerification({ running: true, results: new Map(), done: 0, total: stamps.length });
    const results = new Map<string, VerifyCheck[]>();
    for (const s of stamps) {
      results.set(s.receiptHash, await verifyStamp(publicClient, s));
      setVerification({ running: true, results: new Map(results), done: results.size, total: stamps.length });
    }
    setVerification({ running: false, results, done: results.size, total: stamps.length });
  }

  function decrypt(stamp: Stamp) {
    if (!session || !agent || agent.keyIndex === null) return;
    const { privateKey } = session.keys.encryption.forIndex(agent.keyIndex);
    try {
      const d = decryptStamp(stamp, privateKey);
      setDecrypted((m) => new Map(m).set(stamp.receiptHash, { answer: d.answer, hashMatches: d.hashMatches }));
    } catch {
      setDecrypted((m) => new Map(m).set(stamp.receiptHash, { answer: "", hashMatches: false }));
    }
  }

  const allVerified =
    verification.total > 0 &&
    !verification.running &&
    [...verification.results.values()].every((cs) => cs.every((c) => c.ok));
  const verifiedCount = [...verification.results.values()].filter((cs) => cs.every((c) => c.ok)).length;

  if (notFound) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-4 py-24 md:px-8">
        <h1 className="text-[40px] font-semibold leading-none tracking-tight">No such agent</h1>
        <p className="mt-4 text-secondary">Agent #{String(agentId)} is not registered on {chain.name}.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-12 md:px-8">
      {/* Identity */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          {loading && !agent ? (
            <div className="h-10 w-64 animate-pulse rounded-[8px] bg-surface-elevated" />
          ) : (
            <h1 className="text-[40px] font-semibold leading-none tracking-tight">{agent?.name}</h1>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Mono className="text-secondary">Agent #{String(agentId)}</Mono>
            {agent?.wallet ? <ActiveBadge /> : agent ? <Badge>No runtime</Badge> : null}
            <TestnetBadge />
          </div>
          <p className="mt-3 text-sm text-tertiary">
            Owned by a verified passkey{isOwner ? " (you)" : ""}. ERC-8004 identity on {chain.name}.
          </p>
        </div>
        <div className="flex items-center gap-2">{isOwner && <Badge tone="accent">Owner view</Badge>}</div>
      </header>

      {/* Track record */}
      <section className="mt-10">
        <Label>Track record</Label>
        <div className="mt-3 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-5">
          <div>
            <div className="metric">{record.actions}</div>
            <Label className="mt-1">Verified actions</Label>
          </div>
          <div>
            <div className="metric">{formatUsdc(record.usdc)}</div>
            <Label className="mt-1">USDC settled</Label>
          </div>
          <div>
            <div className="metric">{record.days}</div>
            <Label className="mt-1">Days active</Label>
          </div>
          <div>
            <div className="metric">{record.tools}</div>
            <Label className="mt-1">Tools</Label>
          </div>
          <div>
            <div className="metric">{record.platforms}</div>
            <Label className="mt-1">Platforms</Label>
          </div>
        </div>
        <p className="mt-3 text-xs text-tertiary">
          Computed from stamps anchored on Monad. No score, no weighting. Verified actions, not a reputation score.
        </p>

        {stamps.length > 0 && verification.total === 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-border bg-surface-elevated p-5">
            <div>
              <div className="text-sm font-medium text-primary">Anyone can verify this record.</div>
              <div className="mt-1 text-sm text-secondary">
                Recompute the receipts, check the signatures, anchors and payments directly against Monad. Kleos is not consulted.
              </div>
            </div>
            <Button onClick={verifyAll} disabled={verification.running} loading={verification.running}>
              <ShieldCheck size={16} strokeWidth={1.5} />
              Verify this profile
            </Button>
          </div>
        )}
      </section>

      {/* Verification panel */}
      {verification.total > 0 && (
        <Card className="mt-6 bg-surface-elevated p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {verification.running ? "Verifying record" : allVerified ? "Record independently verified" : "Verification finished"}
            </div>
            <Mono className="text-secondary">
              {verifiedCount} / {verification.total} stamps verified against {chain.name}
            </Mono>
          </div>
          <ol className="mt-4 space-y-1.5 text-sm">
            {["Receipt hash recomputed", "Signed by the agent's wallet", "Anchored on Monad", "Payment settled on Monad"].map((label) => {
              const all = [...verification.results.values()];
              const ok = all.length > 0 && all.every((cs) => cs.find((c) => c.label === label)?.ok);
              const pending = verification.running;
              return (
                <li key={label} className="flex items-center justify-between">
                  <span className={ok || pending ? "text-primary" : "text-error"}>{label}</span>
                  {pending && !ok ? (
                    <Loader2 size={14} strokeWidth={1.5} className="animate-spin text-tertiary" />
                  ) : ok ? (
                    <Check size={14} strokeWidth={2} className="text-success" />
                  ) : (
                    <X size={14} strokeWidth={2} className="text-error" />
                  )}
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-tertiary">
              Verified in your browser against {chain.name}. Kleos does not decide whether this record is valid.
            </p>
            <button className="text-xs text-secondary hover:text-primary" onClick={verifyAll} disabled={verification.running}>
              Run again
            </button>
          </div>
        </Card>
      )}

      {/* Runtime */}
      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <Label>Runtime</Label>
          <div className="mt-2">
            {agent?.wallet ? (
              <Mono className="text-primary">{agent.wallet}</Mono>
            ) : (
              <span className="text-sm text-tertiary">No runtime connected</span>
            )}
          </div>
          <p className="mt-1 text-xs text-tertiary">
            The software wallet currently registered to this agent (ERC-8004 agentWallet). Only the registered runtime can create stamps.
          </p>
        </div>
        <div>
          <Label>Owner</Label>
          <div className="mt-2">
            <Mono className="text-primary">{agent ? shortHex(agent.owner, 8, 6) : ""}</Mono>
          </div>
          <p className="mt-1 text-xs text-tertiary">A passkey-derived address. The person behind it is never revealed.</p>
        </div>
      </section>

      {/* Stamp feed */}
      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[24px] font-semibold leading-tight">Stamps</h2>
          <span className="text-xs text-tertiary">Every paid action leaves one.</span>
        </div>

        {loading && stamps.length === 0 && (
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-[10px] bg-surface-elevated" />
            ))}
          </div>
        )}

        {!loading && stamps.length === 0 && (
          <Card className="mt-4 p-10 text-center">
            <p className="text-secondary">No track record yet.</p>
            <p className="mt-1 text-sm text-tertiary">
              The identity is ready. Connect a runtime and its first paid action will create the first stamp.
            </p>
          </Card>
        )}

        <ul className="mt-4 divide-y divide-border-subtle rounded-[10px] border border-border bg-surface">
          {stamps.map((s) => {
            const isOpen = openStamp === s.receiptHash;
            const checks = verification.results.get(s.receiptHash);
            const ok = checks ? checks.every((c) => c.ok) : null;
            const d = decrypted.get(s.receiptHash);
            return (
              <li key={s.receiptHash}>
                <button
                  className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-surface-hover"
                  onClick={() => setOpenStamp(isOpen ? null : s.receiptHash)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-primary">{s.receipt.tool}</div>
                    <div className="mt-0.5 text-xs text-tertiary">{s.receipt.platform}</div>
                  </div>
                  <Mono className="text-primary">{formatUsdc(BigInt(s.receipt.amount))}</Mono>
                  <span className="hidden w-20 text-right text-xs text-tertiary sm:block">{timeAgo(s.receipt.timestamp)}</span>
                  <div className="w-24 text-right">
                    {ok === true ? <VerifiedBadge /> : ok === false ? <Badge tone="error">Failed</Badge> : <Badge>Answered</Badge>}
                  </div>
                  {isOpen ? <ChevronUp size={16} className="text-tertiary" /> : <ChevronDown size={16} className="text-tertiary" />}
                </button>

                {isOpen && (
                  <div className="border-t border-border-subtle bg-surface-elevated px-5 py-5">
                    <dl className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
                      <Row label="Tool" value={s.receipt.tool} />
                      <Row label="Platform" value={s.receipt.platform} />
                      <Row label="Amount" value={`${formatUsdc(BigInt(s.receipt.amount))} USDC`} />
                      <Row label="Timestamp" value={new Date(s.receipt.timestamp * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC"} />
                      <Row
                        label="Settlement"
                        value={shortHex(s.receipt.settlementTx, 10, 8)}
                        href={`${chain.blockExplorers.default.url}/tx/${s.receipt.settlementTx}`}
                      />
                      <Row label="Receipt hash" value={shortHex(s.receiptHash, 10, 8)} />
                      <Row label="Signer" value={shortHex(s.receipt.wallet)} />
                      <Row label="Answer hash" value={shortHex(s.receipt.answerHash, 10, 8)} />
                    </dl>

                    {checks && (
                      <ul className="mt-4 space-y-1 text-xs">
                        {checks.map((c) => (
                          <li key={c.label} className="flex items-center gap-2">
                            {c.ok ? <Check size={12} className="text-success" /> : <X size={12} className="text-error" />}
                            <span className={c.ok ? "text-secondary" : "text-error"}>{c.label}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-5">
                      <Label>Answer</Label>
                      {isOwner ? (
                        d ? (
                          <div className="mt-2">
                            <pre className="max-h-64 overflow-auto rounded-[8px] border border-border-subtle bg-surface p-3 font-mono text-xs text-primary">
                              {d.answer || "(could not decrypt)"}
                            </pre>
                            <div className="mt-2 flex items-center gap-2 text-xs">
                              {d.hashMatches ? (
                                <>
                                  <Check size={12} className="text-success" />
                                  <span className="text-secondary">Answer hash matches the anchored receipt</span>
                                </>
                              ) : (
                                <>
                                  <X size={12} className="text-error" />
                                  <span className="text-error">Hash does not match</span>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <Button variant="secondary" className="mt-2" onClick={() => decrypt(s)}>
                            Decrypt with passkey
                          </Button>
                        )
                      ) : (
                        <div className="mt-2 flex items-start gap-2 text-sm text-tertiary">
                          <Lock size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                          <span>
                            <span className="text-secondary">Private answer.</span> Encrypted to the agent owner&apos;s passkey. Kleos cannot read it.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt>
        <Label>{label}</Label>
      </dt>
      <dd className="truncate">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-primary underline-offset-2 hover:underline">
            {value}
          </a>
        ) : (
          <Mono className="text-primary">{value}</Mono>
        )}
      </dd>
    </div>
  );
}
