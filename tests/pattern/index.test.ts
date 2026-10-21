import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import * as vis from "../../src/index.js";
import { pattern } from "../../src/pattern/index.js";
import type { PatternSpec } from "../../src/pattern/index.js";
import { pixelAt, rasterize } from "../helpers/render.js";

const KINDS: readonly PatternSpec[] = [
  { kind: "dots" },
  { kind: "grid" },
  { kind: "lines", angle: 30 },
  { kind: "stripes" },
  { kind: "dagMesh" },
  { kind: "contours" },
  { kind: "noise" },
];

describe("pattern()", () => {
  it("assembles defs, fill, a sample svg and a data-uri background", () => {
    const p = pattern({ kind: "dots", spacing: 16, color: "#ef4444" });
    expect(p.fill).toBe("url(#vis1-p)");
    expect(
      p.defs.startsWith(
        '<pattern id="vis1-p" patternUnits="userSpaceOnUse" width="16" height="16">',
      ),
    ).toBe(true);
    expect(p.tile).toEqual({ width: 16, height: 16 });
    expect(
      p.svg.startsWith(
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"',
      ),
    ).toBe(true);
    expect(p.svg).toContain(p.defs);
    expect(p.cssBackground.startsWith('url("data:image/svg+xml,%3Csvg')).toBe(
      true,
    );
    expect(
      decodeURIComponent(
        p.cssBackground.slice('url("data:image/svg+xml,'.length, -2),
      ),
    ).toBe(p.svg);
  });

  it("keeps the css background free of raw quotes, newlines and spaces", () => {
    for (const spec of KINDS) {
      const uri = pattern({ ...spec, background: "#0a0a0a" }).cssBackground;
      const payload = uri.slice('url("data:image/svg+xml,'.length, -2);
      expect(payload).not.toMatch(/["\s\\<>]/);
      expect(uri.endsWith('")')).toBe(true);
    }
  });

  it("adds a background rect, honours size/idPrefix/opacity", () => {
    const p = pattern({
      kind: "grid",
      background: "#0a0a0a",
      size: { width: 40, height: 20 },
      idPrefix: "g",
      opacity: 0.3,
    });
    expect(p.svg).toContain('<rect width="40" height="20" fill="#0a0a0a"/>');
    expect(p.fill).toBe("url(#g-p)");
    expect(p.defs).toContain('stroke-opacity="0.3"');
    expect(p.svg).toContain('width="40" height="20" viewBox="0 0 40 20"');
  });

  it("folds a colour's own alpha into the opacity, as a separate attribute", () => {
    const p = pattern({ kind: "dots", color: "#ef444480", opacity: 0.5 });
    expect(p.defs).toContain('fill="#ef4444" fill-opacity="0.251"');
    expect(p.defs).not.toContain("#ef444480");
    const bg = pattern({ kind: "dots", background: "rgba(0, 0, 0, 0.5)" });
    expect(bg.svg).toContain('fill="#000000" fill-opacity="0.5"/>');
  });

  it("renders the sample as the tile repeated to about 256px", () => {
    expect(pattern({ kind: "dots", spacing: 100 }).svg).toContain(
      'width="300" height="300"',
    );
    // A tile bigger than the target is not shrunk.
    expect(pattern({ kind: "dots", spacing: 1000 }).svg).toContain(
      'width="1000" height="1000"',
    );
    expect(pattern({ kind: "stripes" }).svg).toContain(
      'width="240" height="240"',
    );
  });

  it("paints what its fill and sample claim (resvg)", () => {
    const p = pattern({
      kind: "dots",
      spacing: 20,
      color: "#ef4444",
      background: "#0a0a0a",
      size: { width: 40, height: 40 },
    });
    const r = rasterize(p.svg);
    expect(pixelAt(r, 10, 10)).toEqual([239, 68, 68, 255]);
    expect(pixelAt(r, 0, 0)).toEqual([10, 10, 10, 255]);
  });

  it("is byte-identical for the same spec and differs across ids", () => {
    for (const spec of KINDS) {
      expect(pattern(spec)).toEqual(pattern(spec));
      expect(pattern({ ...spec, idPrefix: "other" }).fill).toBe(
        "url(#other-p)",
      );
    }
  });

  it("derives the default id from the seed", () => {
    expect(pattern({ kind: "grid", seed: 7 }).fill).toBe("url(#vis7-p)");
    expect(pattern({ kind: "grid", seed: -7 }).fill).toBe("url(#vis-7-p)");
  });

  it("exposes pattern from the package root", () => {
    expect(vis.pattern).toBe(pattern);
  });
});

describe("pattern() validation", () => {
  it("rejects unknown kinds and non-object specs", () => {
    expect(() => pattern({ kind: "plaid" } as never)).toThrow(VisError);
    expect(() => pattern({ kind: "plaid" } as never)).toThrow('"plaid"');
    expect(() => pattern({} as never)).toThrow("undefined");
    for (const bad of [null, undefined, "dots", 3, []]) {
      expect(() => pattern(bad as never)).toThrow(VisError);
    }
    expect(() => pattern(null as never)).toThrow("pattern spec");
  });

  it("rejects bad common options, naming the parameter and the value", () => {
    const cases: [string, Record<string, unknown>][] = [
      ["opacity", { opacity: 2 }],
      ["opacity", { opacity: -0.1 }],
      ["opacity", { opacity: Number.NaN }],
      ["opacity", { opacity: "0.5" }],
      ["spacing", { spacing: 0 }],
      ["spacing", { spacing: 0.5 }],
      ["spacing", { spacing: -4 }],
      ["spacing", { spacing: Number.NaN }],
      ["spacing", { spacing: Infinity }],
      ["spacing", { spacing: 16385 }],
      ["spacing", { spacing: "8" }],
      ["strokeWidth", { strokeWidth: -1 }],
      ["strokeWidth", { strokeWidth: 0 }],
      ["strokeWidth", { strokeWidth: 0.0001 }],
      ["strokeWidth", { strokeWidth: Number.NaN }],
      ["strokeWidth", { strokeWidth: 1e9 }],
      ["color", { color: "nope" }],
      ["color", { color: 12 }],
      ["background", { background: "nope" }],
      ["background", { background: 0 }],
      ["seed", { seed: Number.NaN }],
      ["seed", { seed: 1.5 }],
      ["seed", { seed: 2 ** 53 }],
      ["seed", { seed: Infinity }],
      ["seed", { seed: "1" }],
      ["idPrefix", { idPrefix: "" }],
      ["idPrefix", { idPrefix: 'a"b' }],
      ["idPrefix", { idPrefix: "a b" }],
      ["idPrefix", { idPrefix: "1a" }],
      ["idPrefix", { idPrefix: "a".repeat(65) }],
      ["idPrefix", { idPrefix: 5 }],
    ];
    for (const [name, extra] of cases) {
      const spec = { kind: "dots", ...extra } as never;
      expect(() => pattern(spec), JSON.stringify(extra)).toThrow(VisError);
      expect(() => pattern(spec), JSON.stringify(extra)).toThrow(name);
    }
  });

  it("treats null as a bad value, never as absent", () => {
    for (const name of [
      "opacity",
      "spacing",
      "strokeWidth",
      "seed",
      "idPrefix",
      "color",
      "background",
      "size",
    ]) {
      const spec = { kind: "dots", [name]: null } as never;
      expect(() => pattern(spec), name).toThrow(VisError);
      expect(() => pattern(spec), name).toThrow(name);
    }
  });

  it("rejects bad sizes, naming the dimension", () => {
    const sizes: unknown[] = [
      { width: 0, height: 1 },
      { width: 1, height: 0 },
      { width: -1, height: 10 },
      { width: 0.5, height: 10 },
      { width: Number.NaN, height: 10 },
      { width: 10, height: Infinity },
      { width: 10, height: 16385 },
      { width: "10", height: 10 },
      { width: 10 },
      {},
      null,
      5,
      "256",
    ];
    for (const size of sizes) {
      expect(() => pattern({ kind: "dots", size } as never)).toThrow(VisError);
      expect(() => pattern({ kind: "dots", size } as never)).toThrow("size");
    }
    expect(() =>
      pattern({ kind: "dots", size: { width: 10, height: 0 } }),
    ).toThrow("size.height");
  });

  it("does not let a hostile value reach the markup", () => {
    for (const idPrefix of ['x"/><script>', "x)", "x#y"]) {
      expect(() => pattern({ kind: "noise", idPrefix })).toThrow(VisError);
    }
    expect(() => pattern({ kind: "dots", color: '"/><script>' })).toThrow(
      VisError,
    );
    for (const spec of KINDS) {
      const p = pattern({ ...spec, idPrefix: "ok-id_1" });
      expect(p.svg).not.toContain("<script");
      expect(p.svg).not.toMatch(/NaN|Infinity|undefined|e\+/);
    }
  });
});
