// Run from motion/: `npm run assets`.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BRAND_FONTS } from "../src/lib/font-files.ts";

// Resolve from this file, not the cwd, so the copy cannot land in the wrong folder.
const MOTION = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Moonhouse is allowed in videos, but its licence forbids redistributing the
// font FILE. Refuse to copy anything unless git positively says public/fonts/ is
// ignored. `git check-ignore -q` exits 0 (ignored), 1 (not ignored) or 128 (git
// itself failed); a spawn error leaves status null. Anything but 0 stops the
// copy, and the message names which of the two causes it was.
const check = spawnSync(
  "git",
  ["check-ignore", "-q", "public/fonts/moonhouse.ttf"],
  { cwd: MOTION, encoding: "utf8" },
);
if (check.status !== 0) {
  const why =
    check.status === 1
      ? "public/fonts/ is not gitignored"
      : `could not verify that public/fonts/ is gitignored (git check-ignore ${
          check.error?.message ??
          `exited ${String(check.status)}: ${check.stderr.trim()}`
        })`;
  console.error(
    `assets: ${why}; the Moonhouse licence forbids redistributing the font file. Nothing copied.`,
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
