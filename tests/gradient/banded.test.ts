import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { gradient, gradientSvg } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

describe("banded gradient", () => {
  it("posterises into hard-edged bands", () => {
    const g = gradient({
      kind: "banded",
      stops: ["#000000", "#ffffff"],
      bands: 2,
      size: { width: 10, height: 10 },
    });
    expect(g.css).toBe(
      "background: linear-gradient(180deg, #000000 0%, #000000 50%, #ffffff 50%, #ffffff 100%);",
    );
    expect((g.defs.match(/<stop /g) ?? []).length).toBe(4);
  });

  it("honours angle and samples the middle bands", () => {
    const g = gradient({
      kind: "banded",
      angle: 90,
      stops: ["#000000", "#ffffff"],
      bands: 4,
    });
    expect(g.css).toContain("linear-gradient(90deg,");
    expect((g.css.match(/%/g) ?? []).length).toBe(8);
  });

  it("validates bands", () => {
    expect(() =>
      gradient({ kind: "banded", stops: ["#000", "#fff"], bands: 1 }),
    ).toThrow(VisError);
    expect(() =>
      gradient({ kind: "banded", stops: ["#000", "#fff"], bands: 2.5 }),
    ).toThrow(VisError);
  });

  it("rasterises to the CSS bands, flat colour per band (resvg vs CSS maths)", () => {
    // CSS: the gradient line at `angle` runs through the centre and is
    // |w sin a| + |h cos a| long; a pixel's t is its projection on it.
    // Band i (of n) is the colour of the stops at i / (n - 1), for t in [i/n, (i+1)/n).
    const size = { width: 80, height: 60 };
    const bands = 6;
    const spec = {
      kind: "banded",
      angle: 45,
      stops: ["#000000", "#ffffff"],
      bands,
      size,
    } as const;
    const raster = rasterize(gradientSvg(spec));
    const rad = (45 * Math.PI) / 180;
    const length = size.width * Math.sin(rad) + size.height * Math.cos(rad);
    let checked = 0;
    for (let y = 0; y < size.height; y += 2) {
      for (let x = 0; x < size.width; x += 2) {
        const t =
          ((x + 0.5 - size.width / 2) * Math.sin(rad) -
            (y + 0.5 - size.height / 2) * Math.cos(rad)) /
            length +
          0.5;
        const edge = Math.abs(t * bands - Math.round(t * bands));
        if (edge < 0.05) continue; // within ~1px of a hard edge: anti-aliased
        const band = Math.min(bands - 1, Math.floor(t * bands));
        const want = Math.round((255 * band) / (bands - 1));
        expect(Math.abs(pixelAt(raster, x, y)[0] - want)).toBeLessThanOrEqual(
          1,
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(900);
  });

  it("matches its golden", () => {
    expectGolden(
      "gradient/banded.svg",
      gradientSvg({
        kind: "banded",
        angle: 45,
        stops: ["#ef4444", "#0a0a0a"],
        bands: 6,
        size: { width: 80, height: 60 },
      }),
    );
  });
});
