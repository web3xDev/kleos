"use client";

// A purple line traced once around its parent card, then kept as the card's
// border. Starts only when the card is actually on screen (it often appears
// below the fold), and measures the real perimeter instead of relying on
// pathLength, which older Safari ignores on <rect>.
// Parent must be `relative` with a 1px border and 10px radius (Card).

import { useLayoutEffect, useRef, useState } from "react";
import { useInView } from "@/components/reveal";

export function TraceBorder({ duration = 1100 }: { duration?: number }) {
  const [ref, inView] = useInView<HTMLDivElement>("0px 0px -15% 0px");
  const rect = useRef<SVGRectElement>(null);
  const [len, setLen] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (rect.current) setLen(rect.current.getTotalLength());
  }, []);

  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const drawn = inView || reduce;

  return (
    // inset -0.5px puts the stroke's center on the card's 1px border
    <div ref={ref} aria-hidden className="pointer-events-none absolute -inset-[0.5px]">
      <svg className="h-full w-full overflow-visible">
        <rect
          ref={rect}
          width="100%"
          height="100%"
          rx="9.5"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1"
          style={
            len === null
              ? { opacity: 0 }
              : {
                  strokeDasharray: len,
                  strokeDashoffset: drawn ? 0 : len,
                  transition: reduce ? "none" : `stroke-dashoffset ${duration}ms cubic-bezier(0.4, 0, 0.2, 1) 150ms`,
                }
          }
        />
      </svg>
    </div>
  );
}
