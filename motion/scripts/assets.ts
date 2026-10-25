// Run from motion/: `npm run assets`.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BRAND_FONTS,
  FONT_FOLDER,
  FONT_SOURCE_DIR,
  PUBLIC_DIR,
} from "../src/lib/font-files.ts";

// Resolve from this file, not the cwd, so the copy cannot land in the wrong folder.
const MOTION = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Where the faces land (public/fonts), from the module that also registers them.
const FONT_DIR = join(PUBLIC_DIR, FONT_FOLDER);

// Moonhouse is allowed in videos, but its licence forbids redistributing the
// font FILE. Refuse to copy anything unless git positively says public/fonts/ is
// ignored. `git check-ignore -q` exits 0 (ignored), 1 (not ignored) or 128 (git
// itself failed); a spawn error leaves status null. Anything but 0 stops the
// copy, and the message names which of the two causes it was.
const check = spawnSync(
  "git",
  ["check-ignore", "-q", join(FONT_DIR, "moonhouse.ttf")],
  { cwd: MOTION, encoding: "utf8" },
);
if (check.status !== 0) {
  const why =
    check.status === 1
      ? `${FONT_DIR}/ is not gitignored`
      : `could not verify that ${FONT_DIR}/ is gitignored (git check-ignore ${
          check.error?.message ??
          `exited ${String(check.status)}: ${check.stderr.trim()}`
        })`;
  console.error(
    `assets: ${why}; the Moonhouse licence forbids redistributing the font file. Nothing copied.`,
  );
  process.exit(1);
}
const from = resolve(MOTION, FONT_SOURCE_DIR);
mkdirSync(resolve(MOTION, FONT_DIR), { recursive: true });
mkdirSync(resolve(MOTION, PUBLIC_DIR, "generated"), { recursive: true });
for (const f of BRAND_FONTS)
  copyFileSync(resolve(from, f.from), resolve(MOTION, PUBLIC_DIR, f.file));
console.log(
  `assets: ${String(BRAND_FONTS.length)} fonts copied to ${FONT_DIR} (gitignored)`,
);
