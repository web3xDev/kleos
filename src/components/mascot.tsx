// The Kleos creature: a pixel sprite in the accent color with the tally on
// its forehead, two antennae, big eyes and a hand on the card's edge. It
// peeks from behind the hero card; the face sits on the left of the sprite
// so it stays visible while the body hides behind the card.

const PALETTE: Record<string, string> = {
  "1": "var(--accent)", // body
  "2": "var(--background)", // eye
  "3": "var(--text-primary)", // eye highlight
  "4": "var(--accent-hover)", // lighter: forehead tally, blush
  "5": "#4c419a", // darker: outline shade, mouth
};

// 16 x 16
const ROWS = [
  "0001000000010000",
  "0001100000110000",
  "0001111111100000",
  "0011111111110000",
  "0111414141111100",
  "0111414141111100",
  "0111111111111100",
  "1122111112211110",
  "1232111112321110",
  "1122111112211110",
  "1441111111144110",
  "1111151111511110",
  "1111115551111110",
  "0111111111111100",
  "0011111111111000",
  "0001111111111000",
];

export function Mascot({ size = 112, className = "" }: { size?: number; className?: string }) {
  const n = ROWS.length;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className={className} aria-hidden="true">
      {ROWS.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "0" ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={PALETTE[c]} />,
        ),
      )}
    </svg>
  );
}

/** Four fingers over the card edge, drawn separately so they sit above the card. */
export function MascotHand({ size = 28, className = "" }: { size?: number; className?: string }) {
  const rows = ["0110", "1111", "1111", "0111"];
  return (
    <svg width={size} height={size} viewBox="0 0 4 4" shapeRendering="crispEdges" className={className} aria-hidden="true">
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => (c === "0" ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="var(--accent)" />)),
      )}
    </svg>
  );
}
