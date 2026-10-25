import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BRAND_FONTS } from "../../src/lib/font-files.ts";

// The library's src/node/fonts/: three levels up from motion/tests/lib/.
const LIBRARY_FONTS = fileURLToPath(
  new URL("../../../src/node/fonts/", import.meta.url),
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

  it("only lists files the library ships (a library rename fails here, not in a render)", () => {
    for (const f of BRAND_FONTS)
      expect(existsSync(`${LIBRARY_FONTS}${f.from}`), f.from).toBe(true);
  });
});
