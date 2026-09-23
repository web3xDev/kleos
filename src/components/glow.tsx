"use client";

// The closing's purple atmosphere, behind the headline. Fades up once when the section enters view.

import { useInView } from "@/components/reveal";

export function ClosingGlow() {
  const [ref, inView] = useInView<HTMLDivElement>("0px 0px -10% 0px");
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-x-[-32px] inset-y-0 md:inset-x-[-120px]"
      style={{
        // Centered behind the headline and fully faded before the section's
        // bottom edge, so it reads as the section's own light, not the footer's.
        background:
          "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(99, 85, 184, 0.16), rgba(99, 85, 184, 0.06) 45%, transparent 75%)",
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(24px)",
        transition: "opacity 600ms ease-out, transform 600ms ease-out",
      }}
    />
  );
}
