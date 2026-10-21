import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  animatedGradientCss,
  gradient,
  gradientSvg,
} from "../../src/gradient/index.js";
import type {
  ConicSpec,
  LinearSpec,
  RadialSpec,
} from "../../src/gradient/index.js";

/**
 * Boundary validation: a gradient spec can come from untyped JSON, so EVERY field of
 * EVERY kind must fail with a VisError that names the field, never a TypeError from a
 * property read or an iteration, and never a silent default (`null` is not `undefined`).
 */

type Path = readonly (string | number)[];
interface Case {
  /** Where the bad value goes, from the spec root. */
  path: Path;
  /** What the error message must mention. */
  name: string;
  bad: readonly unknown[];
}

const STOPS = ["#000000", "#ffffff"];
const POINT = { at: [0.5, 0.5], color: "#ff0000" };

const LINEAR: LinearSpec = { kind: "linear", stops: STOPS };
const RADIAL: RadialSpec = { kind: "radial", stops: STOPS };
const CONIC: ConicSpec = { kind: "conic", stops: STOPS };

const VALID: Record<string, object> = {
  linear: LINEAR,
  radial: RADIAL,
  conic: CONIC,
  mesh: { kind: "mesh", base: "#000000", points: [POINT] },
  aurora: { kind: "aurora", palette: ["#ff0000", "#00ff00"] },
  banded: { kind: "banded", stops: STOPS, bands: 4 },
  layers: { kind: "layers", layers: [{ kind: "linear", stops: STOPS }] },
  freeform: { kind: "freeform", points: [POINT] },
  fluted: { kind: "fluted", source: { kind: "linear", stops: STOPS } },
};

const NUM = [null, "1", {}, [], true, Number.NaN];
const FLAG = [null, 1, "true", {}, []];
const PAIR = [
  null,
  5,
  "ab",
  {},
  [],
  [0.5],
  [0.5, 0.5, 0.5],
  ["a", "b"],
  [null, 0.5],
  [Number.NaN, 0.5],
  [2, 0.5],
];
const BAD_STOP_LISTS = [
  undefined,
  null,
  5,
  "x",
  {},
  [],
  ["#000000"],
  [null, "#ffffff"],
  [5, "#ffffff"],
  [{}, "#ffffff"],
  [{ color: 5 }, "#ffffff"],
  ["#000000", "nope"],
  [
    { color: "#000000", at: null },
    { color: "#ffffff", at: 1 },
  ],
  [
    { color: "#000000", at: "0" },
    { color: "#ffffff", at: 1 },
  ],
  [
    { color: "#000000", at: 0, opacity: null },
    { color: "#ffffff", at: 1 },
  ],
  [
    { color: "#000000", at: 0, opacity: "1" },
    { color: "#ffffff", at: 1 },
  ],
  [
    { color: "#000000", at: Number.NaN },
    { color: "#ffffff", at: 1 },
  ],
];
const BAD_POINT_LISTS = [
  undefined,
  null,
  [],
  5,
  "x",
  {},
  [null],
  [5],
  ["x"],
  [[]],
  [{}],
  [{ at: [0.5, 0.5] }],
  [{ color: "#ff0000" }],
  [{ at: {}, color: "#ff0000" }],
  [{ at: [0.5, 0.5], color: 5 }],
  [{ at: [0.5, 0.5], color: "nope" }],
];
const BAD_BLEND = [null, "bogus", 5, {}];
const BAD_SPREAD = [null, "1", 0, -1, Number.NaN];
const BAD_UNIT = [null, "1", 2, -1, Number.NaN];

const directional = (): Case[] => [
  { path: ["stops"], name: "stop", bad: BAD_STOP_LISTS },
  { path: ["repeat"], name: "repeat", bad: FLAG },
  { path: ["reverse"], name: "reverse", bad: FLAG },
];

