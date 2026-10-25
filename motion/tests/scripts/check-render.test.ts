import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { SilentAudioError, type Loudness } from "../../src/lib/loudness.ts";
import { runScript } from "./harness.ts";

const SCRIPT = fileURLToPath(
  new URL("../../scripts/check-render.ts", import.meta.url),
);

// ffprobe and ffmpeg are stand-ins; the timing it compares against is the real
// pipeline-proof one (1920x1080, 30 fps, 180 frames, 6 s).
const h = vi.hoisted(() => ({ ffprobe: vi.fn(), measure: vi.fn() }));
vi.mock("../../scripts/ffmpeg.ts", () => ({
  ffprobe: h.ffprobe,
  measureLoudness: h.measure,
}));

const probeJson = (audio: boolean, frames = "180"): string =>
  JSON.stringify({
    streams: [
      {
        codec_type: "video",
        width: 1920,
        height: 1080,
        r_frame_rate: "30/1",
        nb_frames: frames,
        duration: "6.000000",
      },
      ...(audio
        ? [{ codec_type: "audio", duration: "6.010000", sample_rate: "48000" }]
        : []),
    ],
  });
const GOOD: Loudness = { integrated: -16.2, truePeak: -2, lra: 3 };

beforeEach(() => {
  h.ffprobe.mockReset();
  h.measure.mockReset();
  h.ffprobe.mockReturnValue({ status: 0, stdout: probeJson(true), stderr: "" });
  h.measure.mockReturnValue(GOOD);
});

const report = (out: string) =>
  JSON.parse(out) as {
    file: string;
    video: string;
    probe: unknown;
    loudness: unknown;
    problems: string[];
  };

describe("scripts/check-render.ts", () => {
  it("reports the probe and the loudness of a good render, indented, and exits 0", async () => {
    const r = await runScript(SCRIPT, ["a.mp4", "pipeline-proof"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('\n  "video": "pipeline-proof"');
    expect(report(r.out)).toMatchObject({
      file: resolve("a.mp4"),
      video: "pipeline-proof",
      probe: { width: 1920, height: 1080, fps: 30, frames: 180 },
      loudness: GOOD,
      problems: [],
    });
    // ffprobe and ffmpeg get the absolute path: they run from motion/.
    expect(h.ffprobe.mock.calls[0]?.[0]).toContain(resolve("a.mp4"));
    expect(h.measure).toHaveBeenCalledWith(resolve("a.mp4"));
  });

  it("prints one line with --json", async () => {
    const r = await runScript(SCRIPT, ["--json", "a.mp4", "pipeline-proof"]);
    expect(r.code).toBe(0);
    expect(r.out.split("\n")).toHaveLength(1);
    expect(report(r.out).problems).toEqual([]);
  });

  it("names every problem of a picture that does not match its timing, and exits 1", async () => {
    h.ffprobe.mockReturnValue({
      status: 0,
      stdout: probeJson(true, "179"),
      stderr: "",
    });
    const r = await runScript(SCRIPT, ["a.mp4", "pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(report(r.out).problems).toEqual(["frames 179, expected 180"]);
  });

  it("adds the loudness problems of a render that is too quiet and too hot", async () => {
    h.measure.mockReturnValue({ integrated: -22, truePeak: -0.2, lra: 3 });
    const r = await runScript(SCRIPT, ["a.mp4", "pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(report(r.out).problems).toEqual([
      expect.stringContaining("integrated loudness -22 LUFS"),
      expect.stringContaining("true peak -0.2 dBTP"),
    ]);
  });

  it("says there is no audio track, and measures nothing, for a silent file", async () => {
    h.ffprobe.mockReturnValue({
      status: 0,
      stdout: probeJson(false),
      stderr: "",
    });
    const r = await runScript(SCRIPT, ["a.mp4", "pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(report(r.out)).toMatchObject({
      loudness: null,
      problems: ["no audio track"],
    });
    expect(h.measure).not.toHaveBeenCalled();
  });

  it("names a silent track as a problem, not a crash", async () => {
    h.measure.mockImplementation(() => {
      throw new SilentAudioError();
    });
    const r = await runScript(SCRIPT, ["a.mp4", "pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(report(r.out).problems).toEqual([
      expect.stringContaining("audio is silent"),
    ]);
  });

  it.each([
    [
      new Error("ffmpeg exited 1 measuring x\nmore"),
      "ffmpeg exited 1 measuring x",
    ],
    ["plain string", "plain string"],
  ])(
    "names a failed loudness measurement (%s) by its first line",
    async (thrown, line) => {
      h.measure.mockImplementation(() => {
        throw thrown as Error; // a string too: the script must cope
      });
      const r = await runScript(SCRIPT, ["a.mp4", "pipeline-proof"]);
      expect(r.code).toBe(1);
      expect(report(r.out).problems).toEqual([
        `cannot measure the loudness of ${resolve("a.mp4")}: ${line}`,
      ]);
    },
  );

  it("names a video with no timing, with exit 1 and no stack", async () => {
    const r = await runScript(SCRIPT, ["a.mp4", "no-such-video"]);
    expect(r.code).toBe(1);
    expect(report(r.out)).toMatchObject({ probe: null, loudness: null });
    expect(report(r.out).problems[0]).toMatch(
      /^cannot load the timing of video no-such-video: /,
    );
    expect(r.err).toBe("");
    expect(h.ffprobe).not.toHaveBeenCalled();
  });

  it.each([
    [
      { status: 1, stdout: "", stderr: "a.mp4: No such file\nsecond line" },
      "No such file",
    ],
    [{ status: 4, stdout: "", stderr: "  \n" }, "ffprobe exited 4"],
  ])("names a file ffprobe cannot read (%j)", async (answer, why) => {
    h.ffprobe.mockReturnValue(answer);
    const r = await runScript(SCRIPT, ["a.mp4", "pipeline-proof"]);
    expect(r.code).toBe(1);
    const [problem] = report(r.out).problems;
    expect(problem).toContain(`cannot read ${resolve("a.mp4")}: `);
    expect(problem).toContain(why);
    expect(problem).not.toContain("second line");
  });

  it("names an unreadable probe", async () => {
    h.ffprobe.mockReturnValue({ status: 0, stdout: "not json", stderr: "" });
    const r = await runScript(SCRIPT, ["a.mp4", "pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(report(r.out).problems).toEqual([
      expect.stringMatching(
        /^cannot read .*a\.mp4: probe: ffprobe output is not JSON/,
      ),
    ]);
  });

  it.each([
    [["pipeline-proof"], "expected 2 argument(s), got 1"],
    [
      ["a.mp4", "Bad_Name"],
      'a video name (lower-case letters and digits joined by single hyphens) is required, got "Bad_Name"',
    ],
    [["--jsn", "a.mp4", "pipeline-proof"], "Unknown option '--jsn'"],
  ])("exits 1 with the usage line for %j", async (argv, message) => {
    const r = await runScript(SCRIPT, argv);
    expect(r.code).toBe(1);
    expect(r.err).toContain(message);
    expect(r.err).toContain(
      "usage: node scripts/check-render.ts <file.mp4> <video> [--json]",
    );
    expect(h.ffprobe).not.toHaveBeenCalled();
  });
});
