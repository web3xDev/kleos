"use client";

// Every ERC-8004 agent on the network as one small square. Grey: registered.
// Purple: has a Kleos track record. The page's thesis, seen instead of read:
// thousands of identities, a handful of histories. Hover names an agent,
// click opens its profile.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mono } from "@/components/ui";

export type MapAgent = { id: number; name: string | null; stamps: number };

export function NetworkMap({ agents, loading }: { agents: MapAgent[]; loading: boolean }) {
  const router = useRouter();
  const [hover, setHover] = useState<MapAgent | null>(null);
  const withRecord = agents.filter((a) => a.stamps > 0).length;

  // While loading, hold the space with dim squares so the page does not jump.
  const cells = loading ? Array.from({ length: 1950 }, (_, i) => ({ id: i, name: null, stamps: 0 })) : agents;

  const pick = (target: EventTarget) => {
    const i = (target as HTMLElement).dataset?.i;
    return i === undefined ? null : cells[Number(i)];
  };

  return (
    <div>
      <div
        role={loading ? undefined : "list"}
        aria-label={loading ? "Loading the registry" : `${agents.length} agents, ${withRecord} with a track record`}
        className={`grid grid-cols-[repeat(auto-fill,6px)] gap-[2px] sm:grid-cols-[repeat(auto-fill,8px)] sm:gap-[3px] ${loading ? "animate-pulse" : ""}`}
        // Crossing the gaps between squares keeps the last agent; the legend only returns on leaving the map.
        onMouseOver={(e) => {
          const a = !loading && pick(e.target);
          if (a) setHover(a);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const a = !loading && pick(e.target);
          if (a) router.push(`/a/${a.id}`);
        }}
      >
        {cells.map((a, i) =>
          a.stamps > 0 ? (
            <span
              key={a.id}
              data-i={i}
              role="listitem"
              aria-label={`${a.name ?? `Agent #${a.id}`}, ${a.stamps} verified actions`}
              className="record-dot aspect-square cursor-pointer rounded-[2px] bg-accent"
            />
          ) : (
            <span
              key={a.id}
              data-i={i}
              // Colours ease in when the scan lands instead of switching all at once
              className={`aspect-square rounded-[2px] transition-colors duration-500 ${loading ? "bg-surface-elevated" : "cursor-pointer bg-border hover:bg-border-hover hover:duration-150"}`}
            />
          ),
        )}
      </div>

      {/* One line under the map: the legend, or the agent under the cursor */}
      <div className="mt-4 flex h-5 flex-wrap items-center gap-x-5 text-xs text-tertiary">
        {hover && hover.stamps > 0 ? (
          // An agent with a record reads differently: the same KLEOS tag as the list, name and count in purple.
          <span className="inline-flex items-center gap-2">
            <Mono className="rounded bg-accent/25 px-1.5 py-0.5 text-[10px] leading-none tracking-[0.12em] text-accent-text">KLEOS</Mono>
            <span className="font-medium text-accent-text">{hover.name ?? `Agent #${hover.id}`}</span>
            <Mono className="text-xs">#{hover.id}</Mono>
            <span className="text-secondary">
              {hover.stamps} verified {hover.stamps === 1 ? "action" : "actions"}
            </span>
          </span>
        ) : hover ? (
          <span>
            <span className="text-secondary">{hover.name ?? `Agent #${hover.id}`}</span>
            <Mono className="ml-2 text-xs">#{hover.id}</Mono>
            <span className="ml-2">no track record yet</span>
          </span>
        ) : (
          <>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-[2px] bg-border" /> Registered
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-[2px] bg-accent" /> With a Kleos track record
            </span>
            <span className="hidden sm:inline">Hover an agent, click to open it.</span>
          </>
        )}
      </div>
    </div>
  );
}
