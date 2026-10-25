import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { REMOTION_BIN } from "../../scripts/cli.ts";
import {
  LOUDNORM_ARGS,
  ffmpeg,
  ffprobe,
  measureLoudness,
} from "../../scripts/ffmpeg.ts";

// spawnSync is a stand-in: no ffmpeg runs here.
const h = vi.hoisted(() => ({
  spawn: vi.fn<(cmd: string, args: string[], options: object) => unknown>(),
}));
vi.mock("node:child_process", () => ({ spawnSync: h.spawn }));

const LOUDNORM = `[Parsed_loudnorm_0 @ 0x1]\n{ "input_i" : "-16.5", "input_tp" : "-2.0", "input_lra" : "3.1" }`;

beforeEach(() => {
  h.spawn.mockReset();
  vi.stubEnv("MOTION_FFMPEG", "");
  vi.stubEnv("MOTION_FFPROBE", "");
});

describe("ffmpeg / ffprobe", () => {
  it("spawn the local remotion bin by path, from motion/, with the arguments as an array", () => {
    h.spawn.mockReturnValue({ status: 0, stdout: "out", stderr: "err" });
    expect(ffmpeg(["-version"])).toEqual({
      status: 0,
      stdout: "out",
      stderr: "err",
    });
    ffprobe(["-version"]);
    expect(h.spawn.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [REMOTION_BIN, ["ffmpeg", "-version"]],
      [REMOTION_BIN, ["ffprobe", "-version"]],
    ]);
    expect(h.spawn.mock.calls[0]?.[2]).toMatchObject({
      cwd: resolve(REMOTION_BIN, "../../.."),
      encoding: "utf8",
    });
  });

  it("use a system build when MOTION_FFMPEG / MOTION_FFPROBE name one", () => {
    vi.stubEnv("MOTION_FFMPEG", "/usr/bin/ffmpeg");
    vi.stubEnv("MOTION_FFPROBE", "/usr/bin/ffprobe");
    h.spawn.mockReturnValue({ status: 0, stdout: "", stderr: "" });
    ffmpeg(["-x"]);
    ffprobe(["-y"]);
    expect(h.spawn.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ["/usr/bin/ffmpeg", ["-x"]],
      ["/usr/bin/ffprobe", ["-y"]],
    ]);
  });

  it("report status 1 when the process was killed (no status), and throw a spawn error", () => {
    h.spawn.mockReturnValueOnce({ status: null, stdout: "", stderr: "" });
    expect(ffmpeg([]).status).toBe(1);
    h.spawn.mockReturnValueOnce({ error: new Error("spawn ENOENT") });
    expect(() => ffprobe([])).toThrow("spawn ENOENT");
  });
});

describe("measureLoudness", () => {
  it("measures audio only with loudnorm in JSON mode and parses its report from stderr", () => {
    h.spawn.mockReturnValue({ status: 0, stdout: "", stderr: LOUDNORM });
    expect(measureLoudness("/x/a.wav")).toEqual({
      integrated: -16.5,
      truePeak: -2,
      lra: 3.1,
    });
    const args = h.spawn.mock.calls[0]![1];
    expect(args).toEqual(["ffmpeg", ...LOUDNORM_ARGS("/x/a.wav")]);
    expect(args).toContain("-vn");
    expect(args.join(" ")).toContain(
      "loudnorm=I=-16:TP=-1:LRA=11:print_format=json",
    );
  });

  it("names the file, the exit status and the end of stderr when ffmpeg fails", () => {
    h.spawn.mockReturnValue({
      status: 2,
      stdout: "",
      stderr: `${"x".repeat(900)}END`,
    });
    expect(() => measureLoudness("/x/a.wav")).toThrow(
      /^ffmpeg exited 2 measuring \/x\/a\.wav: x+END$/,
    );
    try {
      measureLoudness("/x/a.wav");
    } catch (e) {
      expect((e as Error).message.length).toBeLessThan(600);
    }
  });
});
