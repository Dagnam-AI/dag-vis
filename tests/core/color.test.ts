import { describe, expect, it } from "vitest";

import {
  mix,
  parseColor,
  ramp,
  toCss,
  toHex,
  toVec3,
  withAlpha,
} from "../../src/core/color.js";
import { VisError } from "../../src/core/errors.js";

describe("parseColor", () => {
  it.each([
    ["#f00", { r: 1, g: 0, b: 0, a: 1 }],
    ["#ff0000", { r: 1, g: 0, b: 0, a: 1 }],
    ["#ff000080", { r: 1, g: 0, b: 0, a: 128 / 255 }],
    ["#EF4444", { r: 239 / 255, g: 68 / 255, b: 68 / 255, a: 1 }],
    ["rgb(255, 0, 0)", { r: 1, g: 0, b: 0, a: 1 }],
    ["rgb(255 0 0)", { r: 1, g: 0, b: 0, a: 1 }],
    ["rgba(0, 0, 255, 0.5)", { r: 0, g: 0, b: 1, a: 0.5 }],
    ["rgb(0 0 255 / 50%)", { r: 0, g: 0, b: 1, a: 0.5 }],
    [" #fff ", { r: 1, g: 1, b: 1, a: 1 }],
  ])("parses %s", (input, expected) => {
    const c = parseColor(input);
    expect(c.r).toBeCloseTo(expected.r, 6);
    expect(c.g).toBeCloseTo(expected.g, 6);
    expect(c.b).toBeCloseTo(expected.b, 6);
    expect(c.a).toBeCloseTo(expected.a, 6);
  });

  it("parses oklch() with percent or unit lightness and optional alpha", () => {
    const white = parseColor("oklch(100% 0 0)");
    expect(white.r).toBeCloseTo(1, 2);
    expect(white.g).toBeCloseTo(1, 2);
    expect(white.b).toBeCloseTo(1, 2);
    const black = parseColor("oklch(0 0 0)");
    expect(black.r).toBeCloseTo(0, 3);
    // sRGB pure red is oklch(0.6280 0.2577 29.23)
    const red = parseColor("oklch(62.8% 0.2577 29.23 / 0.5)");
    expect(red.r).toBeCloseTo(1, 1);
    expect(red.g).toBeCloseTo(0, 1);
    expect(red.b).toBeCloseTo(0, 1);
    expect(red.a).toBe(0.5);
    // the brand's dark accent must parse and be clearly red
    const accent = parseColor("oklch(52.768% 0.21534 29.097)");
    expect(accent.r).toBeGreaterThan(0.6);
    expect(accent.g).toBeLessThan(0.2);
  });

  it("parses percent rgb channels and a deg hue suffix", () => {
    expect(toHex(parseColor("rgb(100% 0% 50%)"))).toBe("#ff0080");
    const a = parseColor("oklch(50% 0.1 30deg)");
    const b = parseColor("oklch(50% 0.1 30)");
    expect(a).toEqual(b);
  });

  it.each([
    "rgb(0, 0, 0, 2)",
    "rgb(0 0 0 / x)",
    "oklch(50% 0.1 30 / -1)",
    "rgb(a, 0, 0)",
    "oklch(x 0.1 30)",
    "rgb(% % %)",
    "oklch(% 0 0)",
    "rgb(0 0 0 / %)",
    "rgb(0 0 0 /)",
    "oklch(50% 0.1 deg)",
    "rgb(0x10 0 0)",
    "rgb(1e999 0 0)",
    "oklch(50% 5% 30)",
    "rgb(0 0 0 / 0.5 / 0.2)",
    "rgb(1,,2,3)",
    "rgb(,1,2,3)",
    "rgb()",
  ])("rejects malformed channel or alpha in %j", (bad) => {
    expect(() => parseColor(bad)).toThrow(VisError);
    expect(() => parseColor(bad)).toThrow(bad);
  });

  it("clamps out-of-gamut oklch into 0..1", () => {
    const c = parseColor("oklch(90% 0.4 140)");
    for (const v of [c.r, c.g, c.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it.each([
    "",
    "red",
    "#ff",
    "#ggg",
    "rgb(1,2)",
    "rgb(300,0,0)",
    "oklch(1)",
    "hsl(0 0% 0%)",
    "#12345",
  ])("throws VisError naming the input on %j", (bad) => {
    expect(() => parseColor(bad)).toThrow(VisError);
    expect(() => parseColor(bad)).toThrow(bad === "" ? "empty" : bad);
  });
});

describe("conversions", () => {
  it("toHex round-trips and appends alpha only when < 1", () => {
    expect(toHex(parseColor("#ef4444"))).toBe("#ef4444");
    expect(toHex(parseColor("#ef444480"))).toBe("#ef444480");
    expect(toHex({ r: 1, g: 1, b: 1, a: 1 })).toBe("#ffffff");
  });

  it("toCss uses hex for opaque and rgba() for translucent", () => {
    expect(toCss(parseColor("#0a0a0a"))).toBe("#0a0a0a");
    expect(toCss({ r: 1, g: 0, b: 0, a: 0.25 })).toBe("rgba(255, 0, 0, 0.25)");
  });

  it("withAlpha replaces alpha and clamps", () => {
    expect(withAlpha(parseColor("#fff"), 0.5).a).toBe(0.5);
    expect(withAlpha(parseColor("#fff"), 7).a).toBe(1);
    expect(withAlpha(parseColor("#fff"), -1).a).toBe(0);
  });

  it("toVec3 returns 0..1 components for shaders", () => {
    expect(toVec3("#ff0080")).toEqual([1, 0, 128 / 255]);
  });
});

describe("mix / ramp (OKLab)", () => {
  const red = parseColor("#ff0000");
  const blue = parseColor("#0000ff");

  it("returns the endpoints at t=0 and t=1 and clamps t", () => {
    expect(toHex(mix(red, blue, 0))).toBe("#ff0000");
    expect(toHex(mix(red, blue, 1))).toBe("#0000ff");
    expect(toHex(mix(red, blue, -3))).toBe("#ff0000");
    expect(toHex(mix(red, blue, 3))).toBe("#0000ff");
  });

  it("mixes through OKLab, not naive sRGB (midpoint is not #800080)", () => {
    const mid = mix(red, blue, 0.5);
    expect(toHex(mid)).not.toBe("#800080");
    expect(mid.r).toBeGreaterThan(0.4);
    expect(mid.b).toBeGreaterThan(0.4);
  });

  it("matches Ottosson's published OKLab red/blue midpoint", () => {
    // Reference: published OKLab red (0.627955, 0.224863, 0.125846) and blue
    // (0.452014, -0.032457, -0.311528); the midpoint in Lab is
    // (0.5399845, 0.096203, -0.092841) = oklch(0.53998 0.13370 316.02),
    // which converts to sRGB (0.55044, 0.32562, 0.63650).
    const mid = mix(red, blue, 0.5);
    expect(mid.r).toBeCloseTo(0.55044, 4);
    expect(mid.g).toBeCloseTo(0.32562, 4);
    expect(mid.b).toBeCloseTo(0.6365, 4);
    const viaOklch = parseColor("oklch(0.53998 0.1337 316.02)");
    expect(mid.r).toBeCloseTo(viaOklch.r, 3);
    expect(mid.g).toBeCloseTo(viaOklch.g, 3);
    expect(mid.b).toBeCloseTo(viaOklch.b, 3);
  });

  it("treats NaN as 0 instead of emitting #NaNNaNNaN", () => {
    expect(toHex(mix(red, blue, Number.NaN))).toBe("#ff0000");
    expect(withAlpha(red, Number.NaN).a).toBe(0);
  });

  it("interpolates alpha linearly", () => {
    expect(mix(withAlpha(red, 0), withAlpha(blue, 1), 0.25).a).toBeCloseTo(
      0.25,
    );
  });

  it("ramp samples n colours across the stops, endpoints exact", () => {
    const r = ramp(["#ff0000", "#00ff00", "#0000ff"], 5);
    expect(r).toHaveLength(5);
    expect(toHex(r[0]!)).toBe("#ff0000");
    expect(toHex(r[2]!)).toBe("#00ff00");
    expect(toHex(r[4]!)).toBe("#0000ff");
  });

  it("ramp handles n=1 and rejects bad input", () => {
    expect(toHex(ramp(["#123456", "#654321"], 1)[0]!)).toBe("#123456");
    expect(() => ramp(["#fff"], 3)).toThrow(VisError);
    expect(() => ramp(["#fff", "#000"], 0)).toThrow(VisError);
  });
});

describe("public colour helpers reject wrong types with a VisError", () => {
  const red = { r: 1, g: 0, b: 0, a: 1 };
  const blue = { r: 0, g: 0, b: 1, a: 1 };

  it.each([null, undefined, 5, {}, [], true])(
    "parseColor and toVec3 reject %j, naming the colour",
    (bad) => {
      expect(() => parseColor(bad as never)).toThrow(VisError);
      expect(() => parseColor(bad as never)).toThrow(
        /^colour must be a string/,
      );
      expect(() => toVec3(bad as never)).toThrow(VisError);
    },
  );

  it.each([null, undefined, 5, "red", [], {}, { r: 1, g: 0, b: 0 }])(
    "toHex, toCss, withAlpha and mix reject the colour %j",
    (bad) => {
      expect(() => toHex(bad as never)).toThrow(VisError);
      expect(() => toCss(bad as never)).toThrow(VisError);
      expect(() => withAlpha(bad as never, 0.5)).toThrow(VisError);
      expect(() => mix(bad as never, blue, 0.5)).toThrow(/^mix a[ .]/);
      expect(() => mix(red, bad as never, 0.5)).toThrow(/^mix b[ .]/);
    },
  );

  it("names the bad channel", () => {
    expect(() => toCss({ ...red, g: "0" } as never)).toThrow(
      /colour\.g must be a number, got "0"/,
    );
    expect(() => toCss({ r: 0, g: 0, b: 0 } as never)).toThrow(
      /colour\.a must be a number, got undefined/,
    );
  });

  it("rejects a non-numeric t or alpha instead of returning junk", () => {
    expect(() => mix(red, blue, "0.5" as never)).toThrow(
      /^mix t must be a number/,
    );
    expect(() => mix(red, blue, null as never)).toThrow(VisError);
    expect(() => withAlpha(red, "1" as never)).toThrow(
      /^withAlpha alpha must be a number/,
    );
  });

  it("toCss never prints NaN: a NaN alpha counts as 0", () => {
    expect(toCss({ ...red, a: Number.NaN })).toBe("rgba(255, 0, 0, 0)");
  });

  it("ramp rejects a non-array stops, a non-integer n and an n over the cap", () => {
    for (const stops of [null, "ab", 5, {}])
      expect(() => ramp(stops as never, 3)).toThrow(/ramp\(\) stops/);
    for (const n of [null, "3", 1.5, Number.NaN, 0, -1])
      expect(() => ramp(["#000", "#fff"], n as never)).toThrow(
        /ramp\(\) needs an integer n/,
      );
    expect(ramp(["#000", "#fff"], 4096)).toHaveLength(4096);
    expect(() => ramp(["#000", "#fff"], 4097)).toThrow(VisError);
    expect(() => ramp(["#000", "#fff"], 1e9)).toThrow(/n.*4096/);
  });

  it("ramp names a bad stop", () => {
    expect(() => ramp(["#000", 5 as never], 3)).toThrow(VisError);
  });
});

describe("parseColor error messages stay short", () => {
  it("truncates the echoed value but still names its start", () => {
    const long = `nope${"x".repeat(5000)}`;
    let message = "";
    try {
      parseColor(long);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message.length).toBeLessThan(200);
    expect(message).toContain("invalid colour: nopexxx");
    for (const bad of [
      `rgb(${"1,".repeat(3000)})`,
      `rgb(${"9".repeat(5000)}, 0, 0)`,
      `oklch(${"1 ".repeat(3000)})`,
      `rgb(1, 2, 3 / ${"4 / ".repeat(3000)})`,
    ])
      expect(() => parseColor(bad)).toThrow(VisError);
    for (const bad of [
      `rgb(${"9".repeat(5000)}, 0, 0)`,
      `rgba(1, 2, 3, ${"7".repeat(5000)})`,
    ]) {
      try {
        parseColor(bad);
      } catch (e) {
        expect((e as Error).message.length).toBeLessThan(400);
      }
    }
  });
});
