import { describe, expect, it } from "vitest";

import { toHex } from "../../src/core/color.js";
import { VisError } from "../../src/core/errors.js";
import {
  cssStops,
  normalizeStops,
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
