import { describe, expect, it } from "vitest";

import { parseColor } from "../../src/core/index.js";
import { rgbToOklab } from "../../src/field/oklab.js";
import type { FlowPresetName } from "../../src/field/presets.js";
import {
  FLOW_PRESET_NAMES,
  fieldPresets,
  flowPresets,
} from "../../src/field/presets.js";
import { makeSampler, renderField } from "../../src/field/render.js";
import { resolveField } from "../../src/field/spec.js";
import { timeCoords } from "../../src/field/time.js";
import { GOLDEN } from "./presets-golden.js";

const SPEC_ORDER = [
  "violet-dusk",
  "lunar",
  "lagoon",
  "bronze",
  "sunset-ring",
  "citrus-mist",
  "orchid",
  "lilac-wave",
  "forest-glow",
  "rose",
  "emerald",
  "glacier",
  "rainbow-band",
  "cobalt",
  "crimson",
  "pine",
  "brand",
];

/** Palettes whose sampled colours do not rise strictly in OKLab lightness: the order follows the reference tile. */
const NOT_MONOTONE = [
  "lagoon",
  "citrus-mist",
  "orchid",
  "lilac-wave",
  "rose",
  "glacier",
  "rainbow-band",
  "pine",
];

/** Every colour string of a spec, in document order. */
const HEX = /#[0-9a-fA-F]+/g;

const lightness = (hex: string): number => {
  const c = parseColor(hex);
  return rgbToOklab(c.r, c.g, c.b)[0];
};

function isDeepFrozen(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return true;
  return Object.isFrozen(v) && Object.values(v).every(isDeepFrozen);
}

describe("presets", () => {
  it("ships the 16 reference tiles in reading order plus brand", () => {
    expect(FLOW_PRESET_NAMES).toEqual(SPEC_ORDER);
    expect(Object.keys(flowPresets)).toEqual(SPEC_ORDER);
  });

  it("fieldPresets adds fluid-dawn and fluted-ember after the flows", () => {
    expect(Object.keys(fieldPresets)).toEqual([
      ...SPEC_ORDER,
      "fluid-dawn",
      "fluted-ember",
    ]);
    expect(fieldPresets["fluid-dawn"]?.kind).toBe("fluid");
    expect(fieldPresets["fluted-ember"]?.kind).toBe("fluted");
    for (const name of SPEC_ORDER)
      expect(fieldPresets[name]).toBe(flowPresets[name as FlowPresetName]);
  });

  it("brand uses the Dagnam red on near-black", () => {
    expect(flowPresets.brand.palette[0]).toBe("#0a0a0a");
    expect(flowPresets.brand.palette.at(-1)).toBe("#ef4444");
  });

  it("every colour is a six-digit hex and every seed is distinct", () => {
    const seeds: number[] = [];
    for (const spec of Object.values(fieldPresets)) {
      seeds.push(spec.seed ?? 1);
      const hexes = JSON.stringify(spec).match(HEX) ?? [];
      expect(hexes.length).toBeGreaterThan(0);
      for (const h of hexes) expect(h).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it("runs each flow palette from dark to light, except the ones that follow the tile", () => {
    const deviating = SPEC_ORDER.filter((name) => {
      const ls = flowPresets[name as FlowPresetName].palette.map(lightness);
      return ls.some((l, i) => i > 0 && l < ls[i - 1]!);
    });
    expect(deviating).toEqual(NOT_MONOTONE);
    for (const name of SPEC_ORDER) {
      const ls = flowPresets[name as FlowPresetName].palette.map(lightness);
      // Whatever the order, the last colour is never darker than the first.
      if (name !== "rainbow-band")
        expect(ls.at(-1), name).toBeGreaterThan(ls[0]!);
    }
  });

  describe.each(Object.entries(fieldPresets))("%s", (_name, spec) => {
    it("validates unchanged and renders a varied, finite, repeatable frame", () => {
      expect(() => resolveField(spec)).not.toThrow();
      const f = renderField(spec, { width: 32, height: 18 });
      expect(renderField(spec, { width: 32, height: 18 }).data).toEqual(f.data);
      let range = 0;
      for (let ch = 0; ch < 3; ch++) {
        let min = 255;
        let max = 0;
        for (let i = ch; i < f.data.length; i += 4) {
          min = Math.min(min, f.data[i]!);
          max = Math.max(max, f.data[i]!);
        }
        range = Math.max(range, max - min);
      }
      expect(range).toBeGreaterThan(8);
      // A NaN would store as 0 in the byte frame: look at the samples themselves.
      const sampler = makeSampler(resolveField(spec), 32, 18);
      sampler.prepare(timeCoords(0));
      const out = new Float64Array(3);
      for (let y = 0; y < 18; y++)
        for (let x = 0; x < 32; x++) {
          sampler.sample((x + 0.5) / 32, (y + 0.5) / 18, x, y, out);
          expect(out.every(Number.isFinite)).toBe(true);
        }
    });

    it("is deeply frozen, so a consumer cannot corrupt the library", () => {
      expect(isDeepFrozen(spec)).toBe(true);
    });
  });

  it("refuses edits to a shipped preset", () => {
    const palette = flowPresets["violet-dusk"].palette as string[];
    const before = [...palette];
    expect(() => palette.push("#ffffff")).toThrow(TypeError);
    expect(() => {
      (flowPresets["violet-dusk"].warp as { strength: number }).strength = 3;
    }).toThrow(TypeError);
    expect(() => {
      (flowPresets as Record<string, unknown>).extra = {};
    }).toThrow(TypeError);
    expect(() => {
      (fieldPresets as Record<string, unknown>).extra = {};
    }).toThrow(TypeError);
    expect(() => {
      (flowPresets as Record<string, unknown>)["violet-dusk"] = {};
    }).toThrow(TypeError);
    expect(palette).toEqual(before);
  });

  it("has no inherited names to trip a lookup by user input", () => {
    for (const name of ["__proto__", "toString", "constructor"]) {
      expect(name in flowPresets, name).toBe(false);
      expect(name in fieldPresets, name).toBe(false);
      expect(
        (fieldPresets as Record<string, unknown>)[name],
        name,
      ).toBeUndefined();
    }
  });

  it("pins every palette and a few pixels of every preset (within one level per channel)", () => {
    expect(Object.keys(GOLDEN)).toEqual(Object.keys(fieldPresets));
    for (const [name, golden] of Object.entries(GOLDEN)) {
      const spec = fieldPresets[name] as never;
      expect(JSON.stringify(spec).match(HEX) ?? [], name).toEqual(golden.hexes);
      const f = renderField(spec, { width: 16, height: 9 });
      for (const [x, y, r, g, b] of golden.pixels) {
        const i = (y * 16 + x) * 4;
        for (const [k, want] of [r, g, b].entries())
          expect(
            Math.abs(f.data[i + k]! - want),
            `${name} (${x},${y}) channel ${k}`,
          ).toBeLessThanOrEqual(1);
      }
    }
  });
});
