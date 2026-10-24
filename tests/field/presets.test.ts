import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseColor } from "../../src/core/index.js";
import { paletteLut } from "../../src/field/lut.js";
import { rgbToOklab } from "../../src/field/oklab.js";
import type { FieldPresetName } from "../../src/field/presets.js";
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
] as const;

/** Palettes whose sampled colours do not rise strictly in OKLab lightness: the order follows the reference tile. */
const NOT_MONOTONE = [
  "lagoon",
  "sunset-ring",
  "citrus-mist",
  "orchid",
  "rose",
  "glacier",
  "rainbow-band",
  "pine",
];

/** The presets reworked after the first release; every other preset is pinned verbatim below. */
const REWORKED = [
  "sunset-ring",
  "lilac-wave",
  "rainbow-band",
  "cobalt",
] as const;

/** SHA-256 of `JSON.stringify` of the other 15 presets (a name-to-spec record in `fieldPresets` order), taken before the rework. */
const UNCHANGED_SHA256 =
  "cf41b4f70ca163ecbd05f2e30f285712c964d2b3458c7202c0329e8155cb1c73";

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
    expect(fieldPresets["fluid-dawn"].kind).toBe("fluid");
    expect(fieldPresets["fluted-ember"].kind).toBe("fluted");
    for (const name of SPEC_ORDER)
      expect(fieldPresets[name]).toBe(flowPresets[name]);
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
      const ls = flowPresets[name].palette.map(lightness);
      return ls.some((l, i) => i > 0 && l < ls[i - 1]!);
    });
    expect(deviating).toEqual(NOT_MONOTONE);
    for (const name of SPEC_ORDER) {
      const ls = flowPresets[name].palette.map(lightness);
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

  it("tests a name with `in` or Object.hasOwn, as documented", () => {
    for (const record of [flowPresets, fieldPresets]) {
      expect("lunar" in record).toBe(true);
      expect(Object.hasOwn(record, "lunar")).toBe(true);
      expect(Object.hasOwn(record, "nope")).toBe(false);
      expect("hasOwnProperty" in record).toBe(false);
    }
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

  it("leaves the 15 presets that were not reworked byte for byte as shipped", () => {
    const rest = Object.fromEntries(
      Object.entries(fieldPresets).filter(
        ([name]) => !(REWORKED as readonly string[]).includes(name),
      ),
    );
    expect(Object.keys(rest)).toHaveLength(15);
    expect(
      createHash("sha256").update(JSON.stringify(rest)).digest("hex"),
    ).toBe(UNCHANGED_SHA256);
  });

  describe.each(REWORKED)("%s (reworked)", (name) => {
    it("validates and renders identical frames twice, at a size and at a second time", () => {
      const spec = fieldPresets[name];
      expect(() => resolveField(spec)).not.toThrow();
      for (const t of [0, 1.5]) {
        const a = renderField(spec, { width: 48, height: 27, t });
        const b = renderField(spec, { width: 48, height: 27, t });
        expect(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data))).toBe(
          0,
        );
      }
    });
  });

  it("rainbow-band is a spectrum: saturated stops, and no grey mud between them", () => {
    const palette = flowPresets["rainbow-band"].palette;
    expect(palette).toHaveLength(6);
    const chroma = (r: number, g: number, b: number): number => {
      const [, a, bb] = rgbToOklab(r, g, b);
      return Math.hypot(a, bb);
    };
    for (const hex of palette) {
      const c = parseColor(hex);
      expect(chroma(c.r, c.g, c.b), hex).toBeGreaterThan(0.09);
    }
    // Every one of the 256 interpolated entries stays colourful: the shipped minimum is
    // 0.098 (the first release's blue-green ramp dipped to 0.047, which reads as grey mud).
    const lut = paletteLut(palette);
    for (let i = 0; i < 256; i++)
      expect(
        chroma(lut[i * 3]!, lut[i * 3 + 1]!, lut[i * 3 + 2]!),
        `entry ${i}`,
      ).toBeGreaterThan(0.09);
  });

  it("rainbow-band covers the whole hue circle, not one colour in six shades", () => {
    const lut = paletteLut(flowPresets["rainbow-band"].palette);
    const bands = new Set<number>();
    for (let i = 0; i < 256; i++) {
      const [, a, b] = rgbToOklab(
        lut[i * 3]!,
        lut[i * 3 + 1]!,
        lut[i * 3 + 2]!,
      );
      const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
      bands.add(Math.floor(hue / 30));
    }
    // 12 bands of 30 degrees: red through violet leaves out only the magenta and pink
    // side of the circle.
    expect(bands.size).toBeGreaterThanOrEqual(9);
  });

  describe("white text stays readable on the reworked backgrounds", () => {
    // Luminance above which white text is under 3 to 1 (1.05 / (Y + 0.05) = 3).
    const LIMIT = 1.05 / 3 - 0.05;
    const W = 128;
    const H = 72;
    const linear = (c: number): number => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    /** Share of the pixels in a centred box (as fractions of the frame) that are under 3 to 1 against white. */
    const glareShare = (
      data: Uint8ClampedArray,
      boxW: number,
      boxH: number,
    ): number => {
      const x0 = Math.floor((W * (1 - boxW)) / 2);
      const x1 = W - x0;
      const y0 = Math.floor((H * (1 - boxH)) / 2);
      const y1 = H - y0;
      let bad = 0;
      let n = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          const lum =
            0.2126 * linear(data[i]!) +
            0.7152 * linear(data[i + 1]!) +
            0.0722 * linear(data[i + 2]!);
          if (lum > LIMIT) bad++;
          n++;
        }
      return bad / n;
    };

    it.each(REWORKED)(
      "%s: at most 10% of the central 60% x 40% area and of a headline-sized 38% x 12% strip is under 3 to 1, in six frames of the loop",
      (name) => {
        for (let t = 0; t < 6; t++) {
          const f = renderField(fieldPresets[name], {
            width: W,
            height: H,
            t,
            loop: 6,
          });
          expect(
            glareShare(f.data, 0.6, 0.4),
            `${name} t=${t} area`,
          ).toBeLessThanOrEqual(0.1);
          expect(
            glareShare(f.data, 0.38, 0.12),
            `${name} t=${t} headline`,
          ).toBeLessThanOrEqual(0.1);
        }
      },
    );
  });

  it("sunset-ring is a ring: brighter on the circle than at the centre or at the edge", () => {
    const W = 160;
    const H = 90;
    const f = renderField(flowPresets["sunset-ring"], { width: W, height: H });
    // Mean luma over pixels at a distance (in picture heights) from the centre.
    const meanLuma = (from: number, to: number): number => {
      let sum = 0;
      let n = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const d = Math.hypot((x + 0.5 - W / 2) / H, (y + 0.5) / H - 0.5);
          if (d < from || d >= to) continue;
          const i = (y * W + x) * 4;
          sum +=
            0.2126 * f.data[i]! +
            0.7152 * f.data[i + 1]! +
            0.0722 * f.data[i + 2]!;
          n++;
        }
      return sum / n;
    };
    const centre = meanLuma(0, 0.1);
    const ring = meanLuma(0.25, 0.4);
    const edge = meanLuma(0.7, 2);
    expect(ring).toBeGreaterThan(centre + 30);
    expect(ring).toBeGreaterThan(edge + 30);
  });

  it("pins every palette and a few pixels of every preset (within one level per channel)", () => {
    expect(Object.keys(GOLDEN)).toEqual(Object.keys(fieldPresets));
    for (const [name, golden] of Object.entries(GOLDEN)) {
      const spec = fieldPresets[name as FieldPresetName] as never;
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
