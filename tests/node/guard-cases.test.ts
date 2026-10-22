import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { bareLeaks, bluePngUri, canaryWorld } from "./guard-child.js";
import { guardCases, hrefValues } from "./guard-cases.js";
import { sized } from "./png-helpers.js";

const paths = { abs: "/w/cwd/canary.png", raster: bluePngUri };

describe("guard case generator", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const a = guardCases(7, 200, paths);
    expect(a).toHaveLength(200);
    expect(guardCases(7, 200, paths)).toEqual(a);
    expect(guardCases(8, 200, paths)).not.toEqual(a);
  });

  it("reaches every value, wrapper and element form over a few hundred cases", () => {
    const text = guardCases(1, 600, paths).join("\n");
    for (const value of hrefValues(paths)) expect(text).toContain(value);
    for (const marker of [
      '<!--<b "-->',
      "<![CDATA[<b ']]>",
      "<?pi",
      "<feImage",
      "<use",
      "<pattern",
      "xlink:href=",
      "HREF=",
    ])
      expect(text).toContain(marker);
  });
});

describe("canary world", () => {
  it("makes bare resvg read an href that names a canary and nothing else", () => {
    const { cwd, abs } = canaryWorld();
    expect(readFileSync(abs).subarray(1, 4).toString()).toBe("PNG");
    expect(readFileSync(join(cwd, "#canary.png")).length).toBeGreaterThan(0);
    const image = (href: string): string =>
      sized(16, 16, `<image href="${href}" width="16" height="16"/>`);
    expect(
      bareLeaks(
        [
          image("canary.png"),
          image("../canary.png"),
          image(abs),
          image("#canary.png"),
          image("data:canary.png"),
          image("missing.png"),
          sized(16, 16),
        ],
        cwd,
      ),
    ).toEqual([true, true, true, true, true, false, false]);
  });
});
