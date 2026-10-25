import { fieldPresetNames } from "./preset-parse.js";
import type { FieldPresetName } from "./presets.js";
import { fieldPresets } from "./presets.js";
import { deepFreeze, type FieldSpec } from "./spec.js";

/** One preset as a list shows it: the stored `name`, a human `label` and the spec's `kind`. */
export interface FieldPresetInfo {
  /** The preset name, as `parseFieldPreset` accepts and `fieldPresets` is keyed by. */
  name: FieldPresetName;
  /** The name with hyphens as spaces and a capital first letter: `"Violet dusk"`, `"Fluted ember"`, `"Brand"`. */
  label: string;
  /** The kind of the preset's spec (`fieldPresets[name].kind`). */
  kind: FieldSpec["kind"];
}

/**
 * Every preset as `{ name, label, kind }`, deep-frozen, in `fieldPresetNames` order: what a
 * browsable list needs without a second table. `kind` is read from the spec itself, so it cannot
 * drift from `fieldPresets`.
 */
export const fieldPresetCatalog: readonly FieldPresetInfo[] = deepFreeze(
  fieldPresetNames.map((name) => ({
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1).replaceAll("-", " "),
    kind: fieldPresets[name].kind,
  })),
);
