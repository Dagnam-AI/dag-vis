import { describe, expect, it } from "vitest";

import { checkSync, parseProbe } from "../../src/lib/probe.ts";

const probe = (over: Record<string, unknown> = {}, audio = true): string =>
  JSON.stringify({
    streams: [
      {
        codec_type: "video",
        width: 1920,
        height: 1080,
        r_frame_rate: "30/1",
        nb_frames: "180",
        duration: "6.000000",
        ...over,
      },
      ...(audio
        ? [{ codec_type: "audio", duration: "6.021000", sample_rate: "48000" }]
        : []),
    ],
    format: {},
  });

describe("parseProbe", () => {
  it("reads size, fps, frame count and both durations", () => {
    expect(parseProbe(probe())).toEqual({
      width: 1920,
      height: 1080,
      fps: 30,
      frames: 180,
      videoDuration: 6,
      audioDuration: 6.021,
      audioSampleRate: 48000,
    });
    expect(parseProbe(probe({}, false)).audioDuration).toBeNull();
    expect(parseProbe(probe({}, false)).audioSampleRate).toBeNull();
    expect(parseProbe(probe({ r_frame_rate: "30000/1001" })).fps).toBeCloseTo(
      29.97,
      2,
    );
  });
  it("fails on a missing stream or field or an odd frame rate", () => {
    expect(() => parseProbe(JSON.stringify({ streams: [] }))).toThrow(
      /no video stream/,
    );
    expect(() => parseProbe(probe({ nb_frames: undefined }))).toThrow(
      /nb_frames/,
    );
    expect(() => parseProbe(probe({ r_frame_rate: "30" }))).toThrow(
      /r_frame_rate/,
    );
  });
  it("refuses what ffprobe could not determine instead of passing NaN on", () => {
    expect(() => parseProbe(probe({ r_frame_rate: "0/0" }))).toThrow(
      /r_frame_rate is not a usable fraction: 0\/0/,
    );
    expect(() => parseProbe(probe({ r_frame_rate: "30/0" }))).toThrow(
      /r_frame_rate/,
    );
    expect(() => parseProbe(probe({ duration: "N/A" }))).toThrow(
      /video duration is not a non-negative number: N\/A/,
    );
    expect(() => parseProbe(probe({ nb_frames: "N/A" }))).toThrow(/nb_frames/);
    expect(() => parseProbe(probe({ nb_frames: "" }))).toThrow(/nb_frames/);
    expect(() => parseProbe(probe({ width: "N/A" }))).toThrow(/width/);
    expect(() => parseProbe(probe({ duration: "-1" }))).toThrow(/duration/);
    const audioNA = probe().replace('"6.021000"', '"N/A"');
    expect(() => parseProbe(audioNA)).toThrow(/audio duration/);
    const rateNA = probe().replace('"48000"', '"N/A"');
    expect(() => parseProbe(rateNA)).toThrow(/audio sample_rate/);
  });
});

describe("checkSync", () => {
  const expected = { width: 1920, height: 1080, fps: 30, frames: 180 };
  it("passes a matching file with audio within a frame + 50 ms", () => {
    expect(checkSync(parseProbe(probe()), expected)).toEqual([]);
  });
  it("names every mismatch", () => {
    const p = parseProbe(
      probe({ width: 1280, nb_frames: "179", r_frame_rate: "25/1" }, false),
    );
    expect(checkSync(p, expected)).toEqual([
      "size 1280×1080, expected 1920×1080",
      "fps 25, expected 30",
      "frames 179, expected 180",
      "no audio track",
    ]);
    expect(
      checkSync(
        parseProbe(probe({}, true).replace('"6.021000"', '"6.5"')),
        expected,
      ),
    ).toEqual(["audio 6.5s vs video 6s (tolerance 0.083s)"]);
  });
  it("accepts a difference equal to the tolerance and refuses anything beyond", () => {
    const at = (audio: string, fps: string, tolerant: number) => {
      const p = parseProbe(
        probe({ r_frame_rate: fps, duration: "4" }).replace(
          '"6.021000"',
          `"${audio}"`,
        ),
      );
      return checkSync(p, { ...expected, fps: tolerant, frames: 180 });
    };
    // 20 fps: one frame + 50 ms is exactly 0.1 s.
    expect(at("4.1", "20/1", 20)).toEqual([]);
    expect(at("3.9", "20/1", 20)).toEqual([]);
    expect(at("4.11", "20/1", 20)).toHaveLength(1);
    // 30 fps, as ffprobe prints it (six decimals): 1/30 + 0.05 = 0.083333...
    const sync = (audio: string) =>
      checkSync(
        parseProbe(probe().replace('"6.021000"', `"${audio}"`)),
        expected,
      );
    expect(sync("6.083333")).toEqual([]);
    expect(sync("5.916667")).toEqual([]);
    expect(sync("6.084000")).toHaveLength(1);
  });
});
