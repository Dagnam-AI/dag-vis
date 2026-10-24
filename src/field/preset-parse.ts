import { VisError } from "../core/errors.js";
import { describeValue } from "../core/describe.js";
import { fieldPresets } from "./presets.js";
import type { FieldPresetName } from "./presets.js";

/** Every preset name, frozen, in `fieldPresets` order (the keys of that table). */
export const fieldPresetNames: readonly FieldPresetName[] = Object.freeze(
  Object.keys(fieldPresets) as FieldPresetName[],
);

/**
 * A strict parse of a preset name from untrusted input (a front-matter field, a stored
 * JSON value): the exact name of a preset, or a `VisError` that lists the known names.
 * Case matters; `Object.hasOwn` keeps `"constructor"` and `"__proto__"` out.
 */
export function parseFieldPreset(value: unknown): FieldPresetName {
  if (typeof value !== "string" || !Object.hasOwn(fieldPresets, value))
    throw new VisError(
      `field preset: expected one of the known presets, got ${describeValue(value)} (known: ${fieldPresetNames.join(", ")})`,
    );
  return value as FieldPresetName;
}
