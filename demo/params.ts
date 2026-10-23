export type Params =
  | {
      ok: true;
      /** null = the live, animated gallery. */
      t: number | null;
      seed: number;
      /** null = every effect. */
      effect: string | null;
      w: number;
      h: number;
    }
  | { ok: false; error: string };

export const SIZE_MIN = 16;
export const SIZE_MAX = 4096;

const fail = (name: string, raw: string, expected: string): Params => ({
  ok: false,
  error: `Invalid ?${name}=${raw}: expected ${expected}`,
});

/**
 * Parses and validates every URL parameter before anything is built. An absent
 * parameter takes its default (seed 1, w 320, h 480, t unset, all effects); a
 * present one must be well formed, so an empty value is an error, not a default.
 */
export function parseParams(
  search: string,
  effects: readonly string[],
): Params {
  const q = new URLSearchParams(search);
  const seedRaw = q.get("seed") ?? "1";
  if (!/^-?\d+$/.test(seedRaw) || !Number.isSafeInteger(Number(seedRaw)))
    return fail("seed", seedRaw, "an integer");
  const tRaw = q.get("t");
  if (
    tRaw !== null &&
    !(/^(\d+\.?\d*|\.\d+)$/.test(tRaw) && Number.isFinite(Number(tRaw)))
  )
    return fail("t", tRaw, "a number of seconds >= 0");
  const wRaw = q.get("w") ?? "320";
  const hRaw = q.get("h") ?? "480";
  for (const [name, raw] of [
    ["w", wRaw],
    ["h", hRaw],
  ] as const)
    if (!/^\d+$/.test(raw) || Number(raw) < SIZE_MIN || Number(raw) > SIZE_MAX)
      return fail(
        name,
        raw,
        `an integer from ${String(SIZE_MIN)} to ${String(SIZE_MAX)}`,
      );
  const effect = q.get("effect");
  if (effect !== null && !effects.includes(effect))
    return fail("effect", effect, `one of ${effects.join(", ")}`);
  return {
    ok: true,
    t: tRaw === null ? null : Number(tRaw),
    seed: Number(seedRaw) + 0, // "-0" parses to -0; + 0 normalises it
    effect,
    w: Number(wRaw),
    h: Number(hRaw),
  };
}
