import { resolve } from "node:path";

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
  parseArguments,
  parseFocus,
  wantsHelp,
} from "./cli-args.js";
import { EXPORT_COMMANDS } from "./cli-export.js";
import {
  numeric,
  readSpec,
  required,
  requiredNumeric,
  writeOut,
} from "./cli-support.js";
import type { CliIo, Command, Options } from "./cli-support.js";
import { favicons } from "./favicons.js";
import { renderPng } from "./render-png.js";
import { messageOf } from "./util.js";

export type { CliIo } from "./cli-support.js";

export const USAGE = `Dagnam visuals from the command line (dag-vis <command> [options])

  dag-vis og --title T [--subtitle S --eyebrow E --footer F --theme dark|light --w 1200 --h 630] --out f.(svg|png)
  dag-vis background --w W --h H [--focus x,y --scale N --palette red|mono|stripes|ocean|ember] --out f.(svg|png)
  dag-vis gradient --spec spec.json [--w W --h H] --out f.(svg|png)
  dag-vis pattern --spec spec.json --out f.(svg|png)
  dag-vis favicons --out DIR [--background C --color C]
  dag-vis export <preset|spec.json> --out FILE [--format F] [--w N --h N | --size NAME]
                 [--fps N --duration S --loop] [--quality Q] [--t S] [--alpha] [--poster FILE]
  dag-vis presets
  dag-vis sheet --out f.png [--tile 300x170 --gap 32 --columns 4]

For og, background, gradient and pattern an --out must end in .svg or .png (any
case), or the command exits 1 and writes nothing; .png is rasterised with the
bundled Inter fonts (needs @resvg/resvg-js), .svg is written as is. favicons
--out is a directory. These commands and sheet write atomically (a temp file
renamed over the target, so an existing file is replaced even if read-only, and
the new one gets the default mode) and create missing parent directories.
Numbers are plain decimals (600, 0.5); --focus is x,y in 0..1.
Options take "--name value" or "--name=value" (use the second form for a value
that starts with "--"). A spec is a JSON object in a file of at most 1 MiB. To
rasterise a gradient spec whose overlay has an image, give the image as a
raster data: URI (data:image/png, jpeg, gif or webp; a URL, a path or an SVG
data: URI cannot be rendered to PNG; SVG output keeps it as is).

export renders a preset (dag-vis presets lists them) or a spec file ending in
.json: a field (flow, fluid, fluted over either), gradient or ribbon spec.
The format is the --out extension (png jpg jpeg webp avif svg gif apng mp4
webm) or --format, which also takes png-seq (then --out is the folder that
receives frame-00000.png and so on). The size is --size og|square|story|
wallpaper|4k|header or --w and --h in whole pixels (default og, 1200x630).
Animations take --fps (1..60, default 30), --duration in seconds (default 6),
--loop (a seamless loop), --alpha (webm and apng) and --poster FILE (frame 0 as
a PNG). Stills take --t, the second to draw; --loop with --duration picks the
frame an animation of that length shows. --quality is 0..1 (default 0.8) and
applies to jpeg, webp, avif, mp4 and webm only. jpg, webp and avif stills and
apng, mp4 and webm animations need ffmpeg on the PATH (or its path in
DAG_VIS_FFMPEG); png, svg, gif and png-seq do not. An option that does not apply
to the chosen format is an error. export writes through a temp file and a
rename and does not create the folder of --out (png-seq creates its own
folder); sheet --out must end in .png and creates missing folders like the
commands above. presets prints one name and kind per line, in the order of the
sheet, which draws every preset in a grid.
Warnings (a GIF wider than 800 px or faster than 50 fps) go to stderr and the
exit status stays 0.
Exit status 0 on success, 1 on any error (one line on stderr).
`;

/** The file `--out` of a command that writes one: required, and .svg or .png in any case. */
function outFile(opts: Options): string {
  const out = required(opts, "out");
  if (!/\.(?:svg|png)$/i.test(out))
    throw new VisError(
      `--out must end in .svg or .png, got ${describeValue(out)}`,
    );
  return out;
}

function themeOption(opts: Options): "dark" | "light" | undefined {
  const v = opts.get("theme");
  if (v === undefined || v === "dark" || v === "light") return v;
  throw new VisError(`--theme must be dark or light, got ${describeValue(v)}`);
}

/** Rasterises SVG that one of this package's generators produced (never a user's file). */
async function toPng(svg: string): Promise<Buffer> {
  try {
    return await renderPng(svg);
  } catch (error) {
    throw new VisError(`cannot render PNG: ${messageOf(error)}`);
  }
}

/** Renders (PNG when `out` ends in .png, any case; else the SVG as is) and writes. `out` is already checked by `outFile`. */
async function emit(svg: string, out: string, io: CliIo): Promise<void> {
  const path = resolve(out);
  await writeOut(
    path,
    path.toLowerCase().endsWith(".png") ? await toPng(svg) : svg,
  );
  io.stdout(`wrote ${path}\n`);
}

// A Map, not an object: `constructor`, `__proto__` and friends must be unknown commands.
const COMMANDS = new Map<string, Command>([
  ...EXPORT_COMMANDS,
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
        const out = outFile(opts);
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
        const out = outFile(opts);
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
        const out = outFile(opts);
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
        const out = outFile(opts);
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
  const input: unknown = argv;
  if (!Array.isArray(input) || input.some((a) => typeof a !== "string")) {
    io.stderr(
      `dag-vis: argv must be an array of strings, got ${describeValue(input)}\n`,
    );
    return 1;
  }
  const [name, ...rest] = argv;
  if (name === undefined) {
    io.stderr(USAGE);
    return 1;
  }
  if (name === "help" || wantsHelp(argv, COMMANDS.get(name)?.flags)) {
    io.stdout(USAGE);
    return 0;
  }
  try {
    const command = COMMANDS.get(name);
    if (command === undefined)
      throw new VisError(`unknown command: ${name.slice(0, 80)}`);
    const parsed = parseArguments(rest, {
      values: command.options,
      ...defined({ flags: command.flags, positionals: command.positionals }),
    });
    await command.run(parsed.values, io, parsed);
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
