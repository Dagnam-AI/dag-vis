import { describe, expect, it } from "vitest";

import { APP_ICON, appIconSvg } from "../../src/brand/app-icon.js";
import {
  APP_ICON_PRESETS,
  APP_ICON_SHAPES,
  resolveAppIconLook,
} from "../../src/brand/app-icon-options.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";
import type { Raster } from "../helpers/render.js";

const C: number = APP_ICON.canvas;

/** Alpha at `k` times the half-side along the unit direction (dx, dy) from the canvas centre. */
const alphaAt = (
  r: Raster,
  half: number,
  k: number,
  dx: number,
  dy: number,
): number =>
  pixelAt(
    r,
    Math.round(C / 2 + k * half * dx),
    Math.round(C / 2 + k * half * dy),
  )[3];

/** Largest distance from the canvas centre, and the bounding box, of the deep-red mark's pixels. */
function ink(r: Raster): {
  radius: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const out = { radius: 0, left: C, right: 0, top: C, bottom: 0 };
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) {
      const [red, green, blue, alpha] = pixelAt(r, x, y);
      if (alpha !== 255 || red < 0xc0 || green > 0x20 || blue > 0x20) continue;
      out.radius = Math.max(
        out.radius,
        Math.hypot(x + 0.5 - C / 2, y + 0.5 - C / 2),
      );
      out.left = Math.min(out.left, x);
      out.right = Math.max(out.right, x + 1);
      out.top = Math.min(out.top, y);
      out.bottom = Math.max(out.bottom, y + 1);
    }
  return out;
}

describe("APP_ICON_PRESETS", () => {
  it("is one table: macos is today's icon, the rest follow the brief", () => {
    expect(APP_ICON_PRESETS).toEqual({
      macos: {
        shape: "squircle",
        margin: 100 / 1024,
        markScale: 480 / 824,
        flat: false,
        opaque: false,
      },
      store: {
        shape: "square",
        margin: 0,
        markScale: 0.6,
        flat: true,
        opaque: true,
      },
      maskable: {
        shape: "square",
        margin: 0,
        markScale: 0.5,
        flat: true,
        opaque: true,
      },
      round: {
        shape: "circle",
        margin: 0.05,
        markScale: 0.55,
        flat: true,
        opaque: false,
      },
    });
    expect(APP_ICON_SHAPES).toEqual([
      "squircle",
      "rounded",
      "circle",
      "square",
    ]);
  });

  it("is frozen all the way down, so a caller cannot change every later default", () => {
    expect(Object.isFrozen(APP_ICON_PRESETS)).toBe(true);
    expect(Object.isFrozen(APP_ICON_PRESETS.macos)).toBe(true);
    expect(Object.isFrozen(APP_ICON_SHAPES)).toBe(true);
    const before = appIconSvg();
    expect(() => {
      (APP_ICON_PRESETS.macos as { margin: number }).margin = 0.3;
    }).toThrow(TypeError);
    expect(() => (APP_ICON_SHAPES as unknown as string[]).push("hex")).toThrow(
      TypeError,
    );
    expect(appIconSvg()).toBe(before);
    expect(() => appIconSvg({ shape: "hex" } as never)).toThrow(
      /app icon shape/,
    );
  });

  it("macos matches the APP_ICON constants, so the default stays Apple's grid", () => {
    expect(APP_ICON_PRESETS.macos.margin * C).toBe((C - APP_ICON.plate) / 2);
    expect(APP_ICON_PRESETS.macos.markScale * APP_ICON.plate).toBeCloseTo(
      APP_ICON.markBox,
      9,
    );
  });
});

describe("appIconSvg presets", () => {
  it("macos is the default, byte for byte, and an explicit option equal to its value changes nothing", () => {
    expect(appIconSvg({ preset: "macos" })).toBe(appIconSvg());
    expect(appIconSvg({ shape: "squircle", margin: 100 / 1024 })).toBe(
      appIconSvg(),
    );
  });

  it.each(["store", "maskable", "round"] as const)(
    "%s is pinned to its golden and is deterministic",
    (preset) => {
      const svg = appIconSvg({ preset });
      expect(svg).toBe(appIconSvg({ preset }));
      expectGolden(`brand/app-icon-${preset}.svg`, svg);
    },
  );

  it("lets explicit options override the preset", () => {
    expect(appIconSvg({ preset: "store" })).not.toContain("linearGradient");
    const raised = appIconSvg({ preset: "store", flat: false, opaque: false });
    expect(raised).toContain("linearGradient");
    expect(appIconSvg({ preset: "round", shape: "square", margin: 0 })).toBe(
      appIconSvg({
        shape: "square",
        margin: 0,
        markScale: 0.55,
        flat: true,
      }),
    );
  });
});

