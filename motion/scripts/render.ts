// `npm run render -- <video> [--props '<json>'] [--crf 18]`
//
// One command, one deliverable: the sound bed, a versioned MP4 rendered with
// swangle, the picture and sound checks, a copy of the MP4, its props and its
// check output in the local videos folder, and one line in RENDERS.jsonl. A
// failed check writes no ledger line: a failed render is not a render.
//
// Never uploads: the R2 copy is the owner's own command, described in store.ts.
//
// `--preview-not-a-deliverable` renders with whatever MOTION_GL says (for a
// quick look on the GPU) into out/<video>/preview/, checks it, and stops: no
// versioned name, no stored copy, no ledger line.
//
// A deliverable is rendered from a clean checkout: the ledger records the commit
// (`git`) and `dirty`, and uncommitted changes (the ledger itself aside) are
// refused unless `--allow-dirty`, which records `dirty: true`.
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";

import { dirtyPaths } from "../src/lib/git-state.ts";
import {
  checkRecord,
  ledgerLine,
  parseCheckReport,
} from "../src/lib/ledger.ts";
import {
  ALLOW_DIRTY_FLAG,
  PREVIEW_FLAG,
  parseRenderArgs,
  rendererProblem,
  type RenderArgs,
} from "../src/lib/render-args.ts";
import { sha256Hex } from "../src/lib/sigv4.ts";
import { ledgerNames } from "../src/lib/store.ts";
import { nextVersionedName, utcDateStamp } from "../src/lib/versions.ts";
import { gl } from "../webpack-override.ts";
import { fail } from "./cli.ts";
import { MOTION } from "./ffmpeg.ts";
import { videosDir } from "./videos-dir.ts";

const USAGE = `node scripts/render.ts <video> [--props '<json>'] [--crf 18] [${ALLOW_DIRTY_FLAG}] [${PREVIEW_FLAG}]`;
// The webpack alias and every relative path (out/, public/, RENDERS.jsonl) are motion/'s.
if (resolve(process.cwd()) !== MOTION)
  fail(USAGE, `run from ${MOTION}, not ${process.cwd()}`);
let args: RenderArgs;
try {
  args = parseRenderArgs(process.argv.slice(2));
} catch (e) {
  args = fail(USAGE, (e as Error).message);
}
const { video, props, crf, preview, allowDirty } = args;

// The renderer is part of a render's identity: refuse before any work is done.
const renderer = gl();
const refused = rendererProblem(renderer, preview);
if (refused !== null) fail(USAGE, refused);

