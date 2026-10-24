import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { coverSpec } from "../../src/scene/cover.js";
import type { CoverChoices, CoverInput } from "../../src/scene/cover.js";
import {
  parseCoverChoices,
  parseCoverInput,
} from "../../src/scene/cover-parse.js";

const base = { item: "hello-world", theme: "dark", variant: "card" } as const;
const long = "x".repeat(201);
const max = "x".repeat(200);

/** The message of the VisError `run` throws; fails the test when it throws nothing else. */
function message(run: () => unknown): string {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(VisError);
    return (e as VisError).message;
  }
  throw new Error("expected a VisError");
}

describe("parseCoverInput: accepts", () => {
  it.each<[string, CoverInput]>([
    ["the three required fields", { ...base }],
    ["a light banner", { item: "a", theme: "light", variant: "banner" }],
    ["a family", { ...base, family: "course:ai/nn" }],
    ["a null family", { ...base, family: null }],
    ["index 0 and count 1", { ...base, index: 0, count: 1 }],
    ["a large ordered family", { ...base, index: 40, count: 41 }],
    ["a seed", { ...base, seed: "abc12345" }],
    ["an empty seed (a cleared editor field)", { ...base, seed: "" }],
    ["a null seed", { ...base, seed: null }],
    ["hue at its lower bound", { ...base, hue: -15 }],
    ["hue at its upper bound", { ...base, hue: 15 }],
    ["hue 0", { ...base, hue: 0 }],
    ["a null hue", { ...base, hue: null }],
    ["region at its lower bound", { ...base, region: 0 }],
    ["region at its upper bound", { ...base, region: 4 }],
    ["a null region", { ...base, region: null }],
    ["intensity at its lower bound", { ...base, intensity: 0.6 }],
    ["intensity at its upper bound", { ...base, intensity: 1.4 }],
    ["a null intensity", { ...base, intensity: null }],
    [
      "200-character strings",
      { item: max, family: max, seed: max, theme: "dark", variant: "card" },
    ],
    [
      "every field",
      {
        family: "tag:ml",
        item: "post-a",
        index: 2,
        count: 6,
        theme: "light",
        variant: "banner",
        seed: "s",
        hue: -3.5,
        region: 3,
        intensity: 1.1,
      },
    ],
  ])("%s, returning exactly the input", (_label, input) => {
    expect(parseCoverInput(input)).toEqual(input);
  });

  it("omits an undefined optional field instead of copying the key", () => {
    const parsed = parseCoverInput({ ...base, hue: undefined });
    expect(Object.keys(parsed).sort()).toEqual(["item", "theme", "variant"]);
  });

  it("returns a fresh object and leaves the input untouched", () => {
    const input = { ...base, hue: 5, family: "f" };
    const snapshot = JSON.stringify(input);
    const parsed = parseCoverInput(input);
    expect(parsed).not.toBe(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(Object.keys(input)).toEqual([
      "item",
      "theme",
      "variant",
      "hue",
      "family",
    ]);
  });

  it("accepts a null-prototype object, as JSON-like parsers produce", () => {
    const input = Object.assign(Object.create(null) as object, base);
    expect(parseCoverInput(input)).toEqual(base);
  });

  it("accepts JSON.parse output", () => {
    const text = JSON.stringify({ ...base, hue: 15, region: 4 });
    expect(parseCoverInput(JSON.parse(text))).toEqual(JSON.parse(text));
  });
});

describe("parseCoverInput: rejects, naming the field", () => {
  it.each<[string, unknown, string]>([
    ["null", null, "cover: expected a plain object, got null"],
    ["an array", [], "cover: expected a plain object, got array"],
    ["an array of fields", [base], "cover: expected a plain object, got array"],
    ["a string", "item", 'cover: expected a plain object, got "item"'],
    ["a number", 3, "cover: expected a plain object, got 3"],
    ["undefined", undefined, "cover: expected a plain object, got undefined"],
    [
      "a class instance",
      new (class Cover {
        item = "a";
        theme = "dark";
        variant = "card";
      })(),
      "cover: expected a plain object, got object",
    ],
    ["a Date", new Date(0), "cover: expected a plain object, got object"],
    ["an unknown key", { ...base, extra: 1 }, 'cover: unknown key "extra"'],
    ["a misspelt key", { ...base, hues: 3 }, 'cover: unknown key "hues"'],
    [
      "kind (the frontend's, not dag-vis's)",
      { ...base, kind: "generated" },
      'cover: unknown key "kind"',
    ],
    [
      "field_preset (the importer's, not a cover field)",
      { ...base, field_preset: "lunar" },
      'cover: unknown key "field_preset"',
    ],
    [
      "an own __proto__ key",
      JSON.parse(
        '{"item":"a","theme":"dark","variant":"card","__proto__":{"hue":1}}',
      ),
      'cover: unknown key "__proto__"',
    ],
    [
      "a constructor key",
      { ...base, constructor: "x" },
      'cover: unknown key "constructor"',
    ],
    [
      "a symbol key",
      { ...base, [Symbol("s")]: 1 },
      "cover: unknown key symbol",
    ],
    [
      "a missing item",
      { theme: "dark", variant: "card" },
      "cover.item: expected a non-empty string of at most 200 characters, got undefined",
    ],
    [
      "an empty item",
      { ...base, item: "" },
      'cover.item: expected a non-empty string of at most 200 characters, got ""',
    ],
    [
      "a numeric item",
      { ...base, item: 7 },
      "cover.item: expected a non-empty string of at most 200 characters, got 7",
    ],
    [
      "a null item",
      { ...base, item: null },
      "cover.item: expected a non-empty string of at most 200 characters, got null",
    ],
    [
      "a 201-character item",
      { ...base, item: long },
      "cover.item: expected a non-empty string of at most 200 characters, got",
    ],
    [
      "a missing theme",
      { item: "a", variant: "card" },
      'cover.theme: expected "light" or "dark", got undefined',
    ],
    [
      "theme auto",
      { ...base, theme: "auto" },
      'cover.theme: expected "light" or "dark", got "auto"',
    ],
    [
      "a null theme",
      { ...base, theme: null },
      'cover.theme: expected "light" or "dark", got null',
    ],
    [
      "a missing variant",
      { item: "a", theme: "dark" },
      'cover.variant: expected "card" or "banner", got undefined',
    ],
    [
      "variant hero",
      { ...base, variant: "hero" },
      'cover.variant: expected "card" or "banner", got "hero"',
    ],
    [
      "an empty family",
      { ...base, family: "" },
      'cover.family: expected a non-empty string of at most 200 characters, got ""',
    ],
    [
      "a numeric family",
      { ...base, family: 1 },
      "cover.family: expected a non-empty string of at most 200 characters, got 1",
    ],
    [
      "a 201-character family",
      { ...base, family: long },
      "cover.family: expected a non-empty string of at most 200 characters, got",
    ],
    [
      "a numeric seed",
      { ...base, seed: 5 },
      "cover.seed: expected a string of at most 200 characters, got 5",
    ],
    [
      "a 201-character seed",
      { ...base, seed: long },
      "cover.seed: expected a string of at most 200 characters, got",
    ],
    [
      "index -1",
      { ...base, index: -1 },
      "cover.index: expected an integer >= 0, got -1",
    ],
    [
      "index 1.5",
      { ...base, index: 1.5 },
      "cover.index: expected an integer >= 0, got 1.5",
    ],
    [
      "a string index",
      { ...base, index: "1" },
      'cover.index: expected an integer >= 0, got "1"',
    ],
    [
      "a null index",
      { ...base, index: null },
      "cover.index: expected an integer >= 0, got null",
    ],
    [
      "an infinite index",
      { ...base, index: Infinity },
      "cover.index: expected an integer >= 0, got Infinity",
    ],
    [
      "count 0",
      { ...base, count: 0 },
      "cover.count: expected an integer >= 1, got 0",
    ],
    [
      "count 2.5",
      { ...base, count: 2.5 },
      "cover.count: expected an integer >= 1, got 2.5",
    ],
    [
      "a null count",
      { ...base, count: null },
      "cover.count: expected an integer >= 1, got null",
    ],
    [
      "NaN count",
      { ...base, count: NaN },
      "cover.count: expected an integer >= 1, got NaN",
    ],
    [
      "hue 15.0001",
      { ...base, hue: 15.0001 },
      "cover.hue: expected a number in -15..15, got 15.0001",
    ],
    [
      "hue 20",
      { ...base, hue: 20 },
      "cover.hue: expected a number in -15..15, got 20",
    ],
    [
      "hue -15.5",
      { ...base, hue: -15.5 },
      "cover.hue: expected a number in -15..15, got -15.5",
    ],
    [
      "a string hue",
      { ...base, hue: "10" },
      'cover.hue: expected a number in -15..15, got "10"',
    ],
    [
      "NaN hue",
      { ...base, hue: NaN },
      "cover.hue: expected a number in -15..15, got NaN",
    ],
    [
      "Infinity hue",
      { ...base, hue: Infinity },
      "cover.hue: expected a number in -15..15, got Infinity",
    ],
    [
      "-Infinity hue",
      { ...base, hue: -Infinity },
      "cover.hue: expected a number in -15..15, got -Infinity",
    ],
    [
      "a boolean hue",
      { ...base, hue: true },
      "cover.hue: expected a number in -15..15, got true",
    ],
    [
      "region -1",
      { ...base, region: -1 },
      "cover.region: expected an integer in 0..4, got -1",
    ],
    [
      "region 4.5",
      { ...base, region: 4.5 },
      "cover.region: expected an integer in 0..4, got 4.5",
    ],
    [
      "region 5",
      { ...base, region: 5 },
      "cover.region: expected an integer in 0..4, got 5",
    ],
    [
      "a string region",
      { ...base, region: "2" },
      'cover.region: expected an integer in 0..4, got "2"',
    ],
    [
      "NaN region",
      { ...base, region: NaN },
      "cover.region: expected an integer in 0..4, got NaN",
    ],
    [
      "intensity 0.59",
      { ...base, intensity: 0.59 },
      "cover.intensity: expected a number in 0.6..1.4, got 0.59",
    ],
    [
      "intensity 1.41",
      { ...base, intensity: 1.41 },
      "cover.intensity: expected a number in 0.6..1.4, got 1.41",
    ],
    [
      "a string intensity",
      { ...base, intensity: "1" },
      'cover.intensity: expected a number in 0.6..1.4, got "1"',
    ],
    [
      "NaN intensity",
      { ...base, intensity: NaN },
      "cover.intensity: expected a number in 0.6..1.4, got NaN",
    ],
    [
      "Infinity intensity",
      { ...base, intensity: Infinity },
      "cover.intensity: expected a number in 0.6..1.4, got Infinity",
    ],
  ])("%s", (_label, value, expected) => {
    expect(message(() => parseCoverInput(value))).toContain(expected);
  });

  it("states the 200-character limit in the error and does not echo a long value", () => {
    const text = message(() =>
      parseCoverInput({ ...base, item: "y".repeat(100_000) }),
    );
    expect(text).toContain("at most 200 characters");
    expect(text.length).toBeLessThan(300);
  });

  it("does not echo a long unknown key", () => {
    const text = message(() =>
      parseCoverInput({ ...base, ["k".repeat(100_000)]: 1 }),
    );
    expect(text).toContain("unknown key");
    expect(text.length).toBeLessThan(400);
  });

  it("lists the allowed keys on an unknown key", () => {
    expect(message(() => parseCoverInput({ ...base, extra: 1 }))).toContain(
      "(allowed: family, item, index, count, theme, variant, seed, hue, region, intensity)",
    );
  });
});

describe("parseCoverChoices", () => {
  it.each<[string, CoverChoices]>([
    ["nothing", {}],
    ["a family", { family: "tag:ml" }],
    ["a null family", { family: null }],
    ["a seed", { seed: "abc12345" }],
    ["an empty seed", { seed: "" }],
    ["hue -15", { hue: -15 }],
    ["hue 15", { hue: 15 }],
    ["region 0", { region: 0 }],
    ["region 4", { region: 4 }],
    ["intensity 0.6", { intensity: 0.6 }],
    ["intensity 1.4", { intensity: 1.4 }],
    [
      "nulls for the editor's choices",
      { seed: null, hue: null, region: null, intensity: null },
    ],
    [
      "every choice",
      { family: "f", seed: "s", hue: 10, region: 2, intensity: 1.3 },
    ],
  ])("accepts %s, returning exactly the input", (_label, input) => {
    expect(parseCoverChoices(input)).toEqual(input);
  });

  it.each([
    ["item", { item: "a" }],
    ["theme", { theme: "dark" }],
    ["variant", { variant: "card" }],
    ["index", { index: 0 }],
    ["count", { count: 1 }],
    ["a misspelt key", { colour: "red" }],
  ])("rejects %s as an unknown key", (key, value) => {
    const text = message(() => parseCoverChoices(value));
    expect(text).toContain("cover: unknown key");
    expect(text).toContain("(allowed: family, seed, hue, region, intensity)");
    if (!key.includes(" ")) expect(text).toContain(`"${key}"`);
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["a string", "hue"],
    [
      "a class instance",
      new (class C {
        hue = 1;
      })(),
    ],
  ])("rejects %s", (_label, value) => {
    expect(message(() => parseCoverChoices(value))).toContain(
      "cover: expected a plain object",
    );
  });

  it.each<[string, unknown, string]>([
    [
      "hue 15.0001",
      { hue: 15.0001 },
      "cover.hue: expected a number in -15..15, got 15.0001",
    ],
    [
      "NaN hue",
      { hue: NaN },
      "cover.hue: expected a number in -15..15, got NaN",
    ],
    [
      "region 4.5",
      { region: 4.5 },
      "cover.region: expected an integer in 0..4, got 4.5",
    ],
    [
      "intensity 1.41",
      { intensity: 1.41 },
      "cover.intensity: expected a number in 0.6..1.4, got 1.41",
    ],
    [
      "a 201-character seed",
      { seed: long },
      "cover.seed: expected a string of at most 200 characters",
    ],
    [
      "an empty family",
      { family: "" },
      "cover.family: expected a non-empty string",
    ],
    [
      "an own __proto__ key",
      JSON.parse('{"__proto__":{"hue":1}}'),
      'cover: unknown key "__proto__"',
    ],
  ])("rejects %s", (_label, value, expected) => {
    expect(message(() => parseCoverChoices(value))).toContain(expected);
  });

  it("composes with coverSpec as the importer does", () => {
    const stored = JSON.parse(
      '{"family":"tag:ml","hue":10,"region":2,"intensity":1.3}',
    ) as CoverChoices;
    const input = { ...parseCoverChoices(stored), ...base };
    expect(coverSpec(input)).toEqual(coverSpec({ ...stored, ...base }));
  });
});

describe("coverSpec(parseCoverInput(x)) equals coverSpec(x)", () => {
  const vectors = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "cover-vectors.json"),
      "utf8",
    ),
  ) as { cases: { input: CoverInput }[] };

  it("holds for every input in the cover vectors", () => {
    expect(vectors.cases.length).toBeGreaterThanOrEqual(6);
    for (const { input } of vectors.cases)
      expect(coverSpec(parseCoverInput(input))).toEqual(coverSpec(input));
  });

  it.each<[string, CoverInput]>([
    ["a plain item", { item: "hello-world", variant: "card", theme: "dark" }],
    [
      "a light banner",
      { item: "hello-world", variant: "banner", theme: "light" },
    ],
    [
      "a family",
      { family: "tag:ml", item: "post-a", variant: "card", theme: "dark" },
    ],
    [
      "an ordered family",
      {
        family: "course:ai/nn",
        item: "perceptron",
        index: 0,
        count: 6,
        variant: "card",
        theme: "dark",
      },
    ],
    [
      "the last lesson",
      {
        family: "course:ai/nn",
        item: "kv-cache",
        index: 5,
        count: 6,
        variant: "banner",
        theme: "dark",
      },
    ],
    [
      "every editor choice",
      {
        item: "hello-world",
        seed: "abc12345",
        hue: 10,
        region: 2,
        intensity: 1.3,
        variant: "card",
        theme: "dark",
      },
    ],
    [
      "the bounds",
      {
        item: "x",
        hue: -15,
        region: 4,
        intensity: 0.6,
        variant: "card",
        theme: "light",
      },
    ],
    [
      "nulls",
      {
        item: "x",
        family: null,
        seed: null,
        hue: null,
        region: null,
        intensity: null,
        variant: "card",
        theme: "light",
      },
    ],
    ["an empty seed", { item: "x", seed: "", variant: "card", theme: "light" }],
  ])("holds for %s", (_label, input) => {
    expect(coverSpec(parseCoverInput(input))).toEqual(coverSpec(input));
  });
});
