import { describe, expect, it } from "vitest";

import { parseParams } from "../../demo/params.js";

const EFFECTS = ["dither", "pixel", "ribbon"];
const parse = (s: string) => parseParams(s, EFFECTS);

describe("demo URL parameters", () => {
  it("uses the documented defaults when absent", () => {
    expect(parse("")).toEqual({
      ok: true,
      t: null,
      seed: 1,
      effect: null,
      w: 320,
      h: 480,
    });
  });

  it("accepts well-formed values", () => {
    expect(parse("?t=2.5&seed=-7&effect=ribbon&w=200&h=4096")).toEqual({
      ok: true,
      t: 2.5,
      seed: -7,
      effect: "ribbon",
      w: 200,
      h: 4096,
    });
    expect(parse("?t=0")).toMatchObject({ ok: true, t: 0 });
    expect(parse("?t=.5")).toMatchObject({ ok: true, t: 0.5 });
    expect(parse("?t=3.")).toMatchObject({ ok: true, t: 3 });
    expect(parse("?w=16&h=16")).toMatchObject({ ok: true, w: 16, h: 16 });
  });

  it.each([
    ["?seed=abc", "Invalid ?seed=abc: expected an integer"],
    ["?seed=1.5", "Invalid ?seed=1.5: expected an integer"],
    ["?seed=", "Invalid ?seed=: expected an integer"],
    [
      "?seed=99999999999999999999",
      "Invalid ?seed=99999999999999999999: expected an integer",
    ],
    ["?t=NaN", "Invalid ?t=NaN: expected a number of seconds >= 0"],
    ["?t=-1", "Invalid ?t=-1: expected a number of seconds >= 0"],
    ["?t=", "Invalid ?t=: expected a number of seconds >= 0"],
    ["?t=Infinity", "Invalid ?t=Infinity: expected a number of seconds >= 0"],
    ["?w=-5", "Invalid ?w=-5: expected an integer from 16 to 4096"],
    ["?w=abc", "Invalid ?w=abc: expected an integer from 16 to 4096"],
    ["?w=15", "Invalid ?w=15: expected an integer from 16 to 4096"],
    ["?w=99999", "Invalid ?w=99999: expected an integer from 16 to 4096"],
    ["?w=3.5", "Invalid ?w=3.5: expected an integer from 16 to 4096"],
    ["?h=", "Invalid ?h=: expected an integer from 16 to 4096"],
    ["?h=4097", "Invalid ?h=4097: expected an integer from 16 to 4096"],
    [
      "?effect=nope",
      "Invalid ?effect=nope: expected one of dither, pixel, ribbon",
    ],
    ["?effect=", "Invalid ?effect=: expected one of dither, pixel, ribbon"],
  ])("rejects %s", (search, error) => {
    expect(parse(search)).toEqual({ ok: false, error });
  });
});
