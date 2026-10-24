import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  brandBackground,
  brandBackgroundLayers,
} from "../../src/scene/brand-background.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

describe("brandBackground", () => {
  it("renders the six layers with defaults at the og-default size", () => {
    const svg = brandBackground({ width: 1672, height: 941 });
    expect(svg).toContain('width="1672" height="941"');
    expect(svg).toContain('<rect width="1672" height="941" fill="#08080a"/>'); // 1 base
    expect(svg).toContain('fill="url(#vis1-band)"'); // 2 band
    // 2b the outline: three strokes (glow, glow, crisp line), none using vector-effect
    // (resvg ignores it), then 3 hairlines: three offset copies.
    expect(svg.match(/stroke="url\(#vis1-hair\)"/g)).toHaveLength(6);
    expect(
      svg.match(/stroke="url\(#vis1-hair\)"[^>]*transform=/g),
    ).toHaveLength(3);
    expect(svg).not.toContain("vector-effect");
    // Stroke width is the requested 1.8 output px divided by the motif scale
    // k = 1.5 * 941 / 628, so the crisp line renders 1.8 px wide; the glow strokes are 3.5 and 7 x that.
    const motifScale = (1.5 * 941) / 628;
    for (const widen of [1, 3.5, 7])
      expect(svg).toContain(
        `stroke-width="${String(Number(((1.8 * widen) / motifScale).toFixed(3)))}"`,
      );
    expect(svg).toContain('fill="url(#vis1-glow)"'); // 4 glow
    expect(svg).not.toContain("-p)"); // 5 no pattern by default
    expect(svg).toContain('fill="url(#vis1-vig)"'); // 6 vignette
    // the accent is the dark theme's deep red (#ca0303), not the bright BRAND.red
    expect(svg).toContain('stop-color="#ca0303"');
    expect(svg).not.toContain("#ef4444");
    // motif centre lands at focus (0.82, 0.5): translate is the top-left corner,
    // so centre = tx + (628/2)·k, with k = 1.5·941/628.
    const m = /translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)/.exec(svg);
    const tx = Number(m?.[1]);
    const k = Number(m?.[3]);
    expect(k).toBeCloseTo((1.5 * 941) / 628, 2);
    expect(tx + 314 * k).toBeCloseTo(0.82 * 1672, 0);
  });

  it("is deterministic and matches goldens at the required aspect ratios", () => {
    for (const [w, h] of [
      [1672, 941],
      [1200, 630],
      [1080, 1080],
      [1080, 1920],
      [1500, 500],
    ] as const) {
      const svg = brandBackground({ width: w, height: h });
      expect(svg).toBe(brandBackground({ width: w, height: h }));
      expect(svg).toContain(`viewBox="0 0 ${w} ${h}"`);
      expectGolden(`scene/brand-background-${w}x${h}.svg`, svg);
    }
  });

  it("takes a gradient base, a pattern overlay, custom palette/focus/scale and zero hairlines", () => {
    const svg = brandBackground({
      width: 400,
      height: 200,
      base: { kind: "linear", angle: 90, stops: ["#000", "#222"] },
      pattern: { kind: "dots", spacing: 20, opacity: 0.2 },
      palette: ["#10abba"],
      focus: [0.5, 0.5],
      scale: 1,
      hairlines: 0,
      edge: 0,
      glow: 0,
      vignette: 0,
    });
    expect(svg).toContain('fill="url(#vis1-base-g)"');
    expect(svg).toContain('fill="url(#vis1-pat-p)"');
    expect(svg).toContain('stop-color="#10abba"');
    expect(svg).not.toContain("stroke-width");
    expect(svg).not.toContain("-hair");
    expect(svg).not.toContain("-glow");
    expect(svg).not.toContain("-vig");
  });

  it("exposes defs/body for composition", () => {
    const { defs, body } = brandBackgroundLayers({ width: 100, height: 50 });
    expect(defs).toContain('id="vis1-band"');
    expect(body.startsWith("<rect")).toBe(true);
  });

  it("rasterises to a dark base with the glow pooled at the right edge and darker corners", () => {
    const r = rasterize(brandBackground({ width: 800, height: 450 }));
    const [lr, lg, lb] = pixelAt(r, 40, 225);
    const [gr, gg, gb] = pixelAt(r, 780, 236);
    expect(lr).toBeLessThan(40);
    expect(lg).toBeLessThan(30);
    expect(lb).toBeLessThan(30);
    // The glow is red: strong red, far less green/blue.
    expect(gr).toBeGreaterThan(120);
    expect(gr).toBeGreaterThan(gg * 2);
    expect(gr).toBeGreaterThan(gb * 2);
    const [cr, cg, cb] = pixelAt(r, 0, 0);
    expect(cr + cg + cb).toBeLessThan(30);
  });

  it("renders hairlines as wide as requested in output px, at any size", () => {
    // Hairlines only: black base, white accent, no band/glow/vignette, copy 1 on top of
    // the outline. The middle bar's top edge is a horizontal run; sum the coverage down a
    // column through it and divide by the peak to get the stroke's thickness in px.
    const thickness = (width: number, height: number, w: number): number => {
      const r = rasterize(
        brandBackground({
          width,
          height,
          base: "#000000",
          palette: ["#ffffff"],
          band: 0,
          glow: 0,
          vignette: 0,
          edge: 0,
          hairlines: 1,
          hairlineGap: 0,
          hairlineWidth: w,
        }),
      );
      const x = Math.round((1000 / 1672) * width);
      const column = Array.from(
        { length: height },
        (_, y) => pixelAt(r, x, y)[0],
      );
      const first = column.findIndex((v) => v > 0);
      const rest = column.slice(first);
      // The first run of lit rows is the bar's top edge.
      const lit = rest.slice(
        0,
        rest.findIndex((v) => v === 0),
      );
      return lit.reduce((a, v) => a + v, 0) / Math.max(...lit);
    };
    for (const [width, height] of [
      [1672, 941],
      [836, 470],
    ] as const) {
      for (const w of [3, 5]) {
        // Edge rows are antialiased in quarters, so allow 0.75 px. Before the fix
        // this measured about 2.25 x w at 1672x941.
        expect(
          Math.abs(thickness(width, height, w) - w),
          `${width}x${height} @ ${w}px`,
        ).toBeLessThan(0.75);
      }
    }
  });

  it("stays a deep saturated red: no pixel is washed towards pink", () => {
    // The bright #ef4444 over a dark base reads pink (green/red of about 0.28); the dark
    // theme's #ca0303 keeps green and blue within a tenth of red above the base wherever red shows at all.
    const r = rasterize(brandBackground({ width: 1200, height: 630 }));
    let reddest = 0;
    for (let y = 0; y < r.height; y += 3)
      for (let x = 0; x < r.width; x += 3) {
        const [pr, pg, pb] = pixelAt(r, x, y);
        reddest = Math.max(reddest, pr);
        if (pr > 40) {
          expect(pg - 10, `${x},${y}`).toBeLessThan(pr * 0.1);
          expect(pb - 10, `${x},${y}`).toBeLessThan(pr * 0.1);
        }
      }
    expect(reddest).toBeGreaterThan(100); // and it does reach a strong red at the glow
  });

  it("draws the outline as a crisp line with only a faint glow beside it", () => {
    // White accent on black, outline only, motif centred so the right end (where the
    // outline has faded in) is on the canvas: down a column near it the peak is the
    // line at full strength and 7 px off it only the wide glow remains.
    const width = 1672;
    const height = 941;
    const r = rasterize(
      brandBackground({
        width,
        height,
        base: "#000000",
        palette: ["#ffffff"],
        band: 0,
        glow: 0,
        vignette: 0,
        hairlines: 0,
        hairlineWidth: 2,
        focus: [0.5, 0.5],
      }),
    );
    const x = 1480;
    const column = Array.from(
      { length: height },
      (_, y) => pixelAt(r, x, y)[0],
    );
    const peak = Math.max(...column);
    const at = column.indexOf(peak);
    expect(peak).toBeGreaterThan(200); // crisp: the line at the gradient's strength
    expect(column[at - 7] ?? 255).toBeLessThan(40); // glow only, a few percent
    expect(column[at - 7] ?? 0).toBeGreaterThan(0); // but there is a glow
  });

  it("edge 0 draws no outline strokes, and the outline follows the accent opacity", () => {
    const strokes = (edge: number): number =>
      (
        brandBackground({ width: 200, height: 100, edge, hairlines: 0 }).match(
          /stroke=/g,
        ) ?? []
      ).length;
    expect(strokes(0)).toBe(0);
    expect(strokes(1)).toBe(3);
    const half = brandBackground({
      width: 200,
      height: 100,
      palette: ["rgba(255, 255, 255, 0.5)"],
      hairlines: 0,
      edge: 0.8,
    });
    // glow 0.8 x 0.07 x 0.5, glow 0.8 x 0.14 x 0.5, line 0.8 x 1 x 0.5
    for (const o of ["0.028", "0.056", "0.4"])
      expect(half).toContain(`opacity="${o}"`);
  });

  it("fades the motif in from its left edge, which never shows as a hard edge", () => {
    const r = rasterize(brandBackground({ width: 1672, height: 941 }));
    // The motif's top-left corner sits at about x=681, y=27; just inside it the band is clear.
    const [er, eg, eb] = pixelAt(r, 690, 70);
    const [br, bg, bb] = pixelAt(r, 40, 70);
    expect(
      Math.abs(er - br) + Math.abs(eg - bg) + Math.abs(eb - bb),
    ).toBeLessThan(6);
    // Near the crossing it is plainly red.
    const [cr, cg] = pixelAt(r, 1400, 470);
    expect(cr).toBeGreaterThan(cg * 3);
  });

  it("changes with the seed only where the base or pattern is seeded", () => {
    const plain = (seed: number): string =>
      brandBackground({ width: 300, height: 200, seed });
    // Ids follow the seed, the rest does not.
    expect(plain(2)).toBe(plain(1).replaceAll("vis1", "vis2"));
    const meshed = (seed: number): string =>
      brandBackground({
        width: 300,
        height: 200,
        seed,
        base: { kind: "aurora", palette: ["#ef4444", "#10abba"] },
      });
    expect(meshed(3)).not.toBe(meshed(4).replaceAll("vis4", "vis3"));
    // A base with its own seed keeps it, whatever the scene seed is.
    const pinned = (seed: number): string =>
      brandBackground({
        width: 300,
        height: 200,
        seed,
        base: { kind: "aurora", palette: ["#ef4444", "#10abba"], seed: 9 },
      });
    expect(pinned(3)).toBe(pinned(4).replaceAll("vis4", "vis3"));
    const dotted = (seed: number): string =>
      brandBackground({
        width: 300,
        height: 200,
        seed,
        pattern: { kind: "dagMesh" },
      });
    expect(dotted(3)).not.toBe(dotted(4).replaceAll("vis4", "vis3"));
    const dottedPinned = (seed: number): string =>
      brandBackground({
        width: 300,
        height: 200,
        seed,
        pattern: { kind: "dagMesh", seed: 5 },
      });
    expect(dottedPinned(3)).toBe(dottedPinned(4).replaceAll("vis4", "vis3"));
  });

  it("honours colour alpha on the base, accent and glow colour", () => {
    const svg = brandBackground({
      width: 200,
      height: 100,
      base: "rgba(0, 0, 0, 0.5)",
      palette: ["rgba(239, 68, 68, 0.5)"],
      glowColor: "#10abba80",
      hairlines: 1,
      band: 0.35,
      glow: 0.55,
      edge: 0,
    });
    expect(svg).toContain('fill="#000000" fill-opacity="0.5"');
    // band 0.35 x 0.5, hairline 0.5 x 0.5, glow 0.55 x 0.502
    expect(svg).toContain('stop-opacity="0.175"');
    expect(svg).toContain('opacity="0.25"');
    expect(svg).toContain('stop-color="#10abba" stop-opacity="0.276"');
  });

  it("pools the glow at the right edge by default, eased to zero at its radius", () => {
    const svg = brandBackground({ width: 1000, height: 500 });
    // glowAt [0.98, 0.52], radius 0.6 of the short side
    expect(svg).toContain('cx="980" cy="260" r="300"');
    // four stops easing from 0.85 to nothing, the last fully transparent: no wall at the radius
    const glow = /<radialGradient id="vis1-glow".*?<\/radialGradient>/.exec(
      svg,
    );
    expect(
      [
        ...(glow?.[0] ?? "").matchAll(
          /offset="([\d.]+)".*?stop-opacity="([\d.]+)"/g,
        ),
      ].map((m) => [Number(m[1]), Number(m[2])]),
    ).toEqual([
      [0, 0.85],
      [0.3, 0.51],
      [0.6, 0.187],
      [1, 0],
    ]);
  });

  it("places the glow at glowAt with glowRadius of the short side", () => {
    const svg = brandBackground({
      width: 400,
      height: 200,
      glowAt: [0.25, 0.5],
      glowRadius: 0.5,
    });
    expect(svg).toContain('cx="100" cy="100" r="100"');
  });

  it("keeps derived ids unique and within the pattern's 64-character cap", () => {
    const id = `a${"b".repeat(59)}`;
    const svg = brandBackground({
      width: 100,
      height: 100,
      idPrefix: id,
      pattern: { kind: "grid" },
      base: { kind: "radial", stops: ["#000", "#111"] },
    });
    expect(svg).toContain(`id="${id}-pat-p"`);
    expect(svg).toContain(`id="${id}-base-g"`);
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("brandBackground validation", () => {
  const ok = { width: 100, height: 50 };
  const bad = (name: string, opts: unknown, message: RegExp): void => {
    expect(
      () => brandBackground(opts as Parameters<typeof brandBackground>[0]),
      name,
    ).toThrow(VisError);
    expect(
      () => brandBackground(opts as Parameters<typeof brandBackground>[0]),
      name,
    ).toThrow(message);
  };

  it("names the parameter and value of a bad number", () => {
    bad("width", { ...ok, width: 0 }, /width.*0/);
    bad("height", { ...ok, height: -3 }, /height.*-3/);
    bad("width NaN", { ...ok, width: NaN }, /width.*NaN/);
    bad("width huge", { ...ok, width: 1e9 }, /width.*1000000000/);
    bad("width string", { ...ok, width: "9" }, /width.*"9"/);
    bad("height null", { ...ok, height: null }, /height.*null/);
    bad("band", { ...ok, band: 2 }, /band.*2/);
    bad("edge", { ...ok, edge: 1.5 }, /edge.*1.5/);
    bad("edge null", { ...ok, edge: null }, /edge.*null/);
    bad("glow", { ...ok, glow: -0.1 }, /glow.*-0.1/);
    bad("vignette", { ...ok, vignette: 1.5 }, /vignette.*1.5/);
    bad("vignette null", { ...ok, vignette: null }, /vignette.*null/);
    bad("hairlines neg", { ...ok, hairlines: -1 }, /hairlines.*-1/);
    bad("hairlines frac", { ...ok, hairlines: 1.5 }, /hairlines.*1.5/);
    bad("hairlines big", { ...ok, hairlines: 99 }, /hairlines.*99/);
    bad("hairlineWidth", { ...ok, hairlineWidth: 0 }, /hairlineWidth.*0/);
    bad("hairlineGap", { ...ok, hairlineGap: 2 }, /hairlineGap.*2/);
    bad("scale 0", { ...ok, scale: 0 }, /scale.*0/);
    bad("scale inf", { ...ok, scale: Infinity }, /scale.*Infinity/);
    bad("scale big", { ...ok, scale: 1e6 }, /scale.*1000000/);
    bad("glowRadius", { ...ok, glowRadius: 0 }, /glowRadius.*0/);
    bad("seed frac", { ...ok, seed: 1.5 }, /seed.*1.5/);
    bad("seed big", { ...ok, seed: 2 ** 60 }, /seed/);
    bad("seed null", { ...ok, seed: null }, /seed.*null/);
  });

  it("rejects bad points", () => {
    bad("focus range", { ...ok, focus: [2, 0] }, /focus\[0\].*2/);
    bad("focus y", { ...ok, focus: [0, NaN] }, /focus\[1\].*NaN/);
    bad("focus short", { ...ok, focus: [0.5] }, /focus/);
    bad("focus long", { ...ok, focus: [0, 0, 0] }, /focus/);
    bad("focus type", { ...ok, focus: "ab" }, /focus.*"ab"/);
    bad("focus entry", { ...ok, focus: ["0", 0] }, /focus\[0\].*"0"/);
    bad("glowAt", { ...ok, glowAt: [0, -1] }, /glowAt\[1\].*-1/);
  });

  it("rejects bad colours, naming the parameter", () => {
    bad("palette empty", { ...ok, palette: [] }, /palette/);
    bad("palette type", { ...ok, palette: "#fff" }, /palette.*"#fff"/);
    bad("palette entry", { ...ok, palette: ["#fff", "nope"] }, /palette\[1\]/);
    bad("palette number", { ...ok, palette: [5] }, /palette\[0\].*5/);
    bad(
      "palette long",
      { ...ok, palette: Array.from({ length: 65 }, () => "#fff") },
      /palette.*65/,
    );
    bad("base colour", { ...ok, base: "not-a-colour" }, /base/);
    bad("base type", { ...ok, base: 7 }, /base.*7/);
    bad("base null", { ...ok, base: null }, /base.*null/);
    bad("base long", { ...ok, base: `#${"f".repeat(500)}` }, /base/);
    bad("glowColor", { ...ok, glowColor: "red-ish" }, /glowColor/);
    bad("glowColor type", { ...ok, glowColor: 1 }, /glowColor.*1/);
    bad("base gradient", { ...ok, base: { kind: "nope" } }, /nope/);
  });

  it("rejects a bad idPrefix, naming it", () => {
    bad("id chars", { ...ok, idPrefix: 'a"b' }, /idPrefix/);
    bad("id digit", { ...ok, idPrefix: "1a" }, /idPrefix.*"1a"/);
    bad("id type", { ...ok, idPrefix: 5 }, /idPrefix.*5/);
    bad("id null", { ...ok, idPrefix: null }, /idPrefix.*null/);
    bad("id long", { ...ok, idPrefix: `a${"b".repeat(60)}` }, /idPrefix/);
  });

  it("rejects a bad pattern, options object and size holder", () => {
    bad("pattern null", { ...ok, pattern: null }, /pattern.*null/);
    bad("pattern string", { ...ok, pattern: "dots" }, /pattern.*"dots"/);
    bad("pattern kind", { ...ok, pattern: { kind: "x" } }, /pattern kind/);
    bad(
      "pattern opt",
      { ...ok, pattern: { kind: "dots", spacing: 0 } },
      /spacing/,
    );
    bad("options null", null, /options/);
    bad("options number", 3, /options/);
  });

  it("prefixes an error from a nested base or pattern with its parameter", () => {
    const grab = (opts: unknown): Error => {
      try {
        brandBackground(opts as Parameters<typeof brandBackground>[0]);
      } catch (e) {
        return e as Error;
      }
      throw new Error("did not throw");
    };
    const empty = grab({ ...ok, base: [] });
    expect(empty).toBeInstanceOf(VisError);
    expect(empty.message).toMatch(/^base: unknown gradient kind/);
    expect(empty.cause).toBeInstanceOf(VisError);
    const colour = grab({
      ...ok,
      base: { kind: "linear", stops: ["#000", "bad"] },
    });
    expect(colour.message).toMatch(/^base: .*bad/);
    const spacing = grab({ ...ok, pattern: { kind: "dots", spacing: 0 } });
    expect(spacing).toBeInstanceOf(VisError);
    expect(spacing.message).toMatch(/^pattern: spacing must be/);
    expect(spacing.cause).toBeInstanceOf(VisError);
  });

  it("reports a self-referencing nested base as a VisError naming the parameter", () => {
    const loop: { kind: "layers"; layers: unknown[] } = {
      kind: "layers",
      layers: [],
    };
    loop.layers.push(loop);
    expect(() => brandBackground({ ...ok, base: loop as never })).toThrow(
      VisError,
    );
    expect(() => brandBackground({ ...ok, base: loop as never })).toThrow(
      /^base: a gradient spec contains a cycle/,
    );
  });

  it("lets a non-VisError from a nested generator through unchanged", () => {
    // A spec whose `kind` getter throws: not a VisError, so `within` must not wrap it.
    const hostile = {
      get kind(): string {
        throw new RangeError("boom");
      },
    };
    expect(() => brandBackground({ ...ok, base: hostile as never })).toThrow(
      RangeError,
    );
  });

  it("does not echo markup from a rejected value", () => {
    expect(() =>
      brandBackground({ ...ok, palette: ['"><script>x</script>'] }),
    ).toThrow(VisError);
    const svg = brandBackground({ ...ok, palette: ["#10abba"] });
    expect(svg).not.toContain("<script");
  });
});
