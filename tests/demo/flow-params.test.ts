import { describe, expect, it } from "vitest";

import { parseFlowParams } from "../../demo/flow-params.js";

const DEFAULTS = { ok: true, t: null, w: 640, h: 360, fps: 24, duration: 6 };

describe("flow page URL parameters", () => {
  it("uses the documented defaults when absent", () => {
    expect(parseFlowParams("")).toEqual(DEFAULTS);
    expect(parseFlowParams("?unrelated=1")).toEqual(DEFAULTS);
  });

  it("accepts well-formed values", () => {
    expect(parseFlowParams("?t=2.5&w=1280&h=720&fps=60&duration=12.5")).toEqual(
      { ok: true, t: 2.5, w: 1280, h: 720, fps: 60, duration: 12.5 },
    );
    expect(parseFlowParams("?t=0")).toMatchObject({ ok: true, t: 0 });
    expect(parseFlowParams("?t=.5")).toMatchObject({ ok: true, t: 0.5 });
    expect(parseFlowParams("?t=3.")).toMatchObject({ ok: true, t: 3 });
    expect(parseFlowParams("?t=1000000")).toMatchObject({ t: 1e6 });
    expect(parseFlowParams("?w=16&h=4096")).toMatchObject({ w: 16, h: 4096 });
    expect(parseFlowParams("?fps=1&duration=60")).toMatchObject({
      fps: 1,
      duration: 60,
    });
    expect(parseFlowParams("?duration=.25")).toMatchObject({ duration: 0.25 });
  });

  it.each([
    [
      "?t=abc",
      "Invalid ?t=abc: expected a number of seconds from 0 to 1000000",
    ],
    ["?t=-1", "Invalid ?t=-1: expected a number of seconds from 0 to 1000000"],
    ["?t=", "Invalid ?t=: expected a number of seconds from 0 to 1000000"],
    [
      "?t=1e3",
      "Invalid ?t=1e3: expected a number of seconds from 0 to 1000000",
    ],
    [
      "?t=1000001",
      "Invalid ?t=1000001: expected a number of seconds from 0 to 1000000",
    ],
    [`?t=${"9".repeat(400)}`, /^Invalid \?t=9+: expected a number/],
    ["?w=", "Invalid ?w=: expected an even integer from 16 to 4096"],
    ["?w=abc", "Invalid ?w=abc: expected an even integer from 16 to 4096"],
    ["?w=641", "Invalid ?w=641: expected an even integer from 16 to 4096"],
    ["?w=14", "Invalid ?w=14: expected an even integer from 16 to 4096"],
    ["?w=4098", "Invalid ?w=4098: expected an even integer from 16 to 4096"],
    ["?w=-640", "Invalid ?w=-640: expected an even integer from 16 to 4096"],
    ["?w=640.5", "Invalid ?w=640.5: expected an even integer from 16 to 4096"],
    ["?h=359", "Invalid ?h=359: expected an even integer from 16 to 4096"],
    ["?h=0", "Invalid ?h=0: expected an even integer from 16 to 4096"],
    ["?fps=0", "Invalid ?fps=0: expected an integer from 1 to 60"],
    ["?fps=61", "Invalid ?fps=61: expected an integer from 1 to 60"],
    ["?fps=1.5", "Invalid ?fps=1.5: expected an integer from 1 to 60"],
    ["?fps=", "Invalid ?fps=: expected an integer from 1 to 60"],
    ["?fps=fast", "Invalid ?fps=fast: expected an integer from 1 to 60"],
    [
      "?duration=0",
      "Invalid ?duration=0: expected a number of seconds above 0, up to 60",
    ],
    [
      "?duration=60.1",
      "Invalid ?duration=60.1: expected a number of seconds above 0, up to 60",
    ],
    [
      "?duration=",
      "Invalid ?duration=: expected a number of seconds above 0, up to 60",
    ],
    [
      "?duration=-2",
      "Invalid ?duration=-2: expected a number of seconds above 0, up to 60",
    ],
    [
      "?duration=0.0",
      "Invalid ?duration=0.0: expected a number of seconds above 0, up to 60",
    ],
  ])("rejects %s", (search, error) => {
    const result = parseFlowParams(search);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      if (typeof error === "string") expect(result.error).toBe(error);
      else expect(result.error).toMatch(error);
    }
  });

  it("reports the first bad parameter in t, w, h, fps, duration order", () => {
    const r = parseFlowParams("?duration=0&fps=0&h=1&w=1&t=x");
    expect(r).toEqual({
      ok: false,
      error: "Invalid ?t=x: expected a number of seconds from 0 to 1000000",
    });
    expect(parseFlowParams("?duration=0&fps=0")).toMatchObject({
      error: expect.stringContaining("?fps=0") as string,
    });
  });
});
