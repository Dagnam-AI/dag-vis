import { describe, expect, it } from "vitest";

import { toHex } from "../../src/core/color.js";
import { VisError } from "../../src/core/errors.js";
import {
  BLENDS,
  cssStops,
  normalizeStops,
  phaseShift,
  repeatSpan,
  sampleStops,
  svgStops,
} from "../../src/gradient/stops.js";

describe("normalizeStops", () => {
  it("spaces string stops evenly", () => {
    const s = normalizeStops(["#000", "#888", "#fff"]);
    expect(s.map((x) => x.at)).toEqual([0, 0.5, 1]);
    expect(toHex(s[1]!.color)).toBe("#888888");
  });

  it("keeps explicit positions and applies per-stop opacity", () => {
    const s = normalizeStops([
      { color: "#f00", at: 0.2, opacity: 0.5 },
      { color: "#00f", at: 0.9 },
    ]);
    expect(s.map((x) => x.at)).toEqual([0.2, 0.9]);
    expect(s[0]!.color.a).toBe(0.5);
    expect(s[1]!.color.a).toBe(1);
  });

  it("mirrors the stops when reversed", () => {
    const s = normalizeStops(
      [
        { color: "#f00", at: 0.2 },
        { color: "#00f", at: 0.9 },
      ],
      true,
    );
    expect(s.map((x) => [toHex(x.color), x.at])).toEqual([
      ["#0000ff", 0.1],
      ["#ff0000", 0.8],
    ]);
  });

  it.each([
    [[]],
    [["#fff"]],
    [[{ color: "#fff", at: 0 }, "#000"]],
    [
      [
        { color: "#fff", at: 0.5 },
        { color: "#000", at: 0.2 },
      ],
    ],
    [
      [
        { color: "#fff", at: -0.1 },
        { color: "#000", at: 1 },
      ],
    ],
    [
      [
        { color: "#fff", at: 0, opacity: 2 },
        { color: "#000", at: 1 },
      ],
    ],
    [["#fff", "nope"]],
  ])("rejects %j", (stops) => {
    expect(() => normalizeStops(stops as never)).toThrow(VisError);
  });
});

describe("normalizeStops input validation", () => {
  it.each([[undefined], [null], ["#000"], [42], [{}]])(
    "rejects non-array stops %j",
    (stops) => {
      expect(() => normalizeStops(stops as never)).toThrow(VisError);
    },
  );

  it.each([[[null, "#000"]], [[{ at: 0 }, "#000"]], [[7, "#000"]]])(
    "rejects a malformed stop entry in %j",
    (stops) => {
      expect(() => normalizeStops(stops as never)).toThrow(VisError);
    },
  );
});

describe("repeatSpan / phaseShift", () => {
  it("rescales the stop span to 0..1", () => {
    const r = repeatSpan(
      normalizeStops([
        { color: "#000", at: 0.2 },
        { color: "#fff", at: 0.4 },
      ]),
    );
    expect([r.from, r.to]).toEqual([0.2, 0.4]);
    expect(r.unit.map((s) => s.at)).toEqual([0, 1]);
  });

  it("rejects a zero-width span", () => {
    expect(() =>
      repeatSpan(
        normalizeStops([
          { color: "#000", at: 1 },
          { color: "#fff", at: 1 },
        ]),
      ),
    ).toThrow(VisError);
  });

  it("leaves the period alone at offset 0 and rotates it otherwise", () => {
    const unit = repeatSpan(normalizeStops(["#000000", "#ffffff"])).unit;
    expect(phaseShift(unit, 0).map((s) => s.at)).toEqual([0, 1]);
    expect(phaseShift(unit, 1).map((s) => s.at)).toEqual([0, 1]);
    const shifted = phaseShift(unit, 0.25);
    // starts 25% in (grey 0.25), ramps to white at 0.75, hard edge back to black, ends grey
    expect(shifted.map((s) => s.at)).toEqual([0, 0.75, 0.75, 1]);
    expect(shifted.map((s) => toHex(s.color))).toEqual([
      "#404040",
      "#ffffff",
      "#000000",
      "#404040",
    ]);
  });

  it("negative offsets wrap into 0..1", () => {
    const unit = repeatSpan(normalizeStops(["#000000", "#ffffff"])).unit;
    expect(phaseShift(unit, -0.75).map((s) => s.at)).toEqual([
      0, 0.75, 0.75, 1,
    ]);
  });
});

