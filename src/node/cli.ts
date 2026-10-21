import { constants } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { palette } from "../brand/tokens.js";
import { VisError } from "../core/errors.js";
import { describeValue } from "../core/validate.js";
import { gradientSvg } from "../gradient/index.js";
import type { GradientSpec } from "../gradient/index.js";
import { pattern } from "../pattern/index.js";
import type { PatternSpec } from "../pattern/index.js";
import { brandBackground } from "../scene/brand-background.js";
import { ogCard } from "../scene/og-card.js";
import {
  defined,
  oneLine,
  parseFocus,
  parseNumber,
  parseOptions,
  wantsHelp,
} from "./cli-args.js";
import { favicons } from "./favicons.js";
import { renderPng } from "./render-png.js";
import { messageOf, writeAtomic } from "./util.js";

export interface CliIo {
  stdout(s: string): void;
  stderr(s: string): void;
}

export const USAGE = `Dagnam visuals from the command line (dag-vis <command> [options])

  dag-vis og --title T [--subtitle S --eyebrow E --footer F --theme dark|light --w 1200 --h 630] --out f.(svg|png)
  dag-vis background --w W --h H [--focus x,y --scale N --palette red|mono|stripes|ocean|ember] --out f.(svg|png)
  dag-vis gradient --spec spec.json [--w W --h H] --out f.(svg|png)
  dag-vis pattern --spec spec.json --out f.(svg|png)
  dag-vis favicons --out DIR [--background C --color C]

An --out ending in .png (any case) is rasterised with the bundled Inter fonts
(needs @resvg/resvg-js); any other --out is written as SVG. Files are written
atomically (a temp file renamed over the target, so an existing file is
replaced even if read-only, and the new one gets the default mode) and missing
parent directories are created. favicons --out is a directory. Numbers are plain decimals (600, 0.5); --focus is x,y in 0..1.
Options take "--name value" or "--name=value" (use the second form for a value
that starts with "--"). A spec is a JSON object in a file of at most 1 MiB. To
rasterise a gradient spec whose overlay has an image, give the image as a
data: URI (a URL or path cannot be rendered to PNG; SVG output keeps it as is).
Exit status 0 on success, 1 on any error (one line on stderr).
`;

type Options = ReadonlyMap<string, string>;

/** The value of a required option; an empty one is as wrong as a missing one. */
function required(opts: Options, name: string): string {
  const v = opts.get(name);
  if (v === undefined) throw new VisError(`--${name} is required`);
  if (v === "") throw new VisError(`--${name} must not be empty`);
  return v;
}

function numeric(opts: Options, name: string): number | undefined {
  const raw = opts.get(name);
  return raw === undefined ? undefined : parseNumber(name, raw);
}

function requiredNumeric(opts: Options, name: string): number {
  return parseNumber(name, required(opts, name));
}

function themeOption(opts: Options): "dark" | "light" | undefined {
  const v = opts.get("theme");
  if (v === undefined || v === "dark" || v === "light") return v;
  throw new VisError(`--theme must be dark or light, got ${describeValue(v)}`);
}

/** Rethrows a filesystem failure as a VisError: `<what>: <system message>`. */
const failWith =
  (what: string) =>
  (error: unknown): never => {
    throw new VisError(`${what}: ${messageOf(error)}`);
  };

/** Largest spec file read; a spec is a few hundred bytes in practice. */
const MAX_SPEC_BYTES = 1024 * 1024;

/**
 * Reads a spec file as JSON (`JSON.parse` only, never evaluated). The path is
 * user input: it must be a regular file (a directory, device or FIFO would
 * fail or block) of at most MAX_SPEC_BYTES, and hold a JSON object. The
 * generators validate the object's contents. The file is opened first, without
 * blocking (a FIFO with no writer would otherwise hang the open), and the
 * OPENED file is checked, so it cannot be swapped between the check and the read.
 */
async function readSpec(path: string): Promise<object> {
  const fail = failWith(`could not read ${path}`);
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NONBLOCK,
  ).catch(fail);
  const buffer = Buffer.alloc(MAX_SPEC_BYTES + 1);
  try {
    const info = await handle.stat().catch(fail);
    if (!info.isFile()) throw new VisError(`${path} is not a regular file`);
    const { bytesRead } = await handle
      .read(buffer, 0, buffer.length, 0)
      .catch(fail);
    if (bytesRead > MAX_SPEC_BYTES)
      throw new VisError(`${path} is larger than 1 MiB`);
    return parseSpec(path, buffer.toString("utf8", 0, bytesRead));
  } finally {
    await handle.close();
  }
}

/** `text` as a JSON object, or a VisError naming `path`. */
function parseSpec(path: string, text: string): object {
  let spec: unknown;
  try {
    spec = JSON.parse(text.startsWith("﻿") ? text.slice(1) : text);
  } catch (error) {
    throw new VisError(`invalid JSON in ${path}: ${messageOf(error)}`);
  }
  if (typeof spec !== "object" || spec === null || Array.isArray(spec))
    throw new VisError(
      `${path} must contain a JSON object, got ${Array.isArray(spec) ? "an array" : describeValue(spec)}`,
    );
  return spec;
}

