import { VisError, type Size } from "../core/index.js";
import {
  MAX_DIMENSION,
  assertOptions,
  bounded,
  describeValue,
  integerIn,
  orDefault,
  parseRgba,
  within,
} from "../core/validate.js";
import {
  MAX_FRAME_PIXELS,
  MAX_T,
  fieldPresets,
  renderField,
  resolveField,
  type FieldFrame,
  type FieldSpec,
} from "../field/index.js";

export interface SheetOptions {
  /** One tile: whole pixels, 1..16384 each side, at most 2^25 pixels. Default 300 x 170. */
  tile?: Size;
  /** Whole pixels around and between tiles, 0..16384. Default 32. */
  gap?: number;
  /** Tiles per row, 1..16384 (a row is always `columns` wide, filled or not). Default 4. */
  columns?: number;
  /** Opaque CSS colour behind the tiles. Default `#06061a`. */
  background?: string;
  /** Seconds into the animation, finite, within ±1000000. Default 0. */
  t?: number;
  /** Named field specs in layout order (row by row), at least one. Default: every field preset. */
  presets?: Readonly<Record<string, FieldSpec>>;
}

/** The tile size: `{ width, height }` in whole pixels, within one frame's pixel budget. */
function tileOf(v: unknown): Size {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    throw new VisError(
      `tile must be an object { width, height }, got ${describeValue(v)}`,
    );
  const { width, height } = v as { width?: unknown; height?: unknown };
  const tile = {
    width: integerIn("tile.width", width, 1, MAX_DIMENSION),
    height: integerIn("tile.height", height, 1, MAX_DIMENSION),
  };
  if (tile.width * tile.height > MAX_FRAME_PIXELS)
    throw new VisError(
      `tile.width x tile.height must be at most ${MAX_FRAME_PIXELS} pixels, got ${tile.width} x ${tile.height}`,
    );
  return tile;
}

/** The presets as `[name, spec]` pairs: a non-empty plain record (own properties only). */
function presetsOf(v: unknown): [string, unknown][] {
  const proto: unknown =
    typeof v === "object" && v !== null ? Object.getPrototypeOf(v) : undefined;
  if (
    typeof v !== "object" ||
    v === null ||
    Array.isArray(v) ||
    (proto !== Object.prototype && proto !== null)
  )
    throw new VisError(
      `presets must be a plain object of field specs by name, got ${describeValue(v)}`,
    );
  const entries = Object.entries(v);
  if (entries.length === 0)
    throw new VisError("presets must hold at least one field spec");
  return entries;
}

/**
 * The reference grid as one image: every preset rendered at `tile` size, `columns`
 * across, row by row, with `gap` pixels around and between them on `background`.
 * The sheet is `columns * tile.width + (columns + 1) * gap` wide and
 * `rows * tile.height + (rows + 1) * gap` high, and as a whole stays within one
 * frame's limits (each side at most 16384, at most 2^25 pixels). Every option is
 * checked before anything is rendered; a VisError names the parameter, and a bad
 * preset is named as `presets.<name>`. A pure function of the options, byte for byte.
 */
export function renderSheet(o: SheetOptions = {}): FieldFrame {
  assertOptions(o);
  const tile = tileOf(orDefault<unknown>(o.tile, { width: 300, height: 170 }));
  const gap = integerIn("gap", orDefault<unknown>(o.gap, 32), 0, MAX_DIMENSION);
  const columns = integerIn(
    "columns",
    orDefault<unknown>(o.columns, 4),
    1,
    MAX_DIMENSION,
  );
  const bg = parseRgba(
    "background",
    orDefault<unknown>(o.background, "#06061a"),
  );
  if (bg.a !== 1)
    throw new VisError(
      `background must be an opaque colour, got ${describeValue(o.background)}`,
    );
  const t = bounded("t", orDefault<unknown>(o.t, 0), -MAX_T, MAX_T);
  const entries = presetsOf(orDefault<unknown>(o.presets, fieldPresets));
  const rows = Math.ceil(entries.length / columns);
  const width = columns * tile.width + (columns + 1) * gap;
  const height = rows * tile.height + (rows + 1) * gap;
  if (
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width * height > MAX_FRAME_PIXELS
  )
    throw new VisError(
      `the sheet must be at most ${MAX_DIMENSION} pixels a side and ${MAX_FRAME_PIXELS} pixels in all, got ${width} x ${height}`,
    );
  const specs = entries.map(([name, spec]) =>
    within(`presets.${name}`, () => resolveField(spec)),
  );
  const data = new Uint8ClampedArray(width * height * 4);
  const background = [bg.r, bg.g, bg.b].map((c) => Math.round(c * 255));
  for (let i = 0; i < data.length; i += 4) {
    data.set(background, i);
    data[i + 3] = 255;
  }
  specs.forEach((spec, k) => {
    const frame = renderField(spec, { ...tile, t });
    const x0 = gap + (k % columns) * (tile.width + gap);
    const y0 = gap + Math.floor(k / columns) * (tile.height + gap);
    const row = tile.width * 4;
    for (let y = 0; y < tile.height; y++)
      data.set(
        frame.data.subarray(y * row, (y + 1) * row),
        ((y0 + y) * width + x0) * 4,
      );
  });
  return { data, width, height };
}
