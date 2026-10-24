import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { fieldPresets, renderField } from "../../src/field/index.js";
import {
  fieldPresetNames,
  parseFieldPreset,
} from "../../src/field/preset-parse.js";

describe("fieldPresetNames", () => {
  it("is the keys of fieldPresets, in the table's order, frozen", () => {
    expect(fieldPresetNames).toEqual(Object.keys(fieldPresets));
    expect(fieldPresetNames).toHaveLength(19);
    expect(Object.isFrozen(fieldPresetNames)).toBe(true);
  });
});

describe("parseFieldPreset", () => {
  it.each(Object.keys(fieldPresets))("accepts the preset %s", (name) => {
    expect(parseFieldPreset(name)).toBe(name);
  });

  it("every accepted name is a real preset that renders", () => {
    for (const name of fieldPresetNames) {
      const parsed = parseFieldPreset(name);
      expect(fieldPresets[parsed]).toBeDefined();
      expect(
        renderField(fieldPresets[parsed], { width: 2, height: 2 }).data,
      ).toHaveLength(16);
    }
  });

  it.each([
    ["constructor", "constructor"],
    ["__proto__", "__proto__"],
    ["toString", "toString"],
    ["the empty string", ""],
    ["a wrong case", "Rainbow-Band"],
    ["a trailing space", "lunar "],
    ["a number", 3],
    ["null", null],
    ["undefined", undefined],
    ["an object", {}],
    ["an array", ["lunar"]],
  ])("rejects %s and lists the known names", (_label, value) => {
    expect(() => parseFieldPreset(value)).toThrow(VisError);
    expect(() => parseFieldPreset(value)).toThrow(
      `(known: ${fieldPresetNames.join(", ")})`,
    );
  });

  it("names the field and quotes the received value", () => {
    expect(() => parseFieldPreset("Rainbow-Band")).toThrow(
      'field preset: expected one of the known presets, got "Rainbow-Band"',
    );
    expect(() => parseFieldPreset(3)).toThrow(/got 3 \(known:/);
  });

  it("truncates a long name like describeValue does", () => {
    let message = "";
    try {
      parseFieldPreset("x".repeat(100_000));
    } catch (e) {
      message = (e as VisError).message;
    }
    expect(message.length).toBeLessThan(600);
    expect(message).toContain("...");
  });
});
