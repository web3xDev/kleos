"use client";

// A hand-drawn underline with a note beside it. Drawn once, when the line
// it belongs to comes into view.

import { useInView } from "@/components/reveal";

export function Scribble({ note, children }: { note: string; children: React.ReactNode }) {
  const [ref, inView] = useInView<HTMLSpanElement>("0px 0px -20% 0px");
  return (
    <span ref={ref} className="relative inline-flex items-end">
      <span className="relative">
        {children}
      <svg
        className={`underline-draw pointer-events-none absolute -bottom-3 left-0 w-full ${inView ? "drawn" : ""}`}
        height="14"
        viewBox="0 0 260 14"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M2 9C28 5 54 3 82 3.5c30 .5 60 3 90 4.5 24 1.2 48 1 76-2.5"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      </span>
      <span
        className="hand ml-4 hidden -rotate-3 sm:inline-block"
        style={{ opacity: inView ? 1 : 0, transition: "opacity 400ms ease-out 700ms" }}
      >
        {note}
      </span>
    </span>
  );
}
