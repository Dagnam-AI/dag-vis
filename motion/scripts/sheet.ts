// `npm run sheet -- <video>` (from motion/): render the storyboard frames as stills, then the `sheet` composition over them. Remotion renders the sheet, so nothing here imports dist/.
import { mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

import { framesFor, type Timing } from "../src/lib/timing.ts";
import { nextVersionedName, utcDateStamp } from "../src/lib/versions.ts";
import { gl, webpackOverride } from "../webpack-override.ts";

const video = process.argv[2];
if (!video || !/^[\w-]+$/.test(video))
  throw new Error("usage: node scripts/sheet.ts <video>");
// The webpack alias resolves ../src against the working directory.
if (basename(process.cwd()) !== "motion")
  throw new Error(`run from motion/, not ${process.cwd()}`);
const MOTION = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { TIMING } = (await import(`../src/videos/${video}/timing.ts`)) as {
  TIMING: Timing;
};

const publicDir = resolve(MOTION, "public");
const framesDir = resolve(publicDir, "generated/sheet", video);
const outDir = resolve(MOTION, "out", video);
mkdirSync(framesDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const chromiumOptions = { gl: gl() };
const entryPoint = resolve(MOTION, "src/index.ts");
const scale = 480 / TIMING.width;

// Pass 1: the video's own frames, written into public/ (gitignored).
const videoUrl = await bundle({ entryPoint, publicDir, webpackOverride });
const composition = await selectComposition({
  serveUrl: videoUrl,
  id: video,
  chromiumOptions,
});
const tiles: { src: string; caption: string }[] = [];
for (const [i, s] of TIMING.storyboard.entries()) {
  const frame = framesFor(s.at, TIMING.fps);
  const file = `${String(i).padStart(2, "0")}-f${String(frame)}.png`;
  await renderStill({
    composition,
    serveUrl: videoUrl,
    output: resolve(framesDir, file),
    frame,
    imageFormat: "png",
    scale,
    chromiumOptions,
  });
  tiles.push({
    src: `generated/sheet/${video}/${file}`,
    caption: `${s.at.toFixed(2)}s - ${s.caption}`,
  });
}

// Pass 2: bundle() copies public/ at bundle time, so the sheet needs a second bundle to see the new stills.
const sheetUrl = await bundle({ entryPoint, publicDir, webpackOverride });
const sheetProps = {
  title: `${video} storyboard (${String(TIMING.width)}x${String(TIMING.height)} @ ${String(TIMING.fps)} fps, ${String(TIMING.duration)} s, ${chromiumOptions.gl})`,
  tiles,
  cols: 3,
  tileWidth: 480,
  tileHeight: Math.round(TIMING.height * scale),
};
const sheet = await selectComposition({
  serveUrl: sheetUrl,
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
await renderStill({
  composition: sheet,
  serveUrl: sheetUrl,
  output,
  inputProps: sheetProps,
  imageFormat: "png",
  chromiumOptions,
});
console.log(output);
