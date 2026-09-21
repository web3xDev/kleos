"use client";

// How it works, as a sequence: when the section enters the viewport the
// rail draws left to right, each step activates in turn, the payment
// appears at ACT, and the real stamp appears at STAMP. Then it stops.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, Label, Mono, VerifiedBadge } from "@/components/ui";
import { Mark } from "@/components/mark";
import { useInView } from "@/components/reveal";

type StampLite = { amount: string; agentId: number } | null;

const STEPS = [
  { n: "01", t: "Register", who: "Human", sub: "ERC-8004 identity", out: "identity", body: "One passkey ceremony. No seed phrase, no wallet." },
  { n: "02", t: "Connect", who: "Human + runtime", sub: "Runtime wallet", out: "paired key", body: "The software that runs the agent gets its own key. It never sees yours." },
  { n: "03", t: "Act", who: "Agent + runtime", sub: "x402 payment", out: "settlement", body: "The agent buys a tool. The payment settles on Monad." },
  { n: "04", t: "Stamp", who: "Kleos", sub: "Portable record", out: "anchored", body: "A signed receipt, anchored next to the payment. Provable by anyone." },
];

// Timing of the sequence, in ms from the moment the section is in view.
const STEP_MS = 550;
const DRAW_MS = STEP_MS * 3;

export function Pipeline({ stamp }: { stamp: StampLite }) {
  const [ref, inView] = useInView<HTMLOListElement>();

  return (
    <ol ref={ref} className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-6">
      {/* base rail */}
      <span aria-hidden className="absolute top-[3px] left-0 hidden h-px w-full bg-border md:block" />
      {/* drawn rail */}
      <span
        aria-hidden
        className="absolute top-[3px] left-0 hidden h-px w-full origin-left bg-secondary md:block"
        style={{
          transform: inView ? "scaleX(1)" : "scaleX(0)",
          transition: `transform ${DRAW_MS}ms linear`,
        }}
      />
      {STEPS.map((st, i) => {
        const delay = i * STEP_MS;
        const active = inView;
        return (
          <li
            key={st.n}
            className="relative md:pt-6"
            style={{
              opacity: active ? 1 : 0.45,
              transition: `opacity 400ms cubic-bezier(0.2,0,0,1) ${delay}ms`,
            }}
          >
            <span
              aria-hidden
              className="absolute top-0 left-0 hidden h-[7px] w-[7px] rounded-full md:block"
              style={{
                background: active ? "var(--text-primary)" : "var(--border-hover)",
                transition: `background 300ms ${delay}ms`,
              }}
            />
            {i === 3 && <span aria-hidden className="absolute top-[3px] right-0 hidden h-px w-3 bg-background md:block" />}

            <div className="flex items-baseline gap-3">
              <Mono className="text-tertiary">{st.n}</Mono>
              <span className="text-lg font-semibold">{st.t}</span>
            </div>
            <Label className="mt-1">{st.who}</Label>
            <Mono className="mt-4 block text-secondary">{st.sub}</Mono>
            <p className="mt-2 max-w-[26ch] text-sm text-secondary">{st.body}</p>

            {/* the payment appears at ACT */}
            {i === 2 && stamp && (
              <div
                className="mt-4 inline-flex items-baseline gap-2 rounded-[8px] border border-border bg-surface px-3 py-2"
                style={{ opacity: active ? 1 : 0, transition: `opacity 400ms ${delay + 250}ms` }}
              >
                <span className="text-lg font-semibold leading-none">{stamp.amount}</span>
                <Mono className="text-xs text-tertiary">USDC</Mono>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <ArrowRight size={12} strokeWidth={1.5} className="text-tertiary" />
              <Mono className="text-xs text-tertiary">{st.out}</Mono>
            </div>

            {/* the real stamp appears at STAMP */}
            {i === 3 && stamp && (
              <Link
                href={`/a/${stamp.agentId}`}
                className="mt-5 block"
                style={{
                  opacity: active ? 1 : 0,
                  transform: active ? "none" : "translateY(8px)",
                  transition: `opacity 450ms ${delay + 300}ms, transform 450ms cubic-bezier(0.2,0,0,1) ${delay + 300}ms`,
                }}
              >
                <Card hover className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <VerifiedBadge />
                    <Mark size={14} landing={active} className="text-tertiary" />
                  </div>
                  <div className="mt-3 text-lg font-semibold leading-tight">{stamp.amount} USDC</div>
                  <Mono className="mt-1 block text-secondary">Agent #{stamp.agentId}</Mono>
                </Card>
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
