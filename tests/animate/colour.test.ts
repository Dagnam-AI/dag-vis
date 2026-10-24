import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/index.js";
import {
  asResolved,
  colourOf,
  namedVec3,
  resolveColour,
  validatePalette,
  withoutColour,
} from "../../src/animate/colour.js";

describe("namedVec3", () => {
  it("parses a colour to 0..1 channels", () => {
    expect(namedVec3("color", "#ff0000")).toEqual([1, 0, 0]);
  });

  it("prefixes a parse failure with the option name", () => {
    expect(() => namedVec3("tint", "nope")).toThrow(VisError);
    expect(() => namedVec3("tint", "nope")).toThrow(/^tint: invalid colour/);
  });
});

describe("withoutColour", () => {
  it("copies the defaults minus color and leaves the original alone", () => {
    const defaults = Object.freeze({ color: "#fff", size: 3 });
    const out = withoutColour(defaults);
    expect(out).toEqual({ size: 3 });
    expect("color" in out).toBe(false);
    expect(defaults.color).toBe("#fff");
  });
});

describe("colourOf / resolveColour", () => {
  it("prefers color, then colors[0], then the fallback", () => {
    expect(colourOf({ color: "#111", colors: ["#222"] }, "#333")).toBe("#111");
    expect(colourOf({ colors: ["#222"] }, "#333")).toBe("#222");
    expect(colourOf({ colors: [] }, "#333")).toBe("#333");
    expect(colourOf({}, "#333")).toBe("#333");
  });

  it("resolves to RGB and names `color` on failure", () => {
    expect(resolveColour({ colors: ["#00ff00"] }, "#000000")).toEqual([
      0, 1, 0,
    ]);
    expect(resolveColour({}, "#0000ff")).toEqual([0, 0, 1]);
    expect(() => resolveColour({ color: "zzz" }, "#000000")).toThrow(
      /^color: invalid colour/,
    );
  });
});

describe("validatePalette", () => {
  it("accepts no palette and a valid one", () => {
    expect(() => {
      validatePalette({});
    }).not.toThrow();
    expect(() => {
      validatePalette({ colors: ["#fff", "#00ff00"] });
    }).not.toThrow();
  });

  it.each([
    ["a Set", new Set(["#fff"])],
    ["a string", "#fff"],
  ])("rejects %s: only an array can be copied and kept honest", (_name, v) => {
    expect(() => {
      validatePalette({ colors: v as never });
    }).toThrow(/^colors must be an array/);
  });

  it("names the failing entry", () => {
    expect(() => {
      validatePalette({ colors: ["#fff", "nope"] });
    }).toThrow(/^colors\[1\]: invalid colour/);
  });
});

describe("asResolved", () => {
  it("returns the same object", () => {
    const o = { speed: 1 } as never;
    expect(asResolved(o)).toBe(o);
  });
});
