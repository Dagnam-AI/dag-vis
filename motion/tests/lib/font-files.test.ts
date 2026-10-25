import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BRAND_FONTS,
  FONT_FOLDER,
  FONT_SOURCE_DIR,
  PUBLIC_DIR,
} from "../../src/lib/font-files.ts";

// FONT_SOURCE_DIR is relative to motion/, which is two levels up from here.
const LIBRARY_FONTS = fileURLToPath(
  new URL(`../../${FONT_SOURCE_DIR}/`, import.meta.url),
);

describe("BRAND_FONTS", () => {
  it("lists the four faces, Moonhouse under the library's lowercase family", () => {
    expect(
      BRAND_FONTS.map((f) => [f.family, f.weight, f.from, f.file]),
    ).toEqual([
      ["Inter", "400", "Inter-Regular.ttf", "fonts/Inter-Regular.ttf"],
      ["Inter", "700", "Inter-Bold.ttf", "fonts/Inter-Bold.ttf"],
      [
        "Unbounded",
        "400",
        "Unbounded-Regular.ttf",
        "fonts/Unbounded-Regular.ttf",
      ],
      ["moonhouse", "400", "moonhouse/moonhouse.ttf", "fonts/moonhouse.ttf"],
    ]);
  });

  it("copies every face flat into public/fonts, whatever folder it sits in", () => {
    for (const f of BRAND_FONTS)
      expect(f.file).toBe(`fonts/${f.from.split("/").at(-1)!}`);
  });

  it("names the library's own font folder, and the gitignored public/fonts as the destination", () => {
    expect(FONT_SOURCE_DIR).toBe("../src/node/fonts");
    expect(`${PUBLIC_DIR}/${FONT_FOLDER}`).toBe("public/fonts");
  });

  it("only lists files the library ships (a library rename fails here, not in a render)", () => {
    for (const f of BRAND_FONTS)
      expect(existsSync(`${LIBRARY_FONTS}${f.from}`), f.from).toBe(true);
  });
});
