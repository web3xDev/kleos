"use client";

// The closing's purple atmosphere. Fades up once when the section enters view.

import { useInView } from "@/components/reveal";

export function ClosingGlow() {
  const [ref, inView] = useInView<HTMLDivElement>("0px 0px -30% 0px");
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-x-[-32px] bottom-0 top-1/4 md:inset-x-[-120px]"
      style={{
        background:
          "radial-gradient(ellipse 70% 55% at 50% 100%, rgba(99, 85, 184, 0.16), rgba(99, 85, 184, 0.06) 40%, transparent 72%)",
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(24px)",
        transition: "opacity 600ms ease-out, transform 600ms ease-out",
      }}
    />
  );
}
