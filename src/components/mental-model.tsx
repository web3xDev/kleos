// The product's mental model in one column: who owns what, who acts, who
// gets paid, what is left behind. Not an architecture diagram.

import { Label, Mono } from "@/components/ui";

const rows: { who: string; what: string; link?: string }[] = [
  { who: "You", what: "a passkey", link: "owns" },
  { who: "Agent", what: "an ERC-8004 identity with a track record", link: "runs through" },
  { who: "Runtime", what: "the software that runs the agent and spends its wallet", link: "pays" },
  { who: "Tool / platform", what: "an x402 service the agent buys from", link: "settles" },
  { who: "Stamp", what: "a portable record: receipt signed, payment anchored, anyone can verify" },
];

export function MentalModel({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={compact ? "space-y-0" : "space-y-0"}>
      {rows.map((r, i) => (
        <li key={r.who}>
          <div className="flex items-baseline gap-3">
            <span className={`w-28 shrink-0 ${compact ? "text-sm" : "text-[15px]"} font-medium text-primary`}>{r.who}</span>
            <span className="text-sm text-secondary">{r.what}</span>
          </div>
          {r.link && (
            <div className="ml-1 flex items-center gap-2 py-1.5">
              <span className="block h-4 w-px bg-border" />
              <Mono className="text-[11px] text-tertiary">{r.link}</Mono>
            </div>
          )}
          {i === rows.length - 1 && <Label className="mt-3 sr-only">End</Label>}
        </li>
      ))}
    </ol>
  );
}