describe("appIconSvg geometry", () => {
  it("square at margin 0 is full bleed: the plate spans 0..1024 and the corner is plate colour", () => {
    const svg = appIconSvg({ shape: "square", margin: 0 });
    expect(svg).toContain('<rect x="0" y="0" width="1024" height="1024"');
    const r = rasterize(svg);
    for (const [x, y] of [
      [0, 0],
      [1023, 0],
      [0, 1023],
      [1023, 1023],
    ] as const)
      expect(pixelAt(r, x, y)[3]).toBe(255);
  });

  it("square keeps the default 100 unit margin with square corners when asked for no rounding", () => {
    const r = rasterize(appIconSvg({ shape: "square", flat: true }));
    expect(pixelAt(r, 99, 512)[3]).toBe(0);
    expect(pixelAt(r, 101, 512)[3]).toBe(255);
    expect(pixelAt(r, 101, 101)[3]).toBe(255); // no corner cut
    expect(pixelAt(r, 99, 99)[3]).toBe(0);
  });

  it("margin sets the plate: 0.2 of the canvas on each side leaves a 614.4 unit plate", () => {
    const svg = appIconSvg({ shape: "square", margin: 0.2, flat: true });
    expect(svg).toContain('x="204.8" y="204.8" width="614.4" height="614.4"');
    const r = rasterize(svg);
    expect(pixelAt(r, 202, 512)[3]).toBe(0);
    expect(pixelAt(r, 207, 512)[3]).toBe(255);
    expect(pixelAt(r, 821, 512)[3]).toBe(0);
    expect(pixelAt(r, 816, 512)[3]).toBe(255);
  });

  it("margin scales the squircle too, and 0 puts its flats on the canvas edge", () => {
    const r = rasterize(appIconSvg({ margin: 0, flat: true }));
    expect(pixelAt(r, 0, 512)[3]).toBe(255);
    expect(pixelAt(r, 512, 0)[3]).toBe(255);
    expect(pixelAt(r, 1023, 512)[3]).toBe(255);
    expect(pixelAt(r, 2, 2)[3]).toBe(0); // the corner is still cut
    for (let deg = 0; deg < 90; deg += 7.5) {
      const t = (deg * Math.PI) / 180;
      const dx = Math.cos(t) ** (2 / APP_ICON.exponent);
      const dy = Math.sin(t) ** (2 / APP_ICON.exponent);
      expect(alphaAt(r, C / 2, 0.985, dx, dy), `${deg} deg inside`).toBe(255);
    }
    expect(alphaAt(r, C / 2, 0.985, 0.995, 0.995)).toBe(0); // off the curve, in the cut corner
  });

  it("circle has radius plate/2 at the canvas centre", () => {
    const svg = appIconSvg({ preset: "round" });
    expect(svg).toContain('<circle cx="512" cy="512" r="460.8"');
    const r = rasterize(svg);
    const radius = 460.8;
    for (let deg = 0; deg < 360; deg += 15) {
      const t = (deg * Math.PI) / 180;
      expect(
        alphaAt(r, radius, 0.99, Math.cos(t), Math.sin(t)),
        `${deg} in`,
      ).toBe(255);
      expect(
        alphaAt(r, radius, 1.01, Math.cos(t), Math.sin(t)),
        `${deg} out`,
      ).toBe(0);
    }
    expect(pixelAt(r, 4, 4)[3]).toBe(0);
  });

  it("rounded uses cornerRadius as a fraction of the plate side (default 0.22)", () => {
    const svg = appIconSvg({ shape: "rounded", flat: true });
    expect(svg).toContain('width="824" height="824" rx="181.28"');
    expect(
      appIconSvg({ shape: "rounded", cornerRadius: 0.22, flat: true }),
    ).toBe(svg);
    // The arc's midpoint sits r(1 - 1/sqrt2) = 53.1 units in from the plate corner on the diagonal.
    const r = rasterize(svg);
    expect(pixelAt(r, 100 + 45, 100 + 45)[3]).toBe(0);
    expect(pixelAt(r, 100 + 61, 100 + 61)[3]).toBe(255);
    expect(pixelAt(r, 100 + 412, 100 + 2)[3]).toBe(255); // the flat top edge
  });

  it("cornerRadius 0 is sharp and 0.5 is a circle", () => {
    const sharp = rasterize(
      appIconSvg({ shape: "rounded", cornerRadius: 0, flat: true }),
    );
    expect(pixelAt(sharp, 102, 102)[3]).toBe(255);
    const round = rasterize(
      appIconSvg({ shape: "rounded", cornerRadius: 0.5, flat: true }),
    );
    expect(pixelAt(round, 140, 140)[3]).toBe(0);
    expect(pixelAt(round, 512, 140)[3]).toBe(255);
  });

  it("flat drops the sheen and the hairline; the default keeps both", () => {
    const flat = appIconSvg({ flat: true });
    expect(flat).not.toContain("linearGradient");
    expect(flat).not.toContain('stroke="#ffffff"');
    expect(flat.match(/<path/g)).toHaveLength(2); // plate + mark
    const raised = appIconSvg();
    expect(raised).toContain("linearGradient");
    expect(raised).toContain('stroke="#ffffff"');
    const [pr, pg, pb, pa] = pixelAt(rasterize(flat), 512, 140);
    expect([pr, pg, pb, pa]).toEqual([0x0a, 0x0a, 0x0a, 255]); // a solid plate, no sheen on top
  });

  it("opaque leaves no transparent pixel", () => {
    for (const preset of ["store", "maskable"] as const) {
      const r = rasterize(appIconSvg({ preset }));
      let transparent = 0;
      for (let i = 3; i < r.pixels.length; i += 4)
        if (r.pixels[i] !== 255) transparent++;
      expect(transparent, preset).toBe(0);
    }
    expect(
      pixelAt(rasterize(appIconSvg({ preset: "store", size: 64 })), 0, 0),
    ).toEqual([0x0a, 0x0a, 0x0a, 255]);
  });

  it("markScale sets the mark's box as a fraction of the plate side", () => {
    // The mark is square in its box and nearly fills it (the weight stroke is inside the fit).
    for (const [look, side] of [
      [{ markScale: 0.4 }, 0.4 * 824],
      [{ markScale: 0.7 }, 0.7 * 824],
      [{ shape: "square", margin: 0, markScale: 0.5 } as const, 0.5 * 1024],
    ] as const) {
      const box = ink(rasterize(appIconSvg(look)));
      expect(box.right - box.left, JSON.stringify(look)).toBeGreaterThan(
        side * 0.95,
      );
      expect(box.right - box.left).toBeLessThanOrEqual(side + 1);
      expect((box.left + box.right) / 2).toBeCloseTo(C / 2, 0);
    }
  });

  it("maskable keeps the mark inside the PWA safe zone: a circle of 0.8 of the canvas", () => {
    const safe = 0.4 * C;
    const half = (APP_ICON_PRESETS.maskable.markScale * C) / 2;
    expect(Math.hypot(half, half)).toBeLessThanOrEqual(safe); // the mark's box, corner to centre
    const measured = ink(rasterize(appIconSvg({ preset: "maskable" })));
    expect(measured.radius).toBeLessThanOrEqual(safe);
    expect(measured.radius).toBeGreaterThan(0.25 * C); // the measurement did see the mark
    // The store mark is larger than the safe zone allows, which is why maskable is its own preset.
    expect(
      Math.hypot(
        (APP_ICON_PRESETS.store.markScale * C) / 2,
        (APP_ICON_PRESETS.store.markScale * C) / 2,
      ),
    ).toBeGreaterThan(safe);
  });

  it("round keeps the mark inside the circle", () => {
    expect(ink(rasterize(appIconSvg({ preset: "round" }))).radius).toBeLessThan(
      0.9 * 460.8,
    );
  });
});

