"use client";

// How it works, as a sequence: when the section enters the viewport the
// rail draws left to right, each step activates in turn, the payment
// appears at ACT, and the real stamp appears at STAMP. Then it stops.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, Label, Mono, VerifiedBadge } from "@/components/ui";
import { Mark, Wordmark } from "@/components/mark";
import { useInView } from "@/components/reveal";

type StampLite = { amount: string; agentId: number } | null;

const STEPS = [
  { n: "01", t: "Register", who: "Human", sub: "ERC-8004 identity", out: "identity", body: "One passkey ceremony. No seed phrase, no wallet." },
  { n: "02", t: "Connect", who: "Human + runtime", sub: "Runtime", out: "paired key", body: "The software that runs the agent gets its own key. It never sees yours." },
  { n: "03", t: "Act", who: "Agent + runtime", sub: "x402 payment", out: "settlement", body: "The agent buys a tool. The payment settles on Monad." },
  { n: "04", t: "Stamp", who: "Kleos", sub: "Portable record", out: "anchored", body: "A signed receipt, anchored next to the payment. Anyone can verify it." },
];

// Timing of the sequence, in ms from the moment the section is in view.
const STEP_MS = 320;
const DRAW_MS = STEP_MS * 3;

export function Pipeline({ stamp }: { stamp: StampLite }) {
  const [ref, inView] = useInView<HTMLOListElement>("0px 0px -40% 0px");

  return (
    <ol ref={ref} className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-6">
      {/* base rail */}
      <span aria-hidden className="absolute top-[3px] left-0 hidden h-px w-[calc(75%+18px)] bg-border md:block" />
      {/* drawn rail */}
      <span
        aria-hidden
        className="absolute top-[3px] left-0 hidden h-px w-[calc(75%+18px)] origin-left bg-accent md:block"
        style={{
          transform: inView ? "scaleX(1)" : "scaleX(0)",
          transition: `transform ${DRAW_MS}ms linear`,
        }}
      />
      {/* the head of the drawn rail: a 3px point, no glow, gone when it arrives */}
      <span
        aria-hidden
        className="absolute top-[2.5px] hidden h-[2px] w-[2px] rounded-full bg-accent md:block"
        style={{
          left: inView ? "calc(75% + 18px)" : "0px",
          opacity: inView ? 0 : 1,
          transition: `left ${DRAW_MS}ms linear, opacity 200ms ${DRAW_MS}ms`,
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
                background: active ? "var(--accent)" : "var(--border-hover)",
                transition: `background 300ms ${delay}ms`,
              }}
            />

            <div className="flex items-baseline gap-3">
              <Mono className="text-tertiary">{st.n}</Mono>
              <span className="text-lg font-semibold">{st.t}</span>
            </div>
            {st.who === "Kleos" ? (
              // Kleos's own step is signed with the logo, same height as the other labels
              <div className="mt-1 flex h-[18px] items-center">
                <Wordmark size={14} />
              </div>
            ) : (
              <Label className="mt-1">{st.who}</Label>
            )}
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

            {/* the real stamp appears at STAMP; until it loads, its space is held (invisible) */}
            {i === 3 && !stamp && (
              <div aria-hidden className="invisible mt-5">
                <Card className="p-4">
                  <div className="h-6" />
                  <div className="mt-3 text-lg font-semibold leading-tight">$0.00</div>
                  <Mono className="mt-1 block">Agent #0000</Mono>
                </Card>
              </div>
            )}
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
                <Card hover className="relative overflow-hidden p-4">
                  {/* A rubber-stamp impression of the seal, pressed on after the card lands */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 text-secondary"
                    style={{
                      opacity: active ? 0.5 : 0,
                      transform: `translateY(-50%) scale(${active ? 1 : 1.6})`,
                      transition: `opacity 220ms ease-out ${delay + 800}ms, transform 260ms cubic-bezier(0.3, 0, 0.2, 1.4) ${delay + 800}ms`,
                    }}
                  >
                    {/* drop-shadow follows the strokes themselves, not a box */}
                    <Mark size={64} className="[filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.85))]" />
                  </span>
                  <VerifiedBadge />
                  <div className="mt-3 text-lg font-semibold leading-tight">{stamp.amount}</div>
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
