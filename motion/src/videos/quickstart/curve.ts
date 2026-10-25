import { mulberry32 } from "../../lib/audio/rng.ts";

/**
 * A loss curve from the seed: `count` heights in [0, 1], 1 the top of the plot.
 * It falls steeply, then flattens, with a wobble that dies away; it never
 * goes up between two samples by more than the wobble.
 */
export function lossCurve(seed: number, count: number): number[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => {
    const u = i / (count - 1);
    const wobble = (rnd() - 0.5) * 0.09 * (1 - u) ** 1.5;
    return Math.min(1, Math.max(0, 0.1 + 0.85 * Math.exp(-3.6 * u) + wobble));
  });
}

/** Code-line shapes from the seed: an indent step (0..2), two widths in [0, 1] and whether the line is blank. */
export function codeLines(
  seed: number,
  count: number,
  blanks: readonly number[],
): { indent: number; token: number; rest: number; blank: boolean }[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => ({
    indent: Math.floor(rnd() * 3),
    token: 0.08 + rnd() * 0.1,
    rest: 0.2 + rnd() * 0.5,
    blank: blanks.includes(i),
  }));
}
