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

/** The measured audio has no level at all (loudnorm prints "-inf"): a silent track, or one below its -70 LUFS gate. */
export class SilentAudioError extends Error {
  constructor() {
    super(
      "audio is silent: loudnorm measured -inf LUFS (a silent track, or below its -70 LUFS gate)",
    );
    this.name = "SilentAudioError";
  }
}

/**
 * Parses the JSON block `-af loudnorm=...:print_format=json -f null -` prints on
 * stderr. Remotion's bundled ffmpeg has no ebur128, so this is the measurement.
 * A silent input reports "-inf" and throws SilentAudioError; any other
 * unreadable block or missing field throws a plain Error naming it.
 */
export function parseLoudnorm(stderr: string): Loudness {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start)
    throw new Error("loudnorm: no JSON block in ffmpeg output");
  const block = stderr.slice(start, end + 1);
  let o: Record<string, string>;
  try {
    o = JSON.parse(block) as Record<string, string>;
  } catch {
    throw new Error(`loudnorm: unreadable JSON block: ${block}`);
  }
  if (o.input_i === "-inf") throw new SilentAudioError();
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

const integratedProblem = (l: Loudness): string[] =>
  Math.abs(l.integrated - TARGET.integrated) > TARGET.tolerance
    ? [
        `integrated loudness ${String(l.integrated)} LUFS, target ${String(TARGET.integrated)} ±${String(TARGET.tolerance)}`,
      ]
    : [];

/** A finished render: loudness within tolerance, true peak strictly below -1 dBTP. */
export function checkLoudness(l: Loudness): string[] {
  const problems = integratedProblem(l);
  if (l.truePeak >= TARGET.truePeakMax)
    problems.push(
      `true peak ${String(l.truePeak)} dBTP, must be below ${String(TARGET.truePeakMax)}`,
    );
  return problems;
}

/**
 * Peak ceiling for the WAV the render muxes in. AAC encoding can raise true
 * peaks by a few tenths of a dB, so the bed needs headroom to still be under
 * TARGET.truePeakMax in the finished file.
 */
export const BED_TRUE_PEAK_MAX = -1.5;

/** The bed before encoding: loudness within tolerance, true peak at or below BED_TRUE_PEAK_MAX. */
export function checkBed(l: Loudness): string[] {
  const problems = integratedProblem(l);
  if (l.truePeak > BED_TRUE_PEAK_MAX)
    problems.push(
      `true peak ${String(l.truePeak)} dBTP, the bed must be at or below ${String(BED_TRUE_PEAK_MAX)} (AAC encoding raises peaks)`,
    );
  return problems;
}
