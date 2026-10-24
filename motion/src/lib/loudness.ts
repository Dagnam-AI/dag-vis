export interface Loudness {
  integrated: number;
  truePeak: number;
  lra: number;
}
/** remotion-video skill: about -16 LUFS integrated, true peaks below -1 dBTP. */
export const TARGET = {
  integrated: -16,
  tolerance: 1,
  truePeakMax: -1,
} as const;

/**
 * Parses the JSON block `-af loudnorm=...:print_format=json -f null -` prints on
 * stderr. Remotion's bundled ffmpeg has no ebur128, so this is the measurement.
 * A silent input reports "-inf", which is not a number and is rejected.
 */
export function parseLoudnorm(stderr: string): Loudness {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start)
    throw new Error("loudnorm: no JSON block in ffmpeg output");
  const block = stderr.slice(start, end + 1);
  const o = JSON.parse(block) as Record<string, string>;
  const num = (key: string): number => {
    const n = Number(o[key]);
    if (!Number.isFinite(n))
      throw new Error(`loudnorm: ${key} missing or not finite in ${block}`);
    return n;
  };
  return {
    integrated: num("input_i"),
    truePeak: num("input_tp"),
    lra: num("input_lra"),
  };
}

export const gainToTarget = (l: Loudness): number =>
  TARGET.integrated - l.integrated;
export const dbToLinear = (db: number): number => 10 ** (db / 20);

export function checkLoudness(l: Loudness): string[] {
  const problems: string[] = [];
  if (Math.abs(l.integrated - TARGET.integrated) > TARGET.tolerance)
    problems.push(
      `integrated loudness ${String(l.integrated)} LUFS, target ${String(TARGET.integrated)} ±${String(TARGET.tolerance)}`,
    );
  if (l.truePeak >= TARGET.truePeakMax)
    problems.push(
      `true peak ${String(l.truePeak)} dBTP, must be below ${String(TARGET.truePeakMax)}`,
    );
  return problems;
}
