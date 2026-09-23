"use client";

// Animates a block's height when its content changes size (e.g. the verify
// call-to-action turning into the verification panel), instead of jumping.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function SmoothHeight({ children, className }: { children: ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className={className}
      style={{
        height: height ?? undefined,
        overflow: "hidden",
        transition: "height 320ms cubic-bezier(0.2, 0, 0, 1)",
      }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
