"use client";

// Counts from zero to the real value once, when the number comes into view.
// Formatting is preserved: "1,919" counts as a number, "$0.15" as a decimal.

import { useEffect, useState } from "react";
import { useInView } from "@/components/reveal";

const DURATION = 600;

function parse(value: string): { n: number; prefix: string; decimals: number; grouped: boolean } | null {
  const m = /^(\D*)([\d.,]+)$/.exec(value.trim());
  if (!m) return null;
  const [, prefix, digits] = m;
  const grouped = digits.includes(",");
  const plain = digits.replace(/,/g, "");
  const decimals = plain.includes(".") ? plain.split(".")[1].length : 0;
  const n = Number(plain);
  return Number.isFinite(n) ? { n, prefix, decimals, grouped } : null;
}

function format(n: number, { prefix, decimals, grouped }: { prefix: string; decimals: number; grouped: boolean }): string {
  const body = grouped
    ? n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : n.toFixed(decimals);
  return prefix + body;
}

export function CountUp({ value }: { value: string }) {
  const [ref, inView] = useInView<HTMLSpanElement>("0px 0px -10% 0px");
  const parsed = parse(value);
  const [shown, setShown] = useState(() => (parsed ? format(0, parsed) : value));

  useEffect(() => {
    if (!parsed || !inView) return;
    const target = parsed.n;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      // ease-out cubic: fast first, settles on the real number
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(format(target * eased, parsed));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setShown(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // value is the only input that matters; parsed derives from it
  }, [inView, value]);

  if (!parsed) return <>{value}</>;
  return (
    <span ref={ref} className="tabular-nums">
      {shown}
    </span>
  );
}
