// The Kleos mark: a seal. A ring with one bar through it, like the
// cancellation mark stamped over a postage stamp: "this happened, and it
// cannot be undone". `landing` animates the bar, the gesture a new stamp makes.

export function Mark({ size = 20, landing = false, className }: { size?: number; landing?: boolean; className?: string }) {
  // Heavier strokes at small sizes so the ring still reads as a ring.
  const stroke = size <= 16 ? 7 : size <= 24 ? 6 : 5;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      className={`block shrink-0 ${className ?? ""}`}
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="21" />
      <line x1="10" y1="46" x2="54" y2="18" className={landing ? "mark-land" : undefined} />
    </svg>
  );
}

// The logo: mark + KLEOS. Scales from the mark size with the header's
// proportions (24px mark, 14px text, 8px gap). Below that the text is kept
// at 11px or more: at small sizes a strict ratio makes the mark look heavy.
// `muted` is the grey version used in card chrome ("KLEOS / STAMP").
export function Wordmark({ size = 24, muted = false }: { size?: number; muted?: boolean }) {
  return (
    <span className={`inline-flex items-center ${muted ? "text-tertiary" : "text-primary"}`} style={{ gap: size / 3 }}>
      <Mark size={size} className={muted ? "text-tertiary" : "text-accent"} />
      <span className="font-semibold leading-none tracking-[0.18em]" style={{ fontSize: Math.max(11, (size * 14) / 24) }}>
        KLEOS
      </span>
    </span>
  );
}