describe("sampleStops", () => {
  const s = normalizeStops([
    { color: "#000000", at: 0.25 },
    { color: "#ffffff", at: 0.75 },
  ]);

  it("clamps outside the stop range and interpolates inside", () => {
    expect(toHex(sampleStops(s, 0))).toBe("#000000");
    expect(toHex(sampleStops(s, 1))).toBe("#ffffff");
    const mid = sampleStops(s, 0.5);
    expect(mid.r).toBeGreaterThan(0.3);
    expect(mid.r).toBeLessThan(0.7);
  });

  it("wraps when repeating (period = last.at - first.at = 0.5)", () => {
    expect(toHex(sampleStops(s, 0.75, true))).toBe("#000000"); // 0.75 wraps to 0.25
    expect(sampleStops(s, 1.0, true).r).toBeGreaterThan(0.3); // 1.0 wraps to 0.5: mid grey
    expect(sampleStops(s, 1.0, true).r).toBeLessThan(0.7);
    expect(sampleStops(s, 0.7499, true).r).toBeGreaterThan(0.95); // just before the wrap: ~white
  });

  it("treats two stops at the same position as a hard edge", () => {
    const hard = normalizeStops([
      { color: "#000000", at: 0.5 },
      { color: "#ffffff", at: 0.5 },
    ]);
    expect(toHex(sampleStops(hard, 0.5))).toBe("#ffffff");
    expect(toHex(sampleStops(hard, 0.5, true))).toBe("#000000"); // zero span: first stop
  });

  it("walks past middle stops into the last segment", () => {
    const three = normalizeStops(["#000000", "#ffffff", "#000000"]);
    expect(toHex(sampleStops(three, 0.5))).toBe("#ffffff");
    const late = sampleStops(three, 0.75);
    expect(late.r).toBeGreaterThan(0.3);
    expect(late.r).toBeLessThan(0.7);
  });

  it("lets the later stop win at every duplicate position (middle and triple)", () => {
    const mid = normalizeStops([
      { color: "#000000", at: 0 },
      { color: "#ff0000", at: 0.5 },
      { color: "#00ff00", at: 0.5 },
      { color: "#ffffff", at: 1 },
    ]);
    expect(toHex(sampleStops(mid, 0.5))).toBe("#00ff00");
    const triple = normalizeStops([
      { color: "#000000", at: 0 },
      { color: "#ff0000", at: 0.5 },
      { color: "#00ff00", at: 0.5 },
      { color: "#0000ff", at: 0.5 },
      { color: "#ffffff", at: 1 },
    ]);
    expect(toHex(sampleStops(triple, 0.5))).toBe("#0000ff");
    expect(toHex(sampleStops(triple, 0.4999))).not.toBe("#0000ff");
  });

  it("interpolates in sRGB, not OKLab", () => {
    const m = sampleStops(normalizeStops(["#f00", "#0f0"]), 0.5);
    expect(toHex(m)).toBe("#808000");
    const a = sampleStops(
      normalizeStops([
        { color: "#000", at: 0, opacity: 0 },
        { color: "#000", at: 1, opacity: 1 },
      ]),
      0.25,
    );
    expect(a.a).toBeCloseTo(0.25, 9);
  });

  it("rejects an empty stop list", () => {
    expect(() => sampleStops([], 0.5)).toThrow(VisError);
  });

  it("resolves a hard edge at the very first position to the later stop", () => {
    const edge = normalizeStops([
      { color: "#000000", at: 0.5 },
      { color: "#ff0000", at: 0.5 },
      { color: "#ffffff", at: 1 },
    ]);
    expect(toHex(sampleStops(edge, 0.5))).toBe("#ff0000");
  });
});

describe("css/svg stop lists", () => {
  const s = normalizeStops([
    { color: "#ff0000", at: 0, opacity: 0.5 },
    { color: "#0000ff", at: 1 },
  ]);

  it("renders CSS stops with percentages and rgba for translucent stops", () => {
    expect(cssStops(s)).toBe("rgba(255, 0, 0, 0.5) 0%, #0000ff 100%");
  });

  it("renders SVG stops with stop-opacity only when < 1", () => {
    expect(svgStops(s)).toBe(
      '<stop offset="0" stop-color="#ff0000" stop-opacity="0.5"/><stop offset="1" stop-color="#0000ff"/>',
    );
  });
});

describe("BLENDS", () => {
  it("is frozen, so a consumer cannot change the accepted modes", () => {
    expect(Object.isFrozen(BLENDS)).toBe(true);
    expect(() => {
      (BLENDS as string[]).push("hard-light");
    }).toThrow(TypeError);
  });
});
