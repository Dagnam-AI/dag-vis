// `node scripts/store.ts <out/<video>/<video>-<yyyymmdd>-vN.mp4> [--upload]` | `node scripts/store.ts --check`
//
// Stores a finished render, its .props.json and its .check.json in TWO places:
//   (a) the local folder $DAG_VIDEOS_DIR (default ../info/videos beside this checkout; gitignored there): always;
//   (b) the owner's R2 bucket under videos/<video>/<file>: ONLY with --upload.
// Nothing is overwritten, locally or in the bucket. A videos folder inside a git
// work tree that does not ignore it is refused.
//
// --upload IS A REMOTE WRITE. It is run by the owner's own command, never by
// render.ts, a test, CI or an agent that has not been told to by the owner.
// Credentials come from the environment only (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_VIDEOS_BUCKET): this script never reads, writes or
// prints them, and every message it prints has them removed.
//
// The upload starts with a HEAD of each key, so the token needs READ as well as
// write: grant it Object Read & Write on the videos bucket. A 403 on HEAD stops
// the upload (it is never read as "absent"). An object that is already there
// is left alone and counts as uploaded only if it is this file (our own
// x-amz-meta-sha256, or a matching size and plain MD5 ETag); otherwise the
// upload fails and nothing is recorded. Make the first --upload a throwaway
// render, not a real video.
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { storedCheckProblems } from "../src/lib/ledger.ts";
import { putIfAbsent, type HttpRequest } from "../src/lib/r2.ts";
import { sha256Hex } from "../src/lib/sigv4.ts";
import {
  contentTypeFor,
  ledgerRow,
  markUploaded,
  readR2,
  redact,
  videoKey,
} from "../src/lib/store.ts";
import { fail } from "./cli.ts";
import { requireUsableVideosDir, videosDir } from "./videos-dir.ts";

const USAGE =
  "node scripts/store.ts <out/<video>/<name>.mp4> [--upload] | --check";
const MOTION = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// RENDERS.jsonl and the relative render paths are motion/'s.
if (resolve(process.cwd()) !== MOTION)
  fail(USAGE, `run from ${MOTION}, not ${process.cwd()}`);

let parsed: ReturnType<typeof parseArgs>;
try {
  parsed = parseArgs({
    options: {
      upload: { type: "boolean" },
      check: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
  });
} catch (e) {
  fail(USAGE, (e as Error).message);
}
const { upload = false, check = false } = parsed.values;
const [target, ...extra] = parsed.positionals;
if (extra.length > 0 || (check && target !== undefined))
  fail(USAGE, "expected one render file, or --check alone");

if (check) {
  requireUsableVideosDir("check/check.mp4");
  console.log(`videos folder ok: ${videosDir}`);
  process.exit(0);
}
if (target === undefined) fail(USAGE, "expected one render file, or --check");

const r2 = readR2(process.env);
const secrets =
  r2.kind === "ready"
    ? [r2.secretAccessKey, r2.accessKeyId, r2.accountId, r2.bucket]
    : [];

try {
  await store(resolve(target));
} catch (e) {
  console.error(redact((e as Error).message, secrets));
  process.exit(1);
}

async function store(mp4: string): Promise<void> {
  const video = basename(dirname(mp4));
  const stem = mp4.replace(/\.mp4$/, "");
  const files = [mp4, `${stem}.props.json`, `${stem}.check.json`];
  for (const f of files) {
    if (!existsSync(f)) throw new Error(`missing ${f}`);
    videoKey(video, basename(f)); // validates the names before anything is copied or sent
  }

  // Only a render that passed its checks is stored: its .check.json says so.
  const problems = storedCheckProblems(
    readFileSync(`${stem}.check.json`, "utf8"),
  );
  if (problems.length > 0)
    throw new Error(
      `${basename(mp4)} did not pass its checks: ${problems.join("; ")}`,
    );

  requireUsableVideosDir(`${video}/${basename(mp4)}`);

  // (a) local copy: never overwrite (COPYFILE_EXCL); an identical file is already stored, a different one is an error.
  mkdirSync(resolve(videosDir, video), { recursive: true });
  for (const f of files) {
    const to = resolve(videosDir, video, basename(f));
    if (!existsSync(to)) {
      copyFileSync(f, to, constants.COPYFILE_EXCL);
      console.log(`local: ${video}/${basename(f)} -> ${to}`);
    } else if (sha256Hex(readFileSync(to)) === sha256Hex(readFileSync(f))) {
      console.log(`local: ${video}/${basename(f)} already stored`);
    } else {
      throw new Error(
        `${to} exists with different content; renders are never overwritten`,
      );
    }
  }
  if (!upload) return;

  // (b) R2, only on --upload.
  if (r2.kind === "absent") {
    console.log(
      "R2 upload skipped: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_VIDEOS_BUCKET are not set",
    );
    return;
  }
  if (r2.kind === "partial")
    throw new Error(`R2 upload: also set ${r2.missing.join(", ")}`);

  // Only a render the ledger knows, byte for byte, goes online: checked before the first request.
  const ledgerPath = resolve(MOTION, "RENDERS.jsonl");
  const file = `out/${video}/${basename(mp4)}`;
  const row = ledgerRow(readFileSync(ledgerPath, "utf8"), file);
  if (row.sha256 !== sha256Hex(readFileSync(mp4)))
    throw new Error(
      `${file} differs from its ledger line (sha256); not uploading`,
    );

  // HEAD then PUT, never an overwrite (putIfAbsent). Two owners uploading one name at once could race; there is one owner.
  const send = (url: string, init: HttpRequest): Promise<Response> =>
    fetch(url, { ...init, signal: AbortSignal.timeout(10 * 60_000) });
  for (const f of files) {
    const key = videoKey(video, basename(f));
    const buf = readFileSync(f);
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const done = await putIfAbsent(
      r2,
      key,
      bytes,
      contentTypeFor(f),
      send,
      () => new Date(),
    );
    console.log(
      done === "uploaded"
        ? `r2: ${key} uploaded`
        : `r2: ${key} already exists and is this file, left untouched`,
    );
  }
  // Written beside the ledger and renamed over it, so an interrupted write cannot truncate it.
  const next = `${ledgerPath}.tmp`;
  writeFileSync(
    next,
    markUploaded(
      readFileSync(ledgerPath, "utf8"),
      file,
      videoKey(video, basename(mp4)),
    ),
  );
  renameSync(next, ledgerPath);
  console.log("RENDERS.jsonl: stored.r2 recorded (commit it)");
}
