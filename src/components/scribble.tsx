"use client";

// A hand-drawn underline under a line of text, with a handwritten note on
// the next line. Drawn once, when it comes into view.

import { useInView } from "@/components/reveal";

export function Scribble({ note, children }: { note: string; children: React.ReactNode }) {
  const [ref, inView] = useInView<HTMLSpanElement>("0px 0px -35% 0px");
  return (
    <span ref={ref} className="inline-block">
      <span className="relative inline-block">
        {children}
        <svg
          className={`underline-draw pointer-events-none absolute -bottom-2.5 left-0 w-full ${inView ? "drawn" : ""}`}
          height="12"
          viewBox="0 0 260 12"
          fill="none"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M2 8C28 4.5 54 2.8 82 3.2c30 .4 60 2.8 90 4.2 24 1.1 48 .9 76-2.4"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span
        className="hand mt-4 block -rotate-2 pl-10"
        style={{ opacity: inView ? 1 : 0, transition: "opacity 400ms ease-out 700ms" }}
      >
        {note}
      </span>
    </span>
  );
}
