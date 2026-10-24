import { SIZE_MAX, SIZE_MIN } from "./params.js";

export type FlowParams =
  | {
      ok: true;
      /** null = live, animated cards. A number freezes every card at that time. */
      t: number | null;
      /** Export size in pixels (even, so mp4 and webm accept it). */
      w: number;
      h: number;
      /** Export frame rate and length for gif, mp4 and webm. */
      fps: number;
      duration: number;
    }
  | { ok: false; error: string };

const fail = (name: string, raw: string, expected: string): FlowParams => ({
  ok: false,
  error: `Invalid ?${name}=${raw}: expected ${expected}`,
});

const SECONDS = /^(\d+\.?\d*|\.\d+)$/;
const MAX_FPS = 60;
const MAX_DURATION = 60;
/** The CPU renderer rejects times beyond this, so a frozen card could never draw. */
const MAX_T = 1e6;

/**
 * Parses every URL parameter before anything is built. An absent parameter takes
 * its default (export 640x360, 24 fps, 6 s, time unset); a present one must be
 * well formed, so an empty value is an error, not a default.
 */
export function parseFlowParams(search: string): FlowParams {
  const q = new URLSearchParams(search);
  const tRaw = q.get("t");
  if (tRaw !== null && !(SECONDS.test(tRaw) && Number(tRaw) <= MAX_T))
    return fail("t", tRaw, `a number of seconds from 0 to ${String(MAX_T)}`);
  const wRaw = q.get("w") ?? "640";
  const hRaw = q.get("h") ?? "360";
  for (const [name, raw] of [
    ["w", wRaw],
    ["h", hRaw],
  ] as const) {
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || n < SIZE_MIN || n > SIZE_MAX || n % 2 !== 0)
      return fail(
        name,
        raw,
        `an even integer from ${String(SIZE_MIN)} to ${String(SIZE_MAX)}`,
      );
  }
  const fpsRaw = q.get("fps") ?? "24";
  if (!/^\d+$/.test(fpsRaw) || Number(fpsRaw) < 1 || Number(fpsRaw) > MAX_FPS)
    return fail("fps", fpsRaw, `an integer from 1 to ${String(MAX_FPS)}`);
  const durRaw = q.get("duration") ?? "6";
  if (
    !SECONDS.test(durRaw) ||
    !(Number(durRaw) > 0) ||
    Number(durRaw) > MAX_DURATION
  )
    return fail(
      "duration",
      durRaw,
      `a number of seconds above 0, up to ${String(MAX_DURATION)}`,
    );
  return {
    ok: true,
    t: tRaw === null ? null : Number(tRaw),
    w: Number(wRaw),
    h: Number(hRaw),
    fps: Number(fpsRaw),
    duration: Number(durRaw),
  };
}
