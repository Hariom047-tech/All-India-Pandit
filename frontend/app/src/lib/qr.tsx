import type { ReactNode } from "react";

/* Deterministic decorative QR-style block (not a scannable code) — purely
   visual, seeded from the pandit id so it's stable across renders. */
export function DecorativeQr({ seed: seedStr }: { seed: string }) {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) % 100000;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const n = 21;
  const cell = 148 / n;
  const rects: ReactNode[] = [];

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
      if (inFinder) continue;
      if (rnd() > 0.52) {
        rects.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill="#2d2d2d" />);
      }
    }
  }

  function finder(ox: number, oy: number, key: string) {
    return (
      <g key={key}>
        <rect x={ox * cell} y={oy * cell} width={7 * cell} height={7 * cell} fill="#2d2d2d" />
        <rect x={(ox + 1) * cell} y={(oy + 1) * cell} width={5 * cell} height={5 * cell} fill="#fff" />
        <rect x={(ox + 2) * cell} y={(oy + 2) * cell} width={3 * cell} height={3 * cell} fill="#d4a017" />
      </g>
    );
  }

  return (
    <svg viewBox="0 0 148 148" role="img" aria-label="Profile QR code">
      <rect width={148} height={148} fill="#fff" />
      {rects}
      {finder(0, 0, "f1")}
      {finder(n - 7, 0, "f2")}
      {finder(0, n - 7, "f3")}
    </svg>
  );
}
