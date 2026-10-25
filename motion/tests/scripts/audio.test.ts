import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Cli from "../../scripts/cli.ts";
import { SilentAudioError, type Loudness } from "../../src/lib/loudness.ts";
import { runScript } from "./harness.ts";

const SHARED = { shared: true };
const SCRIPT = fileURLToPath(
  new URL("../../scripts/audio.ts", import.meta.url),
);

// motion/ is a temp tree (public/generated/ is scratch); ffmpeg is a stand-in
// that "measures" the first pass at -30 LUFS, and the second as the test says.
// The bed is the real pipeline-proof one.
const h = vi.hoisted(() => ({ motion: "", measure: vi.fn() }));
vi.mock("../../scripts/cli.ts", async (original) => ({
  ...(await original<typeof Cli>()),
  get MOTION() {
    return h.motion;
  },
}));
vi.mock("../../scripts/ffmpeg.ts", () => ({ measureLoudness: h.measure }));

const BEFORE: Loudness = { integrated: -30, truePeak: -12, lra: 2 };
const OK: Loudness = { integrated: -16, truePeak: -3, lra: 2 };
let tmp: string;
let generated: string;
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "audio-")));
  h.motion = tmp;
  generated = join(tmp, "public/generated");
  h.measure.mockReset();
  h.measure.mockReturnValueOnce(BEFORE).mockReturnValue(OK);
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("scripts/audio.ts", () => {
  it("writes the normalised bed to public/generated/<video>.wav and leaves no work file", async () => {
    const r = await runScript(SCRIPT, ["pipeline-proof"], SHARED);
    expect(r.code).toBe(0);
    expect(readdirSync(generated)).toEqual(["pipeline-proof.wav"]);
    const wav = readFileSync(join(generated, "pipeline-proof.wav"));
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    // One loop at 48 kHz, 16-bit stereo.
    expect(wav.length).toBe(44 + 6 * 48000 * 4);
    expect(JSON.parse(r.out)).toMatchObject({
      video: "pipeline-proof",
      out: join(generated, "pipeline-proof.wav"),
      before: BEFORE,
      after: OK,
    });
    // The second measurement is of the file after the gain, not the first one again.
    expect(h.measure).toHaveBeenCalledTimes(2);
    expect(h.measure.mock.calls[1]?.[0]).toBe(
      join(generated, "pipeline-proof.work.wav"),
    );
  });

  it("removes an earlier bed first, so a failed run leaves no file to be muxed", async () => {
    mkdirSync(generated, { recursive: true });
    writeFileSync(join(generated, "pipeline-proof.wav"), "old");
    h.measure.mockReset();
    h.measure
      .mockReturnValueOnce(BEFORE)
      .mockReturnValue({ ...OK, truePeak: -1 });
    const r = await runScript(SCRIPT, ["pipeline-proof"], SHARED);
    expect(r.code).toBe(1);
    expect(readdirSync(generated)).toEqual([]);
    expect(r.err).toContain(
      "true peak -1 dBTP, the bed must be at or below -1.5",
    );
    expect(r.err).toContain(
      `Nothing was written to ${join(generated, "pipeline-proof.wav")}`,
    );
  });

  it("fails closed, naming the silence, when the bed has no level", async () => {
    h.measure.mockReset();
    h.measure.mockImplementation(() => {
      throw new SilentAudioError();
    });
    const r = await runScript(SCRIPT, ["pipeline-proof"], SHARED);
    expect(r.code).toBe(1);
    expect(r.err).toContain("audio is silent");
    expect(r.err).toContain("Nothing was written to");
    expect(existsSync(join(generated, "pipeline-proof.wav"))).toBe(false);
    expect(existsSync(join(generated, "pipeline-proof.work.wav"))).toBe(false);
  });

  it("lets any other error through, with the work file removed", async () => {
    h.measure.mockReset();
    h.measure.mockImplementation(() => {
      throw new Error("ffmpeg exited 1");
    });
    await expect(runScript(SCRIPT, ["pipeline-proof"], SHARED)).rejects.toThrow(
      "ffmpeg exited 1",
    );
    expect(readdirSync(generated)).toEqual([]);
  });

  it.each([
    [[], "expected 1 argument(s), got 0"],
    [["a", "b"], "expected 1 argument(s), got 2"],
    [["Bad_Name"], "a video name"],
  ])("exits 1 with the usage line for %j", async (argv, message) => {
    const r = await runScript(SCRIPT, argv);
    expect(r.code).toBe(1);
    expect(r.err).toContain(message);
    expect(r.err).toContain("usage: node scripts/audio.ts <video>");
    expect(h.measure).not.toHaveBeenCalled();
  });

  it("fails on a video that has no audio.ts", async () => {
    await expect(runScript(SCRIPT, ["no-such-video"])).rejects.toThrow();
    expect(existsSync(generated)).toBe(false);
  });
});
