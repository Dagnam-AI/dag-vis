import { mulberry32 } from "./rng.ts";

/** Seconds; sustain is a level 0..1. attack + decay + release must fit in the note. */
export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}
export const FLAT: Envelope = { attack: 0, decay: 0, sustain: 1, release: 0 };

export function envelopeAt(env: Envelope, t: number, length: number): number {
  if (t < 0 || t >= length) return 0;
  if (t < env.attack) return t / env.attack;
  if (t < env.attack + env.decay)
    return 1 - (1 - env.sustain) * ((t - env.attack) / env.decay);
  const releaseStart = length - env.release;
  if (t >= releaseStart)
    return env.sustain * (1 - (t - releaseStart) / env.release);
  return env.sustain;
}

export function silence(seconds: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.round(seconds * sampleRate));
}

const span = (
  buf: Float32Array,
  sampleRate: number,
  start: number,
  length: number,
): Float32Array =>
  buf.subarray(
    Math.round(start * sampleRate),
    Math.min(buf.length, Math.round((start + length) * sampleRate)),
  );

export interface ToneSpec {
  freq: number;
  start: number;
  length: number;
  gain: number;
  env: Envelope;
  lfo?: { freq: number; depth: number };
}
/** Adds a sine. For a seamless loop choose freq × loop duration and lfo.freq × loop duration integer. */
export function tone(buf: Float32Array, sampleRate: number, s: ToneSpec): void {
  const seg = span(buf, sampleRate, s.start, s.length);
  const lfo = s.lfo;
  const am = lfo
    ? (t: number): number =>
        1 + lfo.depth * Math.sin(2 * Math.PI * lfo.freq * t)
    : (): number => 1;
  seg.forEach((v, k) => {
    const t = k / sampleRate;
    seg[k] =
      v +
      s.gain *
        am(t) *
        envelopeAt(s.env, t, s.length) *
        Math.sin(2 * Math.PI * s.freq * t);
  });
}

export interface NoiseSpec {
  start: number;
  length: number;
  gain: number;
  env: Envelope;
  seed: number;
  cutoff: number;
}
/** Adds seeded white noise through a one-pole low-pass at `cutoff` Hz. */
export function noise(
  buf: Float32Array,
  sampleRate: number,
  s: NoiseSpec,
): void {
  const seg = span(buf, sampleRate, s.start, s.length);
  const rnd = mulberry32(s.seed);
  const alpha = 1 - Math.exp((-2 * Math.PI * s.cutoff) / sampleRate);
  let y = 0;
  seg.forEach((v, k) => {
    y += alpha * (rnd() * 2 - 1 - y);
    seg[k] = v + s.gain * envelopeAt(s.env, k / sampleRate, s.length) * y;
  });
}

export function peak(buf: Float32Array): number {
  return buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
}

export function applyGain(buf: Float32Array, linear: number): Float32Array {
  return buf.map((v) => v * linear);
}
