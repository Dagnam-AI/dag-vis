// The bed, from the same timing file as the picture.
import {
  FLAT,
  noise,
  silence,
  tone,
  type Envelope,
} from "../../lib/audio/synth.ts";
import { TIMING } from "./timing.ts";

export const SAMPLE_RATE = 48000;
const SWELL: Envelope = { attack: 0.4, decay: 0.3, sustain: 0.4, release: 0.5 };
const SWELL_LENGTH = 1.2; // the last swell, at 4.5 s, ends at 5.7 s: inside the 6 s loop

/** Periodic in TIMING.duration: 55 × 6 and 110 × 6 are whole cycles, the AM runs exactly once per loop, every swell ends before the seam. */
export function renderBed(): Float32Array {
  const bed = silence(TIMING.duration, SAMPLE_RATE);
  tone(bed, SAMPLE_RATE, {
    freq: 55,
    start: 0,
    length: TIMING.duration,
    gain: 0.18,
    env: FLAT,
  });
  tone(bed, SAMPLE_RATE, {
    freq: 110,
    start: 0,
    length: TIMING.duration,
    gain: 0.08,
    env: FLAT,
    lfo: { freq: 1 / TIMING.duration, depth: 0.5 },
  });
  Object.values(TIMING.beats).forEach((at, i) => {
    noise(bed, SAMPLE_RATE, {
      start: at,
      length: SWELL_LENGTH,
      gain: 0.12,
      env: SWELL,
      seed: 100 + i,
      cutoff: 900,
    });
  });
  return bed;
}
