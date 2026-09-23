// The Kleos mark: a tally. Four strokes and the cross, one mark per action.
// `landing` animates the fifth stroke, the gesture a new stamp makes.

export function Mark({ size = 20, landing = false, className }: { size?: number; landing?: boolean; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={size <= 20 ? 6.5 : 5}
      strokeLinecap="round"
      className={`block shrink-0 ${className ?? ""}`}
      aria-hidden="true"
    >
      <line x1="14" y1="14" x2="14" y2="50" />
      <line x1="26" y1="14" x2="26" y2="50" />
      <line x1="38" y1="14" x2="38" y2="50" />
      <line x1="50" y1="14" x2="50" y2="50" />
      <line x1="8" y1="44" x2="56" y2="20" className={landing ? "mark-land" : undefined} />
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
