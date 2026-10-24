import { extname, resolve } from "node:path";

import { VisError } from "../core/errors.js";
import { describeValue } from "../core/validate.js";
import { SIZES, sizeOf } from "../export/limits.js";
import { fieldPresets } from "../field/index.js";
import { defined, oneLine, parseNumber } from "./cli-args.js";
import type { Parsed } from "./cli-args.js";
import { numeric, readSpec, required, writeOut } from "./cli-support.js";
import type { CliIo, Command, Options } from "./cli-support.js";
import {
  ANIMATION_FORMATS,
  STATIC_FORMATS,
  exportAnimation,
  exportStatic,
} from "./export.js";
import type { AnimationFormat, StaticFormat } from "./export.js";
import { encodePng } from "./png.js";
import { renderSheet } from "./sheet.js";

const USAGE_EXPORT =
  "usage: dag-vis export <preset|spec.json> --out FILE [--format F] [--w N --h N | --size NAME] [--fps N --duration S --loop] [--quality Q] [--t S] [--alpha] [--poster FILE]";

/**
 * The spec to export: a preset by name (an own property of `fieldPresets`, so
 * `constructor` and `__proto__` are not presets), else a JSON file, which must
 * end in .json and is read like every other spec file (size-bounded, parsed
 * with JSON.parse only). The export itself validates the contents.
 */
export async function loadSpec(target: string): Promise<unknown> {
  if (Object.hasOwn(fieldPresets, target)) return fieldPresets[target];
  if (!/\.json$/i.test(target))
    throw new VisError(
      `unknown preset ${describeValue(target)} (run \`dag-vis presets\`) and not a .json file`,
    );
  return readSpec(target);
}

type Chosen =
  | { animated: false; format: StaticFormat }
  | { animated: true; format: AnimationFormat };

// A Map, not an object: an extension like `constructor` must be unknown.
const FORMATS = new Map<string, Chosen>([
  ...STATIC_FORMATS.map((f): [string, Chosen] => [
    f,
    { animated: false, format: f },
  ]),
  ["jpg", { animated: false, format: "jpeg" }],
  ...ANIMATION_FORMATS.map((f): [string, Chosen] => [
    f,
    { animated: true, format: f },
  ]),
]);

/** The format: `explicit` (--format) or else the extension of `out`, case-insensitive; `jpg` is `jpeg`. */
export function formatFor(out: string, explicit?: string): Chosen {
  const raw = (explicit ?? extname(out).slice(1)).toLowerCase();
  if (raw === "")
    throw new VisError(
      explicit === undefined
        ? "cannot infer the format from --out (no extension); pass --format"
        : "--format must not be empty",
    );
  const chosen = FORMATS.get(raw);
  if (chosen === undefined)
    throw new VisError(
      `unknown format ${describeValue(raw)}${explicit === undefined ? " (from the --out extension; pass --format to override)" : ""}; use ${[...FORMATS.keys()].join("|")}`,
    );
  return chosen;
}

/** A whole number of pixels; the range is the exporter's to check. */
function pixels(name: string, raw: string): number {
  const n = parseNumber(name, raw);
  if (!Number.isInteger(n))
    throw new VisError(
      `--${name} must be a whole number of pixels, got ${describeValue(raw)}`,
    );
  return n;
}

/** --size NAME, or --w and --h together, or og (1200 x 630) when none is given. */
function sizeFrom(opts: Options): [number, number] {
  const size = opts.get("size");
  const w = opts.get("w");
  const h = opts.get("h");
  if (size !== undefined) {
    if (w !== undefined || h !== undefined)
      throw new VisError("--size cannot be combined with --w or --h");
    if (!Object.hasOwn(SIZES, size))
      throw new VisError(
        `--size must be one of ${Object.keys(SIZES).join("|")}, got ${describeValue(size)}`,
      );
    return sizeOf(size);
  }
  if (w === undefined && h === undefined) return sizeOf("og");
  if (w === undefined || h === undefined)
    throw new VisError("--w and --h must be given together");
  return [pixels("w", w), pixels("h", h)];
}

/** The formats that read --quality: the lossy encoders. The others have nothing to tune. */
const QUALITY_FORMATS: readonly string[] = [
  "jpeg",
  "webp",
  "avif",
  "mp4",
  "webm",
];