/** Every kind's own fields (the base fields are added for every kind below). */
const KIND_CASES: Record<string, Case[]> = {
  linear: [...directional(), { path: ["angle"], name: "angle", bad: NUM }],
  radial: [
    ...directional(),
    { path: ["shape"], name: "shape", bad: [null, 5, "square", {}] },
    { path: ["at"], name: "at", bad: PAIR },
    { path: ["radius"], name: "radius", bad: [...NUM, 0, -1] },
  ],
  conic: [
    ...directional(),
    { path: ["from"], name: "from", bad: [...NUM, Number.POSITIVE_INFINITY] },
    { path: ["at"], name: "at", bad: PAIR },
  ],
  mesh: [
    { path: ["base"], name: "base", bad: [undefined, null, 5, "nope", {}] },
    { path: ["points"], name: "point", bad: BAD_POINT_LISTS },
    { path: ["points", 0, "at"], name: "at", bad: PAIR },
    { path: ["points", 0, "radius"], name: "radius", bad: BAD_SPREAD },
  ],
  aurora: [
    {
      path: ["palette"],
      name: "palette",
      bad: [
        undefined,
        null,
        [],
        5,
        "x",
        {},
        [1],
        [{}],
        [null],
        ["nope"],
        [["#ff0000"]],
      ],
    },
    {
      path: ["blobs"],
      name: "blobs",
      bad: [null, "3", 0, 1.5, 65, Number.NaN],
    },
    { path: ["base"], name: "base", bad: [null, 5, "nope", {}] },
  ],
  banded: [
    { path: ["stops"], name: "stop", bad: BAD_STOP_LISTS },
    {
      path: ["bands"],
      name: "bands",
      bad: [undefined, null, "3", 1, 2.5, 257, Number.NaN],
    },
    { path: ["angle"], name: "angle", bad: NUM },
  ],
  layers: [
    {
      path: ["layers"],
      name: "layer",
      bad: [undefined, null, [], 5, "x", {}],
    },
    { path: ["layers", 0], name: "spec", bad: [null, 5, "x", true] },
    { path: ["layers", 0, "kind"], name: "kind", bad: [undefined, 5, "plaid"] },
    { path: ["layers", 0, "angle"], name: "angle", bad: NUM },
    { path: ["layers", 0, "stops"], name: "stop", bad: BAD_STOP_LISTS },
    { path: ["blend"], name: "blend", bad: BAD_BLEND },
  ],
  freeform: [
    { path: ["points"], name: "point", bad: BAD_POINT_LISTS },
    { path: ["points", 0, "at"], name: "at", bad: PAIR },
    { path: ["points", 0, "spread"], name: "spread", bad: BAD_SPREAD },
    {
      path: ["softness"],
      name: "softness",
      bad: [null, "1", {}, -1, 2, Number.NaN],
    },
    { path: ["base"], name: "base", bad: [null, 5, "nope", {}] },
  ],
  fluted: [
    {
      path: ["source"],
      name: "source",
      bad: [undefined, null, 5, "x", true],
    },
    { path: ["source", "kind"], name: "kind", bad: [undefined, 5, "plaid"] },
    { path: ["source", "angle"], name: "angle", bad: NUM },
    {
      path: ["reeds"],
      name: "reeds",
      bad: [null, "3", 1, 2.5, 257, Number.NaN],
    },
    { path: ["direction"], name: "direction", bad: [null, 5, "diagonal", {}] },
    { path: ["angle"], name: "angle", bad: NUM },
    { path: ["refraction"], name: "refraction", bad: BAD_UNIT },
    { path: ["shade"], name: "shade", bad: BAD_UNIT },
  ],
};

/** The fields every kind takes (`GradientBase`). */
const BASE_CASES: Case[] = [
  {
    path: ["size"],
    name: "size",
    bad: [
      null,
      5,
      "x",
      [],
      true,
      {},
      { width: 1 },
      { height: 1 },
      { width: "1", height: 1 },
      { width: 1, height: null },
      { width: 0, height: 1 },
      { width: 0.5, height: 1 },
      { width: 1, height: -1 },
      { width: Number.NaN, height: 1 },
      { width: 1, height: Number.POSITIVE_INFINITY },
      { width: 16385, height: 1 },
      { width: 1, height: 16385 },
    ],
  },
  {
    path: ["grain"],
    name: "grain",
    bad: [null, "x", {}, [], true, Number.NaN, -1, 2],
  },
  {
    path: ["overlay"],
    name: "overlay",
    bad: [null, 5, "x", [], true, {}],
  },
  {
    path: ["seed"],
    name: "seed",
    bad: [null, "1", 1.5, Number.NaN, {}, 1e21],
  },
  {
    path: ["idPrefix"],
    name: "idPrefix",
    bad: [null, 5, "", "a b", "1a", 'a"b', "x".repeat(81), {}, []],
  },
];

const OVERLAY_CASES: Case[] = [
  {
    path: ["overlay", "image"],
    name: "overlay.image",
    bad: [undefined, null, 5, {}, [], true],
  },
  {
    path: ["overlay", "opacity"],
    name: "overlay.opacity",
    bad: [null, "1", {}, 2, -1, Number.NaN],
  },
  { path: ["overlay", "blend"], name: "blend", bad: BAD_BLEND },
];

function clone<T>(v: T): T {
  return structuredClone(v);
}

