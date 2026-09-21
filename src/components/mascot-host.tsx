"use client";

// Cards the mascot can hide behind. Only one host is "active" at a time: the
// one nearest the middle of the viewport. The mascot ducks fully behind the
// previous card and peeks out from the next, so it looks like it moved.

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Mascot, MascotHand } from "@/components/mascot";

type Registry = { active: string | null; register: (id: string, el: HTMLElement) => () => void };
const Ctx = createContext<Registry | null>(null);

export function MascotProvider({ children }: { children: ReactNode }) {
  const hosts = useRef(new Map<string, HTMLElement>());
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let raf = 0;
    const pick = () => {
      raf = 0;
      const mid = window.innerHeight / 2;
      let best: string | null = null;
      let bestD = Infinity;
      hosts.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const d = Math.abs((r.top + r.bottom) / 2 - mid);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      });
      setActive(best);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(pick);
    };
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const value = useMemo<Registry>(
    () => ({
      active,
      register: (id, el) => {
        hosts.current.set(id, el);
        return () => {
          hosts.current.delete(id);
        };
      },
    }),
    [active],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function MascotHost({
  id,
  side = "left",
  top = "26%",
  children,
  className = "",
}: {
  id: string;
  side?: "left" | "right";
  top?: string;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(Ctx);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ctx || !ref.current) return;
    return ctx.register(id, ref.current);
  }, [ctx, id]);

  const on = ctx?.active === id;
  const left = side === "left";
  // Out: peeking past the edge. In: fully behind the card (the card sits above it).
  const out = left ? "translateX(0) rotate(-10deg)" : "translateX(0) rotate(10deg) scaleX(-1)";
  const inn = left ? "translateX(72px) rotate(0deg)" : "translateX(-72px) rotate(0deg) scaleX(-1)";

  return (
    <div ref={ref} className={`group relative ${className}`}>
      <Mascot
        size={112}
        className={`absolute z-0 transition-transform duration-[360ms] ease-out ${left ? "-left-[66px] origin-bottom-right" : "-right-[66px] origin-bottom-left"}`}
        style={{ top, transform: on ? out : inn }}
      />
      <MascotHand
        size={24}
        className={`absolute z-20 transition-opacity duration-[200ms] ${left ? "-left-[6px]" : "-right-[6px] -scale-x-100"}`}
        style={{ top: `calc(${top} + 100px)`, opacity: on ? 1 : 0 }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
