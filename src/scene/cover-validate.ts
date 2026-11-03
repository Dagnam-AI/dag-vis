import { parseColor } from "../core/color.js";
import { VisError } from "../core/errors.js";
import { bounded, describeValue } from "../core/validate.js";
import type { CoverLook, CoverScrim } from "./cover-look-types.js";

/**
 * A look is code-built, but a hand-made or stored one reaches the renderers as plain data:
 * check the numbers it draws or measures with, so a bad one is a `VisError` naming the
 * field, never a `TypeError` from a missing array or object.
 */
export function assertLook(look: CoverLook, scrim: CoverScrim | null): void {
  const pair = (name: string, v: unknown, min: number, max: number): void => {
    if (!Array.isArray(v) || v.length !== 2)
      throw new VisError(
        `${name} must be an array of 2 numbers, got ${describeValue(v)}`,
      );
    v.forEach((n: unknown, i) => bounded(`${name}[${i}]`, n, min, max));
  };
  const tx = look.texture;
  if (tx) {
    bounded("texture.opacity", tx.opacity, 0, 1);
    const mask: unknown = tx.mask;
    if (typeof mask !== "object" || mask === null)
      throw new VisError(
        `texture.mask must be an object, got ${describeValue(mask)}`,
      );
    bounded("texture.mask.floor", tx.mask.floor, 0, 1);
    pair("texture.mask.at", tx.mask.at, -1000, 1000);
    pair("texture.mask.radius", tx.mask.radius, 0, 1000);
  }
  if (scrim) {
    bounded("scrim.alpha", scrim.alpha, 0, 1);
    pair("scrim.at", scrim.at, -1000, 1000);
    pair("scrim.radius", scrim.radius, 0, 1000);
    parseColor(scrim.color);
  }
}