/** `root` with `value` at `path`; `undefined` deletes the key (a missing field). */
function setAt(root: unknown, path: Path, value: unknown): unknown {
  const out = clone(root) as Record<string | number, unknown>;
  let node = out;
  for (const key of path.slice(0, -1))
    node = node[key] as Record<string | number, unknown>;
  const last = path[path.length - 1]!;
  if (value === undefined) Reflect.deleteProperty(node, last);
  else node[last] = value;
  return out;
}

function show(v: unknown): string {
  return typeof v === "number" || v === undefined
    ? String(v)
    : JSON.stringify(v);
}

function expectVisError(run: () => unknown, name: string): void {
  let caught: unknown;
  try {
    run();
  } catch (e) {
    caught = e;
  }
  expect(caught, "must throw").toBeInstanceOf(VisError);
  expect((caught as VisError).message).toContain(name);
}

describe("gradient spec boundary validation (every kind x every field)", () => {
  for (const [kind, own] of Object.entries(KIND_CASES)) {
    const valid = VALID[kind];
    describe(kind, () => {
      it("renders the valid baseline", () => {
        expect(() => gradient(valid as never)).not.toThrow();
      });

      for (const c of [...own, ...BASE_CASES]) {
        it.each(c.bad.map((bad) => [show(bad), bad] as const))(
          `rejects ${c.path.join(".")} = %s`,
          (_label, bad) => {
            expectVisError(() => {
              gradient(setAt(valid, c.path, bad) as never);
            }, c.name);
          },
        );
      }

      const withOverlay = setAt(valid, ["overlay"], { image: "a.png" });
      it("renders the valid baseline with an overlay", () => {
        expect(() => gradient(withOverlay as never)).not.toThrow();
      });
      for (const c of OVERLAY_CASES) {
        it.each(c.bad.map((bad) => [show(bad), bad] as const))(
          `rejects ${c.path.join(".")} = %s`,
          (_label, bad) => {
            expectVisError(() => {
              gradient(setAt(withOverlay, c.path, bad) as never);
            }, c.name);
          },
        );
      }
    });
  }

  it.each([
    ["null", null],
    ["a number", 5],
    ["a string", "linear"],
    ["undefined", undefined],
  ])("rejects a spec that is %s", (_label, spec) => {
    expectVisError(() => gradient(spec as never), "spec");
  });

  it("rejects a missing or non-string kind, naming `kind`", () => {
    for (const kind of [undefined, null, 5, {}, ["linear"]])
      expectVisError(() => gradient({ kind, stops: STOPS } as never), "kind");
  });

  it("gradientSvg rejects a bad spec and a bad size override with VisError", () => {
    expectVisError(() => gradientSvg(null as never), "spec");
    expectVisError(
      () => gradientSvg(LINEAR, { width: 16385, height: 1 }),
      "size",
    );
    expectVisError(() => gradientSvg(LINEAR, null as never), "size");
  });

  it("animatedGradientCss rejects a bad spec with VisError, in every mode", () => {
    for (const kind of ["rotate", "shift", "hue"] as const) {
      expectVisError(
        () => animatedGradientCss(null as never, { kind }),
        "spec",
      );
      expectVisError(
        () =>
          animatedGradientCss(setAt(LINEAR, ["stops"], 5) as never, {
            kind,
          }),
        "stop",
      );
    }
    expectVisError(
      () =>
        animatedGradientCss(setAt(CONIC, ["at"], {}) as never, {
          kind: "rotate",
        }),
      "at",
    );
  });
});

describe("gradient spec boundary validation: accepted edges stay accepted", () => {
  it("takes the documented size limits, 1 and 16384, on each side", () => {
    expect(() =>
      gradient({ ...LINEAR, size: { width: 1, height: 1 } }),
    ).not.toThrow();
    expect(() =>
      gradient({
        ...LINEAR,
        size: { width: 16384, height: 16384 },
      }),
    ).not.toThrow();
  });

  it("takes an idPrefix up to 80 characters", () => {
    const idPrefix = `a${"b".repeat(79)}`;
    expect(gradient({ ...LINEAR, idPrefix }).fill).toBe(`url(#${idPrefix}-g)`);
  });

  it("still defaults every optional field when it is undefined", () => {
    const explicit = gradient({
      kind: "radial",
      stops: STOPS,
      shape: undefined,
      at: undefined,
      radius: undefined,
      repeat: undefined,
      reverse: undefined,
      size: undefined,
      grain: undefined,
      overlay: undefined,
      seed: undefined,
      idPrefix: undefined,
    } as never);
    expect(explicit).toEqual(gradient(RADIAL as never));
  });
});