const REMOTION_BIN = resolve(MOTION, "node_modules/.bin/remotion");
const run = (cmd: string, argv: string[], show = false): string => {
  const r = spawnSync(cmd, argv, {
    cwd: MOTION,
    stdio: ["ignore", show ? "inherit" : "pipe", "inherit"],
    encoding: "utf8",
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    console.error(`${[cmd, ...argv].join(" ")} exited ${String(r.status)}`);
    process.exit(r.status ?? 1);
  }
  return show ? "" : r.stdout;
};
const script = (name: string, ...argv: string[]): string =>
  run(process.execPath, [`scripts/${name}.ts`, ...argv]);

// The commit this render is made from, and whether the tree matches it (the ledger is not part of a video).
const git = run("git", ["rev-parse", "HEAD"]).trim();
const changed = dirtyPaths(run("git", ["status", "--porcelain"]), [
  "motion/RENDERS.jsonl",
]);
const dirty = changed.length > 0;
if (dirty && !preview && !allowDirty)
  fail(
    USAGE,
    `uncommitted changes, so commit ${git.slice(0, 7)} does not describe this video:\n  ${changed.slice(0, 10).join("\n  ")}${changed.length > 10 ? `\n  ... and ${String(changed.length - 10)} more` : ""}\nCommit them, or pass ${ALLOW_DIRTY_FLAG} to record dirty: true.`,
  );

// 0. fail fast, before a long render, if the local videos folder cannot be used (the message names DAG_VIDEOS_DIR)
if (!preview) console.log(script("store", "--check").trim());

// 1. the sound bed, normalised (exits 1 if the material cannot reach -16 LUFS / -1 dBTP)
if (existsSync(resolve(MOTION, `src/videos/${video}/audio.ts`)))
  console.error(script("audio", video).trim());
else if (preview)
  console.error(
    `preview: src/videos/${video}/audio.ts not found, rendering without a sound bed`,
  );
else
  fail(
    USAGE,
    `src/videos/${video}/audio.ts not found: a deliverable has a sound bed`,
  );

// 2. names: versioned and never overwritten (the config also sets overwrite off); a preview has one throwaway name
const date = utcDateStamp(new Date());
const outDir = resolve(MOTION, "out", video, preview ? "preview" : "");
mkdirSync(outDir, { recursive: true });
// A version number is taken if out/, the ledger or the videos folder already has it (out/ may have been cleaned).
const videosFolder = resolve(videosDir, video);
const taken = [
  ...readdirSync(outDir),
  ...ledgerNames(readFileSync(resolve(MOTION, "RENDERS.jsonl"), "utf8"), video),
  ...(existsSync(videosFolder) ? readdirSync(videosFolder) : []),
];
const name = preview
  ? `${video}-preview-not-a-deliverable.mp4`
  : nextVersionedName(taken, video, date, ".mp4");
const out = resolve(outDir, name);
const stem = out.replace(/\.mp4$/, "");
const propsFile = `${stem}.props.json`;
// "wx" claims the name: a concurrent render that picked the same one fails here instead of overwriting.
writeFileSync(propsFile, `${JSON.stringify(props, null, 2)}\n`, {
  flag: preview ? "w" : "wx",
});

// 3. render (entry point and public dir come from remotion.config.ts; --gl repeats the renderer so the ledger states what ran)
run(
  REMOTION_BIN,
  [
    "render",
    video,
    out,
    preview ? "--overwrite=true" : "--overwrite=false",
    "--codec",
    "h264",
    "--crf",
    String(crf),
    "--props",
    propsFile,
    "--gl",
    renderer,
  ],
  true,
);

// 4. verify picture and sound; keep the check output beside the MP4
const checked = spawnSync(
  process.execPath,
  ["scripts/check-render.ts", out, video, "--json"],
  { cwd: MOTION, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
if (checked.error) throw checked.error;
const relativeFile = `out/${relative(resolve(MOTION, "out"), out)}`;
const parsed = parseCheckReport(checked.stdout, checked.stderr);
// A check that exited non-zero without naming a problem still fails (and says so in the record kept beside the MP4).
const report =
  checked.status !== 0 && parsed.problems.length === 0
    ? { ...parsed, problems: [`check-render exited ${String(checked.status)}`] }
    : parsed;
const record = checkRecord(report, relativeFile, renderer, { git, dirty });
writeFileSync(`${stem}.check.json`, `${JSON.stringify(record)}\n`);
if (report.problems.length > 0) {
  console.error(
    [
      `${relativeFile} failed its checks (nothing stored, no ledger line):`,
      ...report.problems,
    ].join("\n  "),
  );
  process.exit(1);
}
if (preview) {
  console.log(JSON.stringify(record, null, 2));
  console.log(
    `preview only, renderer ${renderer}: ${out} is not a deliverable and was not stored or recorded`,
  );
  process.exit(0);
}

// 5. store: the local folder only (the R2 copy is the owner's own command in store.ts, never run from here)
console.log(script("store", out).trim());

// 6. ledger (committed); `stored.r2` stays null until the owner uploads
const remotion = (
  JSON.parse(
    readFileSync(resolve(MOTION, "node_modules/remotion/package.json"), "utf8"),
  ) as { version: string }
).version;
const line = ledgerLine({
  video,
  name,
  sha256: sha256Hex(readFileSync(out)),
  bytes: statSync(out).size,
  report,
  props,
  git,
  dirty,
  remotion,
  gl: renderer,
  renderedAt: new Date().toISOString(),
});
appendFileSync(resolve(MOTION, "RENDERS.jsonl"), `${JSON.stringify(line)}\n`);
console.log(JSON.stringify(line, null, 2));
