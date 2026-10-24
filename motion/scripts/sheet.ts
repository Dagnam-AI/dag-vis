// `npm run sheet -- <video> [--props <json>]` (from motion/): render the storyboard frames as stills, then the `sheet` composition over them. Remotion renders the sheet, so nothing here imports dist/.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { bundle } from "@remotion/bundler";
import {
  openBrowser,
  renderStill,
  selectComposition,
  type HeadlessBrowser,
} from "@remotion/renderer";

import { sheetColumns } from "../src/lib/sheet.ts";
import { parseSheetArgs } from "../src/lib/sheet-args.ts";
import { framesFor, type Timing } from "../src/lib/timing.ts";
import { nextVersionedName, utcDateStamp } from "../src/lib/versions.ts";
import { gl, webpackOverride } from "../webpack-override.ts";
import { MOTION, fail, requireMotionCwd } from "./cli.ts";

const USAGE = "node scripts/sheet.ts <video> [--props <json>]";
// bundle() copies public/ on Windows, so the stills written after it would not be served.
if (process.platform === "win32")
  fail(USAGE, "sheet.ts needs symlinks (macOS/Linux)");
// The webpack alias resolves ../src against the working directory.
requireMotionCwd(USAGE);
let args: ReturnType<typeof parseSheetArgs>;
try {
  args = parseSheetArgs(process.argv.slice(2));
} catch (e) {
  args = fail(USAGE, (e as Error).message);
}
const { video, props: inputProps } = args;
const { TIMING } = (await import(`../src/videos/${video}/timing.ts`)) as {
  TIMING: Timing;
};

const publicDir = resolve(MOTION, "public");
const outDir = resolve(MOTION, "out", video);
// A directory of its own per run (not per video), so concurrent runs of one video
// with different --props cannot overwrite each other's stills.
mkdirSync(resolve(publicDir, "generated/sheet"), { recursive: true });
const framesDir = mkdtempSync(
  resolve(publicDir, "generated/sheet", `${video}-`),
);
const runId = basename(framesDir);

const chromiumOptions = { gl: gl() };
const scale = 480 / TIMING.width;

// One bundle serves both passes: `symlinkPublicDir` links public/ instead of copying it,
// so the stills written below are visible to the sheet. bundle() never cleans its
// output, so it goes in our own temp dir, removed in `finally`; with the link the
// licensed font file is never copied there either.
const bundleDir = mkdtempSync(join(tmpdir(), "remotion-webpack-bundle-"));
// The stills only feed the sheet and the bundle is scratch: remove both on every
// exit (success, failure, Ctrl+C, SIGTERM), plus out/<video>/ if nothing was written to it.
let browser: HeadlessBrowser | undefined;
const cleanup = (): void => {
  rmSync(bundleDir, { recursive: true, force: true });
  rmSync(framesDir, { recursive: true, force: true });
  if (existsSync(outDir) && readdirSync(outDir).length === 0) rmdirSync(outDir);
};
// process.exit would orphan the browser, so close it first.
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    cleanup();
    void (browser?.close({ silent: true }) ?? Promise.resolve()).finally(() =>
      process.exit(signal === "SIGINT" ? 130 : 143),
    );
  });
try {
  // One browser for every frame and the sheet, so there is one thing to close.
  browser = await openBrowser("chrome", { chromiumOptions });
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
    puppeteerInstance: browser,
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
      puppeteerInstance: browser,
    });
    tiles.push({
      src: `generated/sheet/${runId}/${file}`,
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
    puppeteerInstance: browser,
  });
  mkdirSync(outDir, { recursive: true });
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
    puppeteerInstance: browser,
  });
  console.log(output);
} finally {
  await browser?.close({ silent: true });
  cleanup();
}
