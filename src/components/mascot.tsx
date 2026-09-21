// A small pixel creature in the accent color, peeking from behind the hero
// card. Static; on hover it rises 2px. Landing only.

export function Mascot({ size = 56, className = "" }: { size?: number; className?: string }) {
  // 12 x 10 grid. 1 = body, 2 = eye, 0 = empty.
  const rows = [
    "000111111000",
    "001111111100",
    "011111111110",
    "011211112110",
    "011211112110",
    "011111111110",
    "011111111110",
    "011101101110",
    "011111111110",
    "011111111110",
  ];
  const cell = size / 12;
  return (
    <svg
      width={size}
      height={(size / 12) * 10}
      viewBox="0 0 12 10"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "0" ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={c === "1" ? "var(--accent)" : "var(--background)"} />
          ),
        ),
      )}
      <title>{String(cell)}</title>
    </svg>
  );
}