/** Options that only make sense for some formats are refused for the others, not ignored. */
function checkApplicable(
  { opts, flags }: { opts: Options; flags: ReadonlySet<string> },
  chosen: Chosen,
): void {
  const given = (name: string): boolean => opts.has(name) || flags.has(name);
  if (given("quality") && !QUALITY_FORMATS.includes(chosen.format))
    throw new VisError(
      `--quality applies to jpeg, webp, avif, mp4 and webm, not ${chosen.format}`,
    );
  if (chosen.animated) {
    if (given("t"))
      throw new VisError(
        `--t applies to stills, not ${chosen.format} (an animation starts at 0)`,
      );
    return;
  }
  const motion = ["fps", "alpha", "poster"].find(given);
  if (motion !== undefined)
    throw new VisError(
      `--${motion} applies to animations, not ${chosen.format}`,
    );
  if (opts.has("duration") && !flags.has("loop"))
    throw new VisError(
      `--duration applies to ${chosen.format} only with --loop (it sets the loop length)`,
    );
}

async function cmdExport(
  opts: Options,
  parsed: Parsed,
  io: CliIo,
): Promise<void> {
  const [target] = parsed.positionals;
  if (target === undefined) throw new VisError(USAGE_EXPORT);
  const out = resolve(required(opts, "out"));
  const chosen = formatFor(out, opts.get("format"));
  const [width, height] = sizeFrom(opts);
  checkApplicable({ opts, flags: parsed.flags }, chosen);
  const quality = numeric(opts, "quality");
  const duration = numeric(opts, "duration");
  const loop = parsed.flags.has("loop");
  const spec = await loadSpec(target);
  const warn = (message: string): void => {
    io.stderr(`dag-vis: warning: ${oneLine(message)}\n`);
  };
  if (chosen.animated) {
    const poster = opts.get("poster");
    await exportAnimation(spec, {
      width,
      height,
      format: chosen.format,
      out,
      loop,
      alpha: parsed.flags.has("alpha"),
      warn,
      ...defined({ fps: numeric(opts, "fps"), duration, quality, poster }),
    });
    io.stdout(`wrote ${out}\n`);
    if (poster !== undefined) io.stdout(`wrote ${resolve(poster)}\n`);
    return;
  }
  await exportStatic(spec, {
    width,
    height,
    format: chosen.format,
    out,
    // A looping still lands on the frame the animation of that length would show at --t.
    ...defined({
      t: numeric(opts, "t"),
      loop: loop ? (duration ?? 6) : undefined,
      quality,
    }),
  });
  io.stdout(`wrote ${out}\n`);
}

/** `--tile` as WIDTHxHEIGHT in digits, e.g. 300x170; the range is renderSheet's to check. */
function parseTile(raw: string): { width: number; height: number } {
  const m = /^(\d+)x(\d+)$/.exec(raw);
  if (m === null)
    throw new VisError(
      `--tile must look like 300x170, got ${describeValue(raw)}`,
    );
  return { width: Number(m[1]), height: Number(m[2]) };
}

async function cmdSheet(opts: Options, io: CliIo): Promise<void> {
  const out = required(opts, "out");
  if (!/\.png$/i.test(out))
    throw new VisError(`--out must end in .png, got ${describeValue(out)}`);
  const tile = opts.get("tile");
  const frame = renderSheet(
    defined({
      tile: tile === undefined ? undefined : parseTile(tile),
      gap: numeric(opts, "gap"),
      columns: numeric(opts, "columns"),
    }),
  );
  const path = resolve(out);
  await writeOut(path, encodePng(frame.data, frame.width, frame.height));
  io.stdout(`wrote ${path}\n`);
}

/** Every preset, one `name<TAB>kind` line each, in the order of the contact sheet. */
function cmdPresets(io: CliIo): void {
  io.stdout(
    Object.entries(fieldPresets)
      .map(([name, spec]) => `${name}\t${spec.kind}\n`)
      .join(""),
  );
}

export const EXPORT_COMMANDS: readonly [string, Command][] = [
  [
    "export",
    {
      options: [
        "out",
        "format",
        "w",
        "h",
        "size",
        "fps",
        "duration",
        "quality",
        "t",
        "poster",
      ],
      flags: ["loop", "alpha"],
      positionals: 1,
      run: (opts, io, parsed) => cmdExport(opts, parsed, io),
    },
  ],
  [
    "presets",
    {
      options: [],
      run(_opts, io) {
        cmdPresets(io);
        return Promise.resolve();
      },
    },
  ],
  [
    "sheet",
    {
      options: ["out", "tile", "gap", "columns"],
      run: (opts, io) => cmdSheet(opts, io),
    },
  ],
];
