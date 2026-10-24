import { describe, expect, it } from "vitest";
import * as field from "../../src/field/index.js";
import * as root from "../../src/index.js";

describe("field barrel", () => {
  it("exports exactly the field names, sorted", () => {
    expect(Object.keys(field).sort()).toEqual([
      "FLOW_PRESET_NAMES",
      "FLOW_SHAPES",
      "GRAIN_FPS",
      "MAX_FRAME_PIXELS",
      "MAX_T",
      "TIME_RATE",
      "fbm",
      "fieldPresets",
      "flowPresets",
      "hash01",
      "hash4",
      "makeSampler",
      "randomFlow",
      "renderField",
      "resolveField",
      "simplex4",
      "timeCoords",
    ]);
  });

  it("the root barrel re-exports the public subset as the same bindings", () => {
    for (const name of [
      "FLOW_PRESET_NAMES",
      "FLOW_SHAPES",
      "fieldPresets",
      "flowPresets",
      "randomFlow",
      "renderField",
      "resolveField",
    ] as const)
      expect(root[name]).toBe(field[name]);
  });

  it("keeps the noise, the sampler factory and the constants out of the root", () => {
    for (const name of [
      "timeCoords",
      "hash4",
      "hash01",
      "simplex4",
      "fbm",
      "makeSampler",
      "TIME_RATE",
      "GRAIN_FPS",
      "MAX_FRAME_PIXELS",
      "MAX_T",
    ])
      expect(name in root, name).toBe(false);
  });
});
