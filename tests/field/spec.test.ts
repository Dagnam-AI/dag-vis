import { describe, expect, it } from "vitest";
import { VisError } from "../../src/core/index.js";
import { FLOW_SHAPES, resolveField } from "../../src/field/spec.js";

/** An array with a hole at `hole` (a literal `[, x]` trips no-sparse-arrays), so validators must read by index. */
function holey(hole: number, ...rest: unknown[]): unknown[] {
  const a = new Array<unknown>(rest.length + 1);
  let j = 0;
  for (let i = 0; i < a.length; i++) if (i !== hole) a[i] = rest[j++];
  return a;
}
const PAL = ["#000", "#fff"];
const flow = (extra: Record<string, unknown> = {}) => ({
  kind: "flow",
  palette: PAL,
  ...extra,
});
const fluid = (extra: Record<string, unknown> = {}) => ({
  kind: "fluid",
  points: [{ at: [0, 0], color: "#000" }],
  ...extra,
});
const fluted = (extra: Record<string, unknown> = {}) => ({
  kind: "fluted",
  source: flow(),
  ...extra,
});

describe("resolveField", () => {
  it("fills flow defaults", () => {
    const r = resolveField({ kind: "flow", palette: ["#000", "#fff"] });
    expect(r.kind).toBe("flow");
    if (r.kind !== "flow") throw new Error("unreachable");
    expect(r.shape).toBe("noise");
    expect(r.warp).toEqual({ octaves: 3, strength: 1, scale: 1 });
    expect(r.scale).toBe(1);
    expect(r.rotation).toBe(0);
    expect(r.vignette).toBe(0);
    expect(r.highlight).toBeNull();
    expect(r.grain).toBe(0.3);
    expect(r.animatedGrain).toBe(true);
    expect(r.seed).toBe(1);
  });

  it("resolves a highlight with its colour parsed and the default radius", () => {
    const r = resolveField({
      kind: "flow",
      palette: ["#000", "#fff"],
      light: {
        vignette: 0.4,
        highlight: { at: [0.8, 0.2], strength: 0.5, color: "#ff0000" },
      },
    });
    if (r.kind !== "flow") throw new Error("unreachable");
    expect(r.vignette).toBe(0.4);
    expect(r.highlight).toEqual({
      at: [0.8, 0.2],
      strength: 0.5,
      radius: 0.5,
      color: { r: 1, g: 0, b: 0, a: 1 },
    });
  });

  it("defaults the highlight strength and colour", () => {
    const r = resolveField(flow({ light: { highlight: { at: [0, 0] } } }));
    if (r.kind !== "flow") throw new Error("unreachable");
    expect(r.highlight?.strength).toBe(0.4);
    expect(r.highlight?.color).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it("resolves fluid points, base defaults to the mean point colour", () => {
    const r = resolveField({
      kind: "fluid",
      points: [
        { at: [0, 0], color: "#000000" },
        { at: [1, 1], color: "#ffffff", spread: 2 },
      ],
    });
    if (r.kind !== "fluid") throw new Error("unreachable");
    expect(r.points[0]).toEqual({
      at: [0, 0],
      color: { r: 0, g: 0, b: 0, a: 1 },
      spread: 1,
    });
    expect(r.points[1]?.spread).toBe(2);
    expect(r.softness).toBe(0.35);
    expect(r.drift).toBe(0.08);
    expect(r.base).toEqual({ r: 0.5, g: 0.5, b: 0.5, a: 1 });
  });

  it("parses an explicit fluid base", () => {
    const r = resolveField(fluid({ base: "#ff0000" }));
    if (r.kind !== "fluid") throw new Error("unreachable");
    expect(r.base).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("resolves fluted and forces the source grain to 0", () => {
    const r = resolveField({
      kind: "fluted",
      source: { kind: "flow", palette: ["#000", "#fff"], grain: 0.9 },
      reeds: 12,
      direction: "horizontal",
    });
    if (r.kind !== "fluted") throw new Error("unreachable");
    expect(r.reeds).toBe(12);
    expect(r.direction).toBe("horizontal");
    expect(r.refraction).toBe(0.6);
    expect(r.shade).toBe(0.5);
    expect(r.jitter).toBe(0.3);
    expect(r.source.grain).toBe(0);
  });

  it("resolves a fluted fluid source and keeps the outer grain", () => {
    const r = resolveField(fluted({ source: fluid(), grain: 0.7 }));
    if (r.kind !== "fluted") throw new Error("unreachable");
    expect(r.source.kind).toBe("fluid");
    expect(r.source.grain).toBe(0);
    expect(r.grain).toBe(0.7);
    expect(r.direction).toBe("vertical");
    expect(r.reeds).toBe(24);
  });

  it("exposes the shape enum in spec order", () => {
    expect(FLOW_SHAPES).toEqual([
      "swirl",
      "wave",
      "aurora",
      "bloom",
      "band",
      "noise",
    ]);
  });

  it("accepts every shape and the numeric boundaries", () => {
    for (const shape of FLOW_SHAPES)
      expect(resolveField(flow({ shape }))).toMatchObject({ shape });
    const r = resolveField(
      flow({
        seed: 4294967295,
        grain: 1,
        scale: 10,
        rotation: -2 * Math.PI,
        warp: { octaves: 5, strength: 3, scale: 0.05 },
      }),
    );
    expect(r).toMatchObject({ seed: 4294967295, grain: 1, scale: 10 });
    expect(resolveField(flow({ seed: 0, animatedGrain: false }))).toMatchObject(
      { seed: 0, animatedGrain: false },
    );
  });

  it("copies the palette so a later edit of the spec has no effect", () => {
    const palette = ["#000", "#fff"];
    const r = resolveField({ kind: "flow", palette });
    palette[0] = "#f00";
    if (r.kind !== "flow") throw new Error("unreachable");
    expect(r.palette).toEqual(["#000", "#fff"]);
  });

  it("does not mutate the spec it is given", () => {
    const spec = fluted({ source: flow({ grain: 0.9 }) });
    const before = JSON.stringify(spec);
    resolveField(spec);
    expect(JSON.stringify(spec)).toBe(before);
  });

  it.each<[string, unknown, RegExp]>([
    ["not an object", 3, /field spec/],
    ["null", null, /field spec/],
    ["an array", [], /field spec/],
    ["unknown kind", { kind: "nope" }, /kind/],
    ["missing kind", {}, /kind/],
    ["kind __proto__", { kind: "__proto__" }, /kind/],
    ["kind toString", { kind: "toString" }, /kind/],
    ["kind constructor", { kind: "constructor" }, /kind/],
    ["kind not a string", { kind: 1 }, /kind/],
    ["palette too short", flow({ palette: ["#fff"] }), /palette/],
    [
      "palette too long",
      flow({
        palette: ["#000", "#111", "#222", "#333", "#444", "#555", "#666"],
      }),
      /palette/,
    ],
    ["palette missing", { kind: "flow" }, /palette/],
    ["palette null", flow({ palette: null }), /palette/],
    [
      "palette entry not a string",
      flow({ palette: ["#000", 5] }),
      /palette\[1\]/,
    ],
    [
      "palette entry unparseable",
      flow({ palette: ["#000", "teal-ish"] }),
      /palette\[1\]/,
    ],
    ["palette sparse", flow({ palette: holey(0, "#fff") }), /palette\[0\]/],
    ["bad shape", flow({ shape: "spiral" }), /shape/],
    ["shape null", flow({ shape: null }), /shape/],
    ["shape __proto__", flow({ shape: "__proto__" }), /shape/],
    ["shape toString", flow({ shape: "toString" }), /shape/],
    ["octaves not integer", flow({ warp: { octaves: 2.5 } }), /warp\.octaves/],
    ["octaves out of range", flow({ warp: { octaves: 9 } }), /warp\.octaves/],
    ["strength negative", flow({ warp: { strength: -1 } }), /warp\.strength/],
    ["warp scale Infinity", flow({ warp: { scale: Infinity } }), /warp\.scale/],
    ["warp not an object", flow({ warp: 1 }), /warp/],
    ["warp null", flow({ warp: null }), /warp/],
    ["light not an object", flow({ light: "x" }), /light/],
    ["vignette > 1", flow({ light: { vignette: 2 } }), /light\.vignette/],
    ["scale zero", flow({ scale: 0 }), /scale/],
    ["rotation NaN", flow({ rotation: Number.NaN }), /rotation/],
    ["rotation Infinity", flow({ rotation: Infinity }), /rotation/],
    ["rotation a string", flow({ rotation: "1" }), /rotation/],
    ["grain > 1", flow({ grain: 2 }), /grain/],
    ["grain NaN", flow({ grain: Number.NaN }), /grain/],
    ["grain null", flow({ grain: null }), /grain/],
    [
      "animatedGrain not boolean",
      flow({ animatedGrain: "yes" }),
      /animatedGrain/,
    ],
    ["animatedGrain null", flow({ animatedGrain: null }), /animatedGrain/],
    ["seed negative", flow({ seed: -1 }), /seed/],
    ["seed fractional", flow({ seed: 1.5 }), /seed/],
    ["seed NaN", flow({ seed: Number.NaN }), /seed/],
    ["seed unsafe", flow({ seed: 2 ** 53 }), /seed/],
    ["seed above 32 bits", flow({ seed: 4294967296 }), /seed/],
    ["seed null", flow({ seed: null }), /seed/],
    [
      "highlight at not a pair",
      flow({ light: { highlight: { at: [1], strength: 0.5 } } }),
      /highlight\.at/,
    ],
    [
      "highlight at missing",
      flow({ light: { highlight: { strength: 0.5 } } }),
      /highlight\.at/,
    ],
    [
      "highlight at out of range",
      flow({ light: { highlight: { at: [3, 0], strength: 0.5 } } }),
      /highlight\.at\[0\]/,
    ],
    [
      "highlight at NaN",
      flow({ light: { highlight: { at: [0, Number.NaN] } } }),
      /highlight\.at\[1\]/,
    ],
    [
      "highlight at sparse",
      flow({ light: { highlight: { at: holey(1, 0) } } }),
      /highlight\.at\[1\]/,
    ],
    ["highlight not an object", flow({ light: { highlight: 2 } }), /highlight/],
    ["highlight null", flow({ light: { highlight: null } }), /highlight/],
    [
      "highlight strength > 1",
      flow({ light: { highlight: { at: [0, 0], strength: 2 } } }),
      /highlight\.strength/,
    ],
    [
      "highlight radius zero",
      flow({ light: { highlight: { at: [0, 0], radius: 0 } } }),
      /highlight\.radius/,
    ],
    [
      "highlight colour unparseable",
      flow({ light: { highlight: { at: [0, 0], color: "??" } } }),
      /highlight\.color/,
    ],
    ["fluid no points", { kind: "fluid", points: [] }, /points/],
    ["fluid points missing", { kind: "fluid" }, /points/],
    [
      "fluid too many points",
      {
        kind: "fluid",
        points: Array.from({ length: 9 }, () => ({
          at: [0, 0],
          color: "#000",
        })),
      },
      /points/,
    ],
    ["fluid point not object", { kind: "fluid", points: [1] }, /points\[0\]/],
    [
      "fluid point sparse",
      { kind: "fluid", points: holey(0, { at: [0, 0], color: "#000" }) },
      /points\[0\]/,
    ],
    [
      "fluid point colour not string",
      { kind: "fluid", points: [{ at: [0, 0], color: 1 }] },
      /points\[0\]\.color/,
    ],
    [
      "fluid point at bad",
      { kind: "fluid", points: [{ at: [0], color: "#000" }] },
      /points\[0\]\.at/,
    ],
    [
      "fluid point spread zero",
      { kind: "fluid", points: [{ at: [0, 0], color: "#000", spread: 0 }] },
      /points\[0\]\.spread/,
    ],
    ["fluid softness zero", fluid({ softness: 0 }), /softness/],
    ["fluid drift > 0.5", fluid({ drift: 1 }), /drift/],
    ["fluid base unparseable", fluid({ base: "???" }), /base/],
    ["fluid base null", fluid({ base: null }), /base/],
    ["fluted nested fluted", { kind: "fluted", source: fluted() }, /source/],
    ["fluted source missing", { kind: "fluted" }, /source/],
    ["fluted source not an object", { kind: "fluted", source: 3 }, /source/],
    [
      "fluted source bad palette",
      fluted({ source: flow({ palette: [] }) }),
      /source/,
    ],
    ["fluted bad direction", fluted({ direction: "angle" }), /direction/],
    ["fluted reeds too few", fluted({ reeds: 1 }), /reeds/],
    ["fluted reeds fractional", fluted({ reeds: 2.5 }), /reeds/],
    ["fluted refraction > 1", fluted({ refraction: 2 }), /refraction/],
    ["fluted shade NaN", fluted({ shade: Number.NaN }), /shade/],
    ["fluted jitter negative", fluted({ jitter: -1 }), /jitter/],
  ])("rejects %s with a VisError naming the parameter", (_name, spec, name) => {
    expect(() => resolveField(spec)).toThrow(VisError);
    expect(() => resolveField(spec)).toThrow(name);
  });
});
