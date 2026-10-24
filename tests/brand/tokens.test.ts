import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseColor, toHex } from "../../src/core/color.js";
import { VisError } from "../../src/core/errors.js";
import { LOGO } from "../../src/brand/logo.js";
import { BRAND, PALETTES, palette } from "../../src/brand/tokens.js";

describe("BRAND", () => {
  it("pins the palette the web app ships", () => {
    expect(BRAND.red).toBe("#ef4444");
    expect(BRAND.accent.dark).toBe("oklch(52.768% 0.21534 29.097)");
    expect(BRAND.accent.light).toBe("oklch(67.517% 0.21256 24.87)");
    // The mark colour of every icon surface is the dark theme's primary, one value.
    expect(BRAND.mark).toBe(BRAND.accent.dark);
    expect(toHex(parseColor(BRAND.mark))).toBe("#ca0303");
    expect(BRAND.background).toEqual({ dark: "#0a0a0a", light: "#ffffff" });
    expect(BRAND.foreground).toEqual({ dark: "#fafafa", light: "#0a0a0a" });
    expect(BRAND.stripes).toEqual(["#d42762", "#edc41c", "#1bd766", "#10abba"]);
  });

  it("keeps ONE copy of the mark colour: no source file but tokens.ts spells it", () => {
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? sources(join(dir, e.name))
          : /\.tsx?$/.test(e.name)
            ? [join(dir, e.name)]
            : [],
      );
    const src = join(import.meta.dirname, "..", "..", "src");
    const files = sources(src);
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/#ca0303/i); // its hex rendering
      if (!file.endsWith("brand/tokens.ts"))
        expect(text, file).not.toContain("52.768"); // its oklch spelling
    }
    expect(readFileSync(join(src, "brand", "tokens.ts"), "utf8")).toContain(
      "52.768",
    );
  });

  it("every token and palette entry parses", () => {
    const all = [
      BRAND.red,
      BRAND.accent.dark,
      BRAND.accent.light,
      BRAND.mark,
      ...BRAND.stripes,
      ...Object.values(PALETTES).flat(),
    ];
    for (const c of all) expect(toHex(parseColor(c))).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("palette() resolves names and rejects unknown ones", () => {
    expect(palette("stripes")).toEqual(BRAND.stripes);
    expect(palette("red")).toBe(PALETTES.red);
    expect(() => palette("neon")).toThrow(VisError);
    expect(() => palette("neon")).toThrow("neon");
  });

  it.each(["constructor", "__proto__", "toString", "hasOwnProperty", ""])(
    "palette(%j) is unknown, not an inherited member",
    (name) => {
      expect(() => palette(name)).toThrow(VisError);
      expect(() => palette(name)).toThrow(/unknown palette/);
    },
  );

  it.each([null, undefined, 5, {}])("palette(%j) is unknown", (name) => {
    expect(() => palette(name as never)).toThrow(VisError);
  });

  it("freezes every token, so a consumer cannot change global output", () => {
    const deepFrozen = (v: unknown): boolean =>
      typeof v !== "object" ||
      v === null ||
      (Object.isFrozen(v) && Object.values(v).every(deepFrozen));
    expect(deepFrozen(BRAND)).toBe(true);
    expect(deepFrozen(PALETTES)).toBe(true);
    expect(deepFrozen(LOGO)).toBe(true);
    expect(() => {
      (PALETTES.red as string[]).push("#000");
    }).toThrow(TypeError);
    expect(() => {
      (BRAND.background as { dark: string }).dark = "#fff";
    }).toThrow(TypeError);
    expect(() => {
      (BRAND.stripes as unknown as string[])[0] = "#fff";
    }).toThrow(TypeError);
  });
});
