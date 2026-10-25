/** WebVTT captions for a video, as pure functions of the cues in its timing file. */
export interface Cue {
  /** Seconds. */
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const finite = (seconds: number): boolean =>
  Number.isFinite(seconds) && seconds >= 0;

/** `HH:MM:SS.mmm`, rounded to the millisecond (a 0.9996 s rounds up through the second, minute and hour). */
export function formatTimestamp(seconds: number): string {
  if (!finite(seconds))
    throw new Error(
      `time must be a finite number of seconds >= 0, got ${String(seconds)}`,
    );
  const ms = Math.round(seconds * 1000);
  const two = (n: number): string => String(n).padStart(2, "0");
  return `${two(Math.floor(ms / 3_600_000))}:${two(Math.floor(ms / 60_000) % 60)}:${two(Math.floor(ms / 1000) % 60)}.${String(ms % 1000).padStart(3, "0")}`;
}

/** Throws a message naming the first cue (1-based) that is out of order, overlaps the one before, is empty or would break the file format. */
export function validateCues(cues: readonly Cue[]): void {
  let previousEnd = 0;
  cues.forEach((c, i) => {
    const at = `cue ${String(i + 1)}`;
    for (const t of [c.start, c.end])
      if (!finite(t))
        throw new Error(
          `${at}: time must be a finite number of seconds >= 0, got ${String(t)}`,
        );
    if (c.end <= c.start)
      throw new Error(
        `${at}: ends at ${String(c.end)} s, not after its start ${String(c.start)} s`,
      );
    if (c.start < previousEnd)
      throw new Error(
        `${at}: starts at ${String(c.start)} s, before cue ${String(i)} ends at ${String(previousEnd)} s`,
      );
    if (c.text.trim() === "") throw new Error(`${at}: the text is empty`);
    if (/\n\s*\n/.test(c.text.trim()))
      throw new Error(`${at}: the text has a blank line`);
    if (c.text.includes("-->"))
      throw new Error(`${at}: the text contains "-->"`);
    previousEnd = c.end;
  });
}

/** The WebVTT file for `cues` (validated first): the header, then one block per cue. */
export function formatVtt(cues: readonly Cue[]): string {
  validateCues(cues);
  const blocks = cues.map(
    (c) =>
      `${formatTimestamp(c.start)} --> ${formatTimestamp(c.end)}\n${c.text
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .join("\n")}\n`,
  );
  return ["WEBVTT\n", ...blocks].join("\n");
}

/** Cues in seconds from cues in frames. */
export function cuesFromFrames(
  frames: readonly { start: number; end: number; text: string }[],
  fps: number,
): Cue[] {
  if (!(fps > 0) || !Number.isFinite(fps))
    throw new Error(`fps must be a positive number, got ${String(fps)}`);
  return frames.map((f) => ({
    start: f.start / fps,
    end: f.end / fps,
    text: f.text,
  }));
}
