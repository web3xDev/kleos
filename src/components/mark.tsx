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
      className={className}
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

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-primary">
      <Mark size={size} />
      <span className="text-sm font-semibold tracking-[0.18em]">KLEOS</span>
    </span>
  );
}
