import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { Resvg } from "@resvg/resvg-js";

import { redPng, scratch, sized } from "./png-helpers.js";

/** A valid raster data: URI the guard must accept, blue so it never looks like a canary. */
export const bluePngUri = `data:image/png;base64,${Buffer.from(
  new Resvg(sized(10, 10, '<rect width="10" height="10" fill="#00f"/>'))
    .render()
    .asPng(),
).toString("base64")}`;

/**
 * A directory tree for bare-resvg runs: `<base>/canary.png` (reached by
 * `../canary.png`) and, in `<base>/cwd` (the child's working directory),
 * `canary.png`, `#canary.png` and `data:canary.png`, each a red PNG. A
 * renderer that opens any file an href names draws red.
 */
export function canaryWorld(): { cwd: string; abs: string } {
  const base = mkdtempSync(join(scratch, "world-"));
  const cwd = join(base, "cwd");
  mkdirSync(cwd);
  writeFileSync(join(base, "canary.png"), redPng);
  for (const name of ["canary.png", "#canary.png", "data:canary.png"])
    writeFileSync(join(cwd, name), redPng);
  return { cwd, abs: join(cwd, "canary.png") };
}

// Prints, per SVG, whether bare resvg drew a red pixel. Runs in the cwd it is given.
const PROBE = `
  const { readFileSync } = require("node:fs");
  const { Resvg } = require(process.argv[1]);
  const svgs = JSON.parse(readFileSync(process.argv[2], "utf8"));
  console.log(JSON.stringify(svgs.map((svg) => {
    const px = new Resvg(svg, { font: { loadSystemFonts: false } }).render().pixels;
    for (let i = 0; i < px.length; i += 4)
      if (px[i] > 200 && px[i + 1] < 60 && px[i + 2] < 60 && px[i + 3] > 200)
        return true;
    return false;
  })));`;

/** What bare resvg (no guard) draws for each SVG, rendered in one child process in `cwd`: true = a canary file was read. */
export function bareLeaks(svgs: readonly string[], cwd: string): boolean[] {
  const file = join(mkdtempSync(join(scratch, "cases-")), "cases.json");
  writeFileSync(file, JSON.stringify(svgs));
  const out = execFileSync(
    process.execPath,
    [
      "-e",
      PROBE,
      createRequire(import.meta.url).resolve("@resvg/resvg-js"),
      file,
    ],
    { cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 1 << 24 },
  );
  return JSON.parse(out) as boolean[];
}
