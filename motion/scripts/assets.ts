// Run from motion/: `npm run assets`.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BRAND_FONTS } from "../src/lib/font-files.ts";

// Resolve from this file, not the cwd, so the copy cannot land in the wrong folder.
const MOTION = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Moonhouse is allowed in videos, but its licence forbids redistributing the
// font FILE. Refuse to copy anything unless git ignores public/fonts/.
const ignored = spawnSync(
  "git",
  ["check-ignore", "-q", "public/fonts/moonhouse.ttf"],
  { cwd: MOTION },
);
if (ignored.status !== 0) {
  console.error(
    "assets: public/fonts/ is not gitignored; the Moonhouse licence forbids redistributing the font file. Nothing copied.",
  );
  process.exit(1);
}
const from = resolve(MOTION, "../src/node/fonts");
mkdirSync(resolve(MOTION, "public/fonts"), { recursive: true });
mkdirSync(resolve(MOTION, "public/generated"), { recursive: true });
for (const f of BRAND_FONTS)
  copyFileSync(resolve(from, f.from), resolve(MOTION, "public", f.file));
console.log(
  `assets: ${String(BRAND_FONTS.length)} fonts copied to public/fonts (gitignored)`,
);
