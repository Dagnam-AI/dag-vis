// `npm run sheet -- <video> [--props <json>]` (from motion/): render the storyboard frames as stills, then the `sheet` composition over them. Remotion renders the sheet, so nothing here imports dist/.
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

import { sheetColumns } from "../src/lib/sheet.ts";
import { parseSheetArgs } from "../src/lib/sheet-args.ts";
import { framesFor, type Timing } from "../src/lib/timing.ts";
import { nextVersionedName, utcDateStamp } from "../src/lib/versions.ts";
import { gl, webpackOverride } from "../webpack-override.ts";

const USAGE = "node scripts/sheet.ts <video> [--props <json>]";
const fail = (message: string): never => {
  console.error(`${message}\nusage: ${USAGE}`);
  process.exit(1);
};
const MOTION = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The webpack alias resolves ../src against the working directory.
if (resolve(process.cwd()) !== MOTION)
  fail(`run from ${MOTION}, not ${process.cwd()}`);
let args: ReturnType<typeof parseSheetArgs>;
try {
  args = parseSheetArgs(process.argv.slice(2));
} catch (e) {
  args = fail((e as Error).message);
}
const { video, props: inputProps } = args;
const { TIMING } = (await import(`../src/videos/${video}/timing.ts`)) as {
  TIMING: Timing;
};

const publicDir = resolve(MOTION, "public");
const framesDir = resolve(publicDir, "generated/sheet", video);
const outDir = resolve(MOTION, "out", video);
mkdirSync(framesDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const chromiumOptions = { gl: gl() };
const scale = 480 / TIMING.width;

// One bundle serves both passes: `symlinkPublicDir` links public/ instead of copying it,
// so the stills written below are visible to the sheet. bundle() never cleans its
// output, so it goes in our own temp dir, removed in `finally`; with the link the
// licensed font file is never copied there either.
const bundleDir = mkdtempSync(join(tmpdir(), "remotion-webpack-bundle-"));
try {
  const serveUrl = await bundle({
    entryPoint: resolve(MOTION, "src/index.ts"),
    publicDir,
    outDir: bundleDir,
    symlinkPublicDir: true,
    webpackOverride,
  });

  const composition = await selectComposition({
    serveUrl,
    id: video,
    inputProps,
    chromiumOptions,
  });
  const tiles: { src: string; caption: string }[] = [];
  for (const [i, s] of TIMING.storyboard.entries()) {
    const frame = framesFor(s.at, TIMING.fps);
    const file = `${String(i).padStart(2, "0")}-f${String(frame)}.png`;
    await renderStill({
      composition,
      serveUrl,
      output: resolve(framesDir, file),
      frame,
      inputProps,
      imageFormat: "png",
      scale,
      chromiumOptions,
    });
    tiles.push({
      src: `generated/sheet/${video}/${file}`,
      caption: `${s.at.toFixed(2)}s - ${s.caption}`,
    });
  }

  const sheetProps = {
    title: `${video} storyboard (${String(TIMING.width)}x${String(TIMING.height)} @ ${String(TIMING.fps)} fps, ${String(TIMING.duration)} s, ${chromiumOptions.gl})`,
    tiles,
    cols: sheetColumns(tiles.length),
    tileWidth: 480,
    tileHeight: Math.round(TIMING.height * scale),
  };
  const sheet = await selectComposition({
    serveUrl,
    id: "sheet",
    inputProps: sheetProps,
    chromiumOptions,
  });
  const name = nextVersionedName(
    readdirSync(outDir),
    `${video}-sheet`,
    utcDateStamp(new Date()),
    ".png",
  );
  const output = resolve(outDir, name);
  // overwrite: false because the Node API ignores remotion.config.ts; a name taken
  // by a concurrent run fails loudly here instead of replacing its sheet.
  await renderStill({
    composition: sheet,
    serveUrl,
    output,
    inputProps: sheetProps,
    imageFormat: "png",
    overwrite: false,
    chromiumOptions,
  });
  console.log(output);
} finally {
  rmSync(bundleDir, { recursive: true, force: true });
}
