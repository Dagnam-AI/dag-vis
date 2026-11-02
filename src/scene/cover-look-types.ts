import { VisError } from "../core/errors.js";
import { describeValue } from "../core/describe.js";
import type { GradientSpec } from "../gradient/index.js";
import type { PatternSpec } from "../pattern/index.js";
import type { CoverInput, CoverParams } from "./cover.js";

/** The five named looks, in the order the weights are listed in. */
export const COVER_LOOKS = [
  "ember",
  "aurora",
  "contour",
  "silk",
  "halftone",
] as const;
export type CoverLookName = (typeof COVER_LOOKS)[number];

export interface CoverLookInput extends CoverInput {
  /** Pin a look; `null` or omitted derives it from the family key. */
  look?: CoverLookName | null;
}

export interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The colours of a look, as hex, per theme. */
export interface CoverPalette {
  base: string;
  deep: string;
  ink: string;
  accent: string;
  highlight: string;
  cool: string;
  /** The colour of the texture's marks. */
  line: string;
  /** Text colour on this cover. */
  foreground: string;
}

/** A pattern over the picture, faded by a radial mask (percent of the box). */
export interface CoverTexture {
  pattern: PatternSpec;
  opacity: number;
  mask: {
    at: [number, number];
    radius: [number, number];
    floor: number;
  };
}

/** A soft band under the title zone, theme-coloured. */
export interface CoverScrim {
  at: [number, number];
  radius: [number, number];
  color: string;
  alpha: number;
}

export interface CoverLook {
  look: CoverLookName;
  theme: "light" | "dark";
  variant: "card" | "banner";
  /** The derivation of `coverParams`, with the region, hue offset and keys that produced it. */
  params: CoverParams;
  palette: CoverPalette;
  /** A plain gradient spec: `gradient()`, `gradientSvg()` and `<Gradient>` take it unchanged. */
  spec: GradientSpec;
  /** The pattern layer and its radial mask, or null. */
  texture: CoverTexture | null;
  /** Present for `variant: "banner"`: the band under the title zone; null when none is needed. */
  scrim: CoverScrim | null;
  /** Minimum WCAG ratio of the text colour in the title zone, without and with the scrim. */
  contrast: { zone: Zone; before: number; after: number };
}

/** `cover.look: expected one of ember, ..., got x`: the message every entry point shares. */
export const LOOK_EXPECTED = `one of ${COVER_LOOKS.join(", ")}`;

export function isLookName(v: unknown): v is CoverLookName {
  return COVER_LOOKS.includes(v as CoverLookName);
}

/** The pinned look of `value` (`null` and `undefined` are "derive"), or a VisError naming `cover.look`. */
export function parseLookName(v: unknown): CoverLookName | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isLookName(v))
    throw new VisError(
      `cover.look: expected ${LOOK_EXPECTED}, got ${describeValue(v)}`,
    );
  return v;
}

/** Whether `v` is a `CoverLook` (what `coverLook` returns) rather than a plain gradient spec. */
export function isCoverLook(v: unknown): v is CoverLook {
  return (
    typeof v === "object" &&
    v !== null &&
    "spec" in v &&
    "palette" in v &&
    isLookName((v as { look?: unknown }).look)
  );
}
