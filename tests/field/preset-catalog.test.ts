import { describe, expect, it } from "vitest";

import {
  fieldPresetCatalog,
  fieldPresetNames,
  fieldPresets,
} from "../../src/field/index.js";

describe("fieldPresetCatalog", () => {
  it("is the presets one to one, in fieldPresetNames order, with the spec's own kind", () => {
    expect(fieldPresetCatalog.map((p) => p.name)).toEqual(fieldPresetNames);
    expect(fieldPresetCatalog).toHaveLength(19);
    for (const p of fieldPresetCatalog)
      expect(p.kind, p.name).toBe(fieldPresets[p.name].kind);
  });

  it("labels a name with its hyphens as spaces and a capital first letter", () => {
    const label = (name: string) =>
      fieldPresetCatalog.find((p) => p.name === name)?.label;
    expect(label("violet-dusk")).toBe("Violet dusk");
    expect(label("fluid-dawn")).toBe("Fluid dawn");
    expect(label("fluted-ember")).toBe("Fluted ember");
    expect(label("brand")).toBe("Brand");
    expect(label("sunset-ring")).toBe("Sunset ring");
  });

  it("has a distinct non-empty label per preset and only the three kinds", () => {
    const labels = fieldPresetCatalog.map((p) => p.label);
    expect(new Set(labels).size).toBe(19);
    for (const p of fieldPresetCatalog) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(["flow", "fluid", "fluted"]).toContain(p.kind);
    }
    expect(fieldPresetCatalog.filter((p) => p.kind === "fluid")).toHaveLength(
      1,
    );
    expect(fieldPresetCatalog.filter((p) => p.kind === "fluted")).toHaveLength(
      1,
    );
  });

  it("is deep-frozen: the array and every entry", () => {
    expect(Object.isFrozen(fieldPresetCatalog)).toBe(true);
    for (const p of fieldPresetCatalog) expect(Object.isFrozen(p)).toBe(true);
    expect(() => {
      (fieldPresetCatalog as unknown as { label: string }[])[0]!.label = "x";
    }).toThrow(TypeError);
  });
});
