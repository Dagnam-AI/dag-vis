import { VisError } from "../core/errors.js";
import {
  bounded,
  describeValue,
  orDefault,
  parseFlag,
} from "../core/validate.js";
import { deepFreeze } from "./tokens.js";

/** The plate outlines `appIconSvg` can draw. */
export const APP_ICON_SHAPES = deepFreeze([
  "squircle",
  "rounded",
  "circle",
  "square",
] as const);
export type AppIconShape = (typeof APP_ICON_SHAPES)[number];

/** The look of the plate and the mark on it; every field is optional (see `APP_ICON_PRESETS` for the defaults). */
export interface AppIconLook {
  /**
   * Plate outline. `squircle` is Apple's continuous corner, `rounded` a plain
   * rounded rectangle (see `cornerRadius`), `circle` and `square` need no
   * radius; `square` with `margin` 0 is the full-bleed art a store or a mask wants.
   */
  shape?: AppIconShape;
  /** Corner radius as a fraction of the plate side, 0..0.5. Only for `shape: "rounded"` (default 0.22); any other shape rejects it. */
  cornerRadius?: number;
  /** Transparent margin on each side as a fraction of the canvas, 0..0.4; 0 puts the plate on the canvas edge. */
  margin?: number;
  /** Side of the mark's box as a fraction of the plate side, 0.2..0.9. */
  markScale?: number;
  /** Drop the sheen and the hairline: a solid plate, what stores and masks want. */
  flat?: boolean;
  /**
   * Declares that no pixel is transparent: the plate fills the whole canvas, so
   * it needs `shape: "square"`, `margin: 0` and an opaque `background`; an
   * explicit `true` with another shape or margin throws. A preset's `opaque`
   * only applies while its shape and margin do (`{ preset: "store", shape: "circle" }` is a plain circle).
   */
  opaque?: boolean;
}

/**
 * Presets in one table. `macos` is the dock icon: an 824 px squircle on the
 * 1024 canvas (Apple's grid, 100 px of margin), with a sheen and a hairline.
 * `store` is full-bleed opaque square art for uploads that apply their own
 * mask (Google and GitHub OAuth logos, app stores). `maskable` is the same for
 * a PWA maskable icon, with the mark inside the 80% safe-zone circle: its
 * bounding box's corners sit at 0.354 of the canvas from the centre, inside
 * the 0.4 radius. `round` is a circle with a small margin, for avatars.
 */
export const APP_ICON_PRESETS = deepFreeze({
  macos: {
    shape: "squircle",
    margin: 100 / 1024,
    markScale: 480 / 824,
    flat: false,
    opaque: false,
  },
  store: {
    shape: "square",
    margin: 0,
    markScale: 0.78,
    flat: true,
    opaque: true,
  },
  maskable: {
    shape: "square",
    margin: 0,
    markScale: 0.5,
    flat: true,
    opaque: true,
  },
  round: {
    shape: "circle",
    margin: 0.05,
    markScale: 0.55,
    flat: true,
    opaque: false,
  },
} as const satisfies Record<
  string,
  Required<Omit<AppIconLook, "cornerRadius">>
>);
export type AppIconPreset = keyof typeof APP_ICON_PRESETS;

export interface AppIconLookOptions extends AppIconLook {
  /** Start from this preset (default `macos`); the other fields override it. */
  preset?: AppIconPreset;
}

/** A look with every field decided. `cornerRadius` is 0 unless the shape is `rounded`. */
export type ResolvedAppIconLook = Required<AppIconLook>;

const DEFAULT_CORNER_RADIUS = 0.22;

function oneOf<T extends string>(
  name: string,
  v: unknown,
  allowed: readonly T[],
): T {
  const hit = allowed.find((a) => a === v);
  if (hit === undefined)
    throw new VisError(
      `${name} must be one of ${allowed.join(", ")}, got ${describeValue(v)}`,
    );
  return hit;
}

/** `v` as a preset name (default `macos` when undefined); only names of the table match. */
export function parsePreset(v: unknown): AppIconPreset {
  return oneOf(
    "app icon preset",
    orDefault<unknown>(v, "macos"),
    Object.keys(APP_ICON_PRESETS) as AppIconPreset[],
  );
}

/**
 * The preset, then the explicit fields over it, each validated by name. An
 * explicit `cornerRadius` with a shape other than `rounded`, and an explicit
 * `opaque: true` with anything but a square at margin 0, throw rather than being ignored.
 */
export function resolveAppIconLook(
  opts: AppIconLookOptions,
): ResolvedAppIconLook {
  const base = APP_ICON_PRESETS[parsePreset(opts.preset)];
  const shape = oneOf<AppIconShape>(
    "app icon shape",
    orDefault<unknown>(opts.shape, base.shape),
    APP_ICON_SHAPES,
  );
  if (shape !== "rounded" && opts.cornerRadius !== undefined)
    throw new VisError(
      `app icon cornerRadius only applies to shape "rounded", got shape "${shape}"`,
    );
  const cornerRadius =
    shape === "rounded"
      ? bounded(
          "app icon cornerRadius",
          orDefault<unknown>(opts.cornerRadius, DEFAULT_CORNER_RADIUS),
          0,
          0.5,
        )
      : 0;
  const margin = bounded(
    "app icon margin",
    orDefault<unknown>(opts.margin, base.margin),
    0,
    0.4,
  );
  const markScale = bounded(
    "app icon markScale",
    orDefault<unknown>(opts.markScale, base.markScale),
    0.2,
    0.9,
  );
  const flat = parseFlag(
    "app icon flat",
    orDefault<unknown>(opts.flat, base.flat),
  );
  // A preset's opaque applies only while its shape and margin do; an explicit
  // `opaque: true` that does not fit is the caller's mistake and throws.
  const opaque =
    opts.opaque === undefined
      ? base.opaque && shape === "square" && margin === 0
      : parseFlag("app icon opaque", opts.opaque);
  if (opaque && (shape !== "square" || margin !== 0))
    throw new VisError(
      `app icon opaque needs shape "square" and margin 0, got shape "${shape}" and margin ${margin}`,
    );
  return { shape, cornerRadius, margin, markScale, flat, opaque };
}