describe("appIconSvg option validation", () => {
  const bad =
    (opts: unknown): (() => string) =>
    () =>
      appIconSvg(opts as never);

  it("names the option and the allowed values", () => {
    for (const shape of ["blob", "", 5, null, {}, "constructor"])
      expect(bad({ shape })).toThrow(
        /^app icon shape must be one of squircle, rounded, circle, square/,
      );
    for (const preset of ["nope", "", 5, null, "constructor", "__proto__"])
      expect(bad({ preset })).toThrow(
        /^app icon preset must be one of macos, store, maskable, round/,
      );
  });

  it("bounds the numbers", () => {
    for (const margin of [-0.01, 0.41, Number.NaN, "0.1", null])
      expect(bad({ margin })).toThrow(
        /^app icon margin must be a number in 0\.\.0\.4/,
      );
    for (const markScale of [0.19, 0.91, Number.POSITIVE_INFINITY, "0.5", null])
      expect(bad({ markScale })).toThrow(
        /^app icon markScale must be a number in 0\.2\.\.0\.9/,
      );
    for (const cornerRadius of [-0.1, 0.51, Number.NaN, "0.2", null])
      expect(bad({ shape: "rounded", cornerRadius })).toThrow(
        /^app icon cornerRadius must be a number in 0\.\.0\.5/,
      );
    for (const margin of [0, 0.4]) expect(bad({ margin })).not.toThrow();
    for (const markScale of [0.2, 0.9])
      expect(bad({ markScale })).not.toThrow();
  });

  it("rejects cornerRadius with any shape but rounded, preset or not, instead of ignoring it", () => {
    for (const shape of ["squircle", "circle", "square"] as const)
      expect(bad({ shape, cornerRadius: 0.1 })).toThrow(
        new RegExp(`only applies to shape "rounded", got shape "${shape}"`),
      );
    expect(bad({ cornerRadius: 0.1 })).toThrow(/got shape "squircle"/);
    expect(bad({ preset: "store", cornerRadius: 0 })).toThrow(
      /got shape "square"/,
    );
    expect(
      bad({
        preset: "store",
        shape: "rounded",
        opaque: false,
        cornerRadius: 0.1,
      }),
    ).not.toThrow();
  });

  it("takes only booleans for flat and opaque", () => {
    for (const flat of [1, "yes", null])
      expect(bad({ flat })).toThrow(/^app icon flat must be true or false/);
    for (const opaque of [1, "yes", null])
      expect(bad({ opaque })).toThrow(/^app icon opaque must be true or false/);
  });

  it("rejects an explicit opaque: true unless the plate is a full-bleed square", () => {
    for (const opts of [
      { opaque: true },
      { opaque: true, shape: "square" },
      { opaque: true, margin: 0 },
      { preset: "store", shape: "circle", opaque: true },
      { preset: "store", margin: 0.05, opaque: true },
    ])
      expect(bad(opts)).toThrow(
        /^app icon opaque needs shape "square" and margin 0/,
      );
    expect(bad({ opaque: true, shape: "square", margin: 0 })).not.toThrow();
  });

  it("a preset's opaque never makes an override throw: it just stops applying", () => {
    expect(resolveAppIconLook({ preset: "store", margin: 0.05 })).toMatchObject(
      { shape: "square", margin: 0.05, opaque: false },
    );
    expect(
      resolveAppIconLook({ preset: "store", shape: "circle" }),
    ).toMatchObject({ shape: "circle", margin: 0, opaque: false });
    expect(
      resolveAppIconLook({ preset: "maskable", shape: "rounded" }),
    ).toMatchObject({ shape: "rounded", opaque: false });
    expect(resolveAppIconLook({ preset: "store" }).opaque).toBe(true);
    expect(resolveAppIconLook({ preset: "store", opaque: false }).opaque).toBe(
      false,
    );
    // the overridden icon is really a transparent-cornered circle
    const r = rasterize(appIconSvg({ preset: "store", shape: "circle" }));
    expect(pixelAt(r, 0, 0)[3]).toBe(0);
    expect(pixelAt(r, 512, 512)[3]).toBe(255);
    const inset = rasterize(appIconSvg({ preset: "store", margin: 0.05 }));
    expect(pixelAt(inset, 2, 2)[3]).toBe(0);
  });

  it("opaque needs an opaque background", () => {
    for (const background of [
      "rgba(10,10,10,0.5)",
      "#0a0a0a80",
      "rgba(0,0,0,0)",
    ])
      expect(bad({ preset: "store", background })).toThrow(
        /^app icon opaque needs an opaque background, got /,
      );
    expect(bad({ preset: "store", background: "#abc" })).not.toThrow();
    // not opaque: a translucent plate is the caller's choice, as before
    expect(bad({ background: "rgba(10,10,10,0.5)" })).not.toThrow();
  });

  it("checks the preset before the fields it supplies defaults for", () => {
    expect(() => resolveAppIconLook({ preset: "round" })).not.toThrow();
    expect(bad({ preset: "nope", shape: "blob" })).toThrow(
      /^app icon preset must be one of/,
    );
    expect(bad({ preset: "round", shape: "blob" })).toThrow(
      /^app icon shape must be one of/,
    );
  });

  it("rejects an array as the options object", () => {
    for (const opts of [[], [1]])
      expect(bad(opts)).toThrow(/^options must be an object, got /);
  });

  it("treats undefined options as absent", () => {
    expect(
      appIconSvg({
        preset: undefined,
        shape: undefined,
        cornerRadius: undefined,
        margin: undefined,
        markScale: undefined,
        flat: undefined,
        opaque: undefined,
      } as never),
    ).toBe(appIconSvg());
  });
});