/**
 * Writes `data` to `path` through a temp file in the same directory and a
 * rename, so a failure never leaves a truncated file under the real name.
 * Missing parent directories are created. The rename replaces the target (a
 * symlink is replaced, never written through); a directory there is refused.
 */
async function writeOut(path: string, data: Buffer | string): Promise<void> {
  const wrap = (error: unknown): VisError =>
    new VisError(`could not write ${path}: ${messageOf(error)}`);
  if ((await stat(path).catch(() => undefined))?.isDirectory())
    throw new VisError(`could not write ${path}: it is a directory`);
  await mkdir(dirname(path), { recursive: true }).catch((error: unknown) => {
    throw wrap(error);
  });
  await writeAtomic(path, data, wrap);
}

/** Rasterises SVG that one of this package's generators produced (never a user's file). */
async function toPng(svg: string): Promise<Buffer> {
  try {
    return await renderPng(svg);
  } catch (error) {
    throw new VisError(`cannot render PNG: ${messageOf(error)}`);
  }
}

/** Renders (PNG when `out` ends in .png, any case; else the SVG as is) and writes. */
async function emit(svg: string, out: string, io: CliIo): Promise<void> {
  const path = resolve(out);
  await writeOut(
    path,
    path.toLowerCase().endsWith(".png") ? await toPng(svg) : svg,
  );
  io.stdout(`wrote ${path}\n`);
}

interface Command {
  options: readonly string[];
  run(opts: Options, io: CliIo): Promise<void>;
}

// A Map, not an object: `constructor`, `__proto__` and friends must be unknown commands.
const COMMANDS = new Map<string, Command>([
  [
    "og",
    {
      options: [
        "title",
        "subtitle",
        "eyebrow",
        "footer",
        "theme",
        "w",
        "h",
        "out",
      ],
      async run(opts, io) {
        const theme = themeOption(opts);
        const out = required(opts, "out");
        const svg = ogCard({
          title: required(opts, "title"),
          ...defined({
            subtitle: opts.get("subtitle"),
            eyebrow: opts.get("eyebrow"),
            footer: opts.get("footer"),
            theme,
            width: numeric(opts, "w"),
            height: numeric(opts, "h"),
          }),
        });
        await emit(svg, out, io);
      },
    },
  ],
  [
    "background",
    {
      options: ["w", "h", "focus", "scale", "palette", "out"],
      async run(opts, io) {
        const out = required(opts, "out");
        const focus = opts.get("focus");
        const paletteName = opts.get("palette");
        const svg = brandBackground({
          width: requiredNumeric(opts, "w"),
          height: requiredNumeric(opts, "h"),
          ...defined({
            focus: focus === undefined ? undefined : parseFocus(focus),
            scale: numeric(opts, "scale"),
            palette:
              paletteName === undefined ? undefined : palette(paletteName),
          }),
        });
        await emit(svg, out, io);
      },
    },
  ],
  [
    "gradient",
    {
      options: ["spec", "w", "h", "out"],
      async run(opts, io) {
        const out = required(opts, "out");
        const specPath = required(opts, "spec");
        const w = numeric(opts, "w");
        const h = numeric(opts, "h");
        if ((w === undefined) !== (h === undefined))
          throw new VisError("--w and --h must be given together");
        const spec = (await readSpec(specPath)) as GradientSpec;
        const size =
          w === undefined || h === undefined
            ? undefined
            : { width: w, height: h };
        await emit(gradientSvg(spec, size), out, io);
      },
    },
  ],
  [
    "pattern",
    {
      options: ["spec", "out"],
      async run(opts, io) {
        const out = required(opts, "out");
        const spec = (await readSpec(required(opts, "spec"))) as PatternSpec;
        await emit(pattern(spec).svg, out, io);
      },
    },
  ],
  [
    "favicons",
    {
      options: ["out", "background", "color"],
      async run(opts, io) {
        const written = await favicons({
          outDir: required(opts, "out"),
          ...defined({
            background: opts.get("background"),
            color: opts.get("color"),
          }),
        });
        io.stdout(written.map((p) => `wrote ${p}\n`).join(""));
      },
    },
  ],
]);

/**
 * Entry point behind bin/dag-vis.mjs. Returns the exit code (0, or 1 after one
 * line on stderr) and never throws or exits the process. Every argument and
 * spec file is user input: specs go straight into the generators, which throw
 * VisError naming the bad parameter; anything else is reported as an
 * unexpected error (message only, no stack).
 */
export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined) {
    io.stderr(USAGE);
    return 1;
  }
  if (name === "help" || wantsHelp(argv)) {
    io.stdout(USAGE);
    return 0;
  }
  try {
    const command = COMMANDS.get(name);
    if (command === undefined)
      throw new VisError(`unknown command: ${name.slice(0, 80)}`);
    await command.run(parseOptions(rest, command.options), io);
    return 0;
  } catch (error) {
    const message =
      error instanceof VisError
        ? error.message
        : `unexpected error: ${messageOf(error)}`;
    io.stderr(`dag-vis: ${oneLine(message)}\n`);
    return 1;
  }
}
