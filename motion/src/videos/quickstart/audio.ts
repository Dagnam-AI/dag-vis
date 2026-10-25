// The bed and the ticks, from the same timing file as the picture.
import { noise, silence, tone, type Envelope } from "../../lib/audio/synth.ts";
import { BEATS, EVENTS, FPS, TIMING, type SoundEvent } from "./timing.ts";

export const SAMPLE_RATE = 48000;
const PAD: Envelope = { attack: 3, decay: 0, sustain: 1, release: 4 };
const BREATH: Envelope = {
  attack: 0.7,
  decay: 0.2,
  sustain: 0.5,
  release: 0.7,
};
const PING: Envelope = {
  attack: 0.004,
  decay: 0.05,
  sustain: 0.3,
  release: 0.06,
};
/** Seconds a tick rings. */
export const TICK_LENGTH = 0.14;
/** A step's second note follows the first by this long. */
const STEP_GAP = 0.07;

/** The low pad alone: A1, E2 and A2, each swelling slowly at its own pace, fading in over 3 s and out over 4 s. */
export function renderPad(): Float32Array {
  const bed = silence(TIMING.duration, SAMPLE_RATE);
  for (const [freq, gain, lfoFreq] of [
    [55, 0.16, 1 / 13],
    [82.41, 0.09, 1 / 17],
    [110, 0.06, 1 / 23],
  ] as const)
    tone(bed, SAMPLE_RATE, {
      freq,
      start: 0,
      length: TIMING.duration,
      gain,
      env: PAD,
      lfo: { freq: lfoFreq, depth: 0.4 },
    });
  return bed;
}

/** The pad plus one quiet, dark breath as each section begins: the bed without its ticks. */
export function renderBackdrop(): Float32Array {
  const bed = renderPad();
  BEATS.slice(1).forEach((b, i) => {
    noise(bed, SAMPLE_RATE, {
      start: b.start / FPS - 0.2,
      length: 1.6,
      gain: 0.05,
      env: BREATH,
      seed: 200 + i,
      cutoff: 500,
    });
  });
  return bed;
}

/** One soft sine blip at `at` seconds. */
function ping(bed: Float32Array, freq: number, at: number, gain: number): void {
  tone(bed, SAMPLE_RATE, {
    freq,
    start: at,
    length: TICK_LENGTH,
    gain,
    env: PING,
  });
}

/** A link: one high blip. A step: two blips a fifth apart, rising. */
export function addTick(bed: Float32Array, e: SoundEvent): void {
  const at = e.frame / FPS;
  if (e.kind === "connect") ping(bed, 1318.5, at, 0.05);
  else {
    ping(bed, 659.25, at, 0.055);
    ping(bed, 987.77, at + STEP_GAP, 0.055);
  }
}

/** What `npm run audio` normalises: the backdrop with a tick at every event of the timing file. */
export function renderBed(): Float32Array {
  const bed = renderBackdrop();
  for (const e of EVENTS) addTick(bed, e);
  return bed;
}
