import { VisError, toVec3 } from "../core/index.js";
import type { EffectOptions, ResolvedOptions } from "./runtime.js";

/**
 * Colour plumbing shared by effects that take an optional `color` falling back
 * to `colors[0]`. The fallback is resolved on every frame (`colourOf`), never
 * captured at creation, so `update({ colors })` takes effect.
 */

/** Resolved options whose `color` stays optional until draw time. */
export type WithOptionalColour<O extends EffectOptions> = Omit<
  ResolvedOptions<O>,
  "color"
> & { color?: string };

/** toVec3, with the failing option named in the error. */
export function namedVec3(
  name: string,
  value: string,
): [number, number, number] {
  try {
    return toVec3(value);
  } catch (error) {
    throw new VisError(`${name}: ${(error as VisError).message}`);
  }
}

/** Defaults minus `color`: the default colour is the last fallback in `colourOf`, not a stored option. */
export function withoutColour<D extends { color: string }>(
  defaults: D,
): Omit<D, "color"> {
  const out: Partial<D> = { ...defaults };
  delete out.color;
  return out as Omit<D, "color">;
}

/** `color`, else `colors[0]`, else the effect's default. */
export const colourOf = (
  o: { color?: string; colors?: string[] },
  fallback: string,
): string => o.color ?? o.colors?.[0] ?? fallback;

/** Validate every palette entry, naming `colors[i]` in the error. */
export function validatePalette(o: { colors?: string[] }): void {
  o.colors?.forEach((c, i) => namedVec3(`colors[${String(i)}]`, c));
}

/** The effective colour as RGB, named `color` in the error. */
export function resolveColour(
  o: { color?: string; colors?: string[] },
  fallback: string,
): [number, number, number] {
  return namedVec3("color", colourOf(o, fallback));
}

/** Hand the options to `createRuntime`, which only reads `color` through the effect's own draw callback. */
export const asResolved = <O extends EffectOptions>(
  o: WithOptionalColour<O>,
): ResolvedOptions<O> => o as ResolvedOptions<O>;
