import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Cli from "../../scripts/cli.ts";
import { runScript } from "./harness.ts";

const SCRIPT = fileURLToPath(
  new URL("../../scripts/captions.ts", import.meta.url),
);
const QUICKSTART_TIMING = "../../src/videos/quickstart/timing.ts";

// motion/ is a temp tree (out/ is scratch); the captions are the real quickstart ones.
const h = vi.hoisted(() => ({ motion: "" }));
vi.mock("../../scripts/cli.ts", async (original) => ({
  ...(await original<typeof Cli>()),
  get MOTION() {
    return h.motion;
  },
}));

let tmp: string;
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "captions-")));
  h.motion = tmp;
});
afterEach(() => {
  vi.doUnmock(QUICKSTART_TIMING);
  rmSync(tmp, { recursive: true, force: true });
});

describe("scripts/captions.ts", () => {
  it("writes out/<video>/<video>.vtt from the timing file's captions and prints its path", async () => {
    const r = await runScript(SCRIPT, ["quickstart"]);
    expect(r.code).toBe(0);
    const out = join(tmp, "out/quickstart/quickstart.vtt");
    expect(r.out).toBe(out);
    const vtt = readFileSync(out, "utf8");
    expect(vtt.startsWith("WEBVTT\n\n00:00:00.000 --> 00:00:04.000\n")).toBe(
      true,
    );
    expect(vtt).toContain("00:00:57.000 --> 00:01:00.000\n");
    expect(vtt.endsWith("\n")).toBe(true);
  });

  it("writes the same bytes on a second run", async () => {
    await runScript(SCRIPT, ["quickstart"]);
    const first = readFileSync(join(tmp, "out/quickstart/quickstart.vtt"));
    await runScript(SCRIPT, ["quickstart"]);
    expect(readFileSync(join(tmp, "out/quickstart/quickstart.vtt"))).toEqual(
      first,
    );
  });

  it("exits 1, writing nothing, for a video whose timing has no captions", async () => {
    const r = await runScript(SCRIPT, ["pipeline-proof"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("exports no CAPTIONS");
    expect(existsSync(join(tmp, "out"))).toBe(false);
  });

  it("exits 1 naming the cue when the captions overlap, writing nothing", async () => {
    vi.doMock(QUICKSTART_TIMING, () => ({
      TIMING: { fps: 30 },
      CAPTIONS: [
        { start: 0, end: 60, text: "a" },
        { start: 30, end: 90, text: "b" },
      ],
    }));
    const r = await runScript(SCRIPT, ["quickstart"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("captions of quickstart: cue 2: starts at 1 s");
    expect(existsSync(join(tmp, "out"))).toBe(false);
  });

  it.each([
    [[], "expected 1 argument(s), got 0"],
    [["a", "b"], "expected 1 argument(s), got 2"],
    [["Bad_Name"], "a video name"],
  ])("exits 1 with the usage line for %j", async (argv, message) => {
    const r = await runScript(SCRIPT, argv);
    expect(r.code).toBe(1);
    expect(r.err).toContain(message);
    expect(r.err).toContain("usage: node scripts/captions.ts <video>");
  });

  it("fails on a video that has no timing file", async () => {
    await expect(runScript(SCRIPT, ["no-such-video"])).rejects.toThrow();
  });
});
