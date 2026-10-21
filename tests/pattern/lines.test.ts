import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { pattern } from "../../src/pattern/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

describe("lines", () => {
  it("draws a horizontal line per tile and rotates the pattern by angle", () => {
    const flat = pattern({ kind: "lines", spacing: 10 });
    expect(flat.defs).toContain(
      '<line x1="0" y1="5" x2="10" y2="5" stroke="#ef4444" stroke-width="1"/>',
    );
    expect(flat.defs).not.toContain("patternTransform");
    expect(pattern({ kind: "lines", spacing: 10, angle: 45 }).defs).toContain(
      'patternTransform="rotate(45)"',
    );
  });

  it("normalises the angle into a turn", () => {
    const rotation = (angle: number): string | undefined =>
      /rotate\(([^)]*)\)/.exec(pattern({ kind: "lines", angle }).defs)?.[1];
    expect(rotation(405)).toBe("45");
    expect(rotation(-30)).toBe("-30");
    expect(rotation(360)).toBeUndefined();
    expect(rotation(-360)).toBeUndefined();
    expect(rotation(720)).toBeUndefined();
    expect(rotation(1e20)).toBe("280");
  });

  it("rejects an angle that is not a finite number, naming `angle`", () => {
    for (const angle of [Number.NaN, Infinity, -Infinity, "45", {}]) {
      expect(() => pattern({ kind: "lines", angle } as never)).toThrow(
        VisError,
      );
      expect(() => pattern({ kind: "lines", angle } as never)).toThrow("angle");
    }
  });

  it("puts horizontal lines where the maths says (resvg, angle 0)", () => {
    const r = rasterize(
      pattern({
        kind: "lines",
        spacing: 10,
        strokeWidth: 2,
        size: { width: 40, height: 40 },
      }).svg,
    );
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        // Centre y = 5 + 10k, 2px thick: rows 4 and 5 of each tile.
        const on = y % 10 === 4 || y % 10 === 5;
        expect(pixelAt(r, x, y)[3]).toBe(on ? 255 : 0);
      }
    }
  });

  it("turns them into vertical lines at 90 degrees (resvg)", () => {
    // resvg resamples a rotated tile, so edges take a little bleed (about 14/255).
    const r = rasterize(
      pattern({
        kind: "lines",
        spacing: 10,
        strokeWidth: 2,
        angle: 90,
        size: { width: 40, height: 40 },
      }).svg,
    );
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        const alpha = pixelAt(r, x, y)[3];
        if (x % 10 === 4 || x % 10 === 5) expect(alpha).toBeGreaterThan(235);
        else expect(alpha).toBeLessThan(20);
      }
    }
  });

  it("keeps the line spacing perpendicular to the lines at 45 degrees (resvg)", () => {
    // Pattern space is user space rotated by 45 deg, so a pixel centre (u, v)
    // sits at pattern y = (v - u) / sqrt 2; lines are centred on y = 5 + 10k.
    const r = rasterize(
      pattern({
        kind: "lines",
        spacing: 10,
        strokeWidth: 2,
        angle: 45,
        size: { width: 80, height: 80 },
      }).svg,
    );
    let on = 0;
    let off = 0;
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 80; x++) {
        const along = (y + 0.5 - (x + 0.5)) / Math.SQRT2;
        const d = ((((along - 5) % 10) + 15) % 10) - 5;
        const alpha = pixelAt(r, x, y)[3];
        if (Math.abs(d) <= 0.25) {
          expect(alpha).toBeGreaterThanOrEqual(250);
          on++;
        } else if (Math.abs(d) >= 1.75) {
          expect(alpha).toBe(0);
          off++;
        }
      }
    }
    expect(on).toBeGreaterThan(200);
    expect(off).toBeGreaterThan(3000);
  });

  it("matches its golden", () => {
    expectGolden(
      "pattern/lines.svg",
      pattern({
        kind: "lines",
        spacing: 12,
        angle: -30,
        color: "#edc41c",
        size: { width: 48, height: 48 },
      }).svg,
    );
  });
});
