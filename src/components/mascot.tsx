// A small pixel creature in the accent color, peeking from behind the hero
// card. The face sits on the left of the sprite so it stays visible while
// the right side hides behind the card. Static; on hover it leans out a bit.

export function Mascot({ size = 96, className = "" }: { size?: number; className?: string }) {
  // 14 x 14 grid. 1 = body, 2 = eye, 3 = eye highlight, 0 = empty.
  const rows = [
    "00001111110000",
    "00111111111100",
    "01111111111110",
    "01111111111110",
    "11221111221111",
    "12321111232111",
    "11221111221111",
    "11111111111111",
    "11111111111111",
    "11111100111111",
    "11111111111111",
    "01111111111110",
    "01111111111110",
    "00111111111100",
  ];
  const n = rows.length;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className={className} aria-hidden="true">
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "0" ? null : (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill={c === "1" ? "var(--accent)" : c === "2" ? "var(--background)" : "var(--text-primary)"}
            />
          ),
        ),
      )}
    </svg>
  );
}
