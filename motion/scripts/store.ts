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
// The upload test points the endpoint at a server on this machine through a
// loopback-only override that readR2 validates (README); unset, the host is built
// from R2_ACCOUNT_ID.
//
// The upload starts with a HEAD of each key, so the token needs READ as well as
// write: grant it Object Read & Write on the videos bucket. A 403 on HEAD stops
// the upload (it is never read as "absent"). An object that is already there
// is left alone and counts as uploaded only if it is this file: with our
// x-amz-meta-sha256 on it, that value must equal this file's sha256 (any other
// value fails, whatever its size and ETag); only an object WITHOUT that
// metadata is judged by size and a plain MD5 ETag. Otherwise the upload fails
// and nothing is recorded. Make the first --upload a throwaway
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

import { storedCheckProblems } from "../src/lib/ledger.ts";
import { putIfAbsent, type HttpRequest } from "../src/lib/r2.ts";
import { sha256Hex } from "../src/lib/sigv4.ts";
import {
  contentTypeFor,
  ledgerRow,
  markUploaded,
  readR2,
  localCopyAction,
  redact,
  uploadProblem,
  videoKey,
} from "../src/lib/store.ts";
import { MOTION, cli, fail, requireMotionCwd } from "./cli.ts";
import { requireUsableVideosDir, videosDir } from "./videos-dir.ts";

const USAGE =
  "node scripts/store.ts <out/<video>/<name>.mp4> [--upload] | --check";
// RENDERS.jsonl and the relative render paths are motion/'s.
requireMotionCwd(USAGE);

const { flags, positionals } = cli(USAGE, ["upload", "check"]);
const upload = flags.has("upload");
const check = flags.has("check");
const [target, ...extra] = positionals;
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
  // --upload with no usable credentials is a failure (exit 1), named before anything is copied.
  const unusable = upload ? uploadProblem(r2) : null;
  if (unusable !== null) throw new Error(unusable);
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
    const action = localCopyAction(
      existsSync(to) ? sha256Hex(readFileSync(to)) : null,
      sha256Hex(readFileSync(f)),
    );
    if (action === "conflict")
      throw new Error(
        `${to} exists with different content; renders are never overwritten`,
      );
    if (action === "copy") {
      copyFileSync(f, to, constants.COPYFILE_EXCL);
      console.log(`local: ${video}/${basename(f)} -> ${to}`);
    } else {
      console.log(`local: ${video}/${basename(f)} already stored`);
    }
  }
  if (!upload) return;

  // (b) R2, only on --upload.
  // r2.kind is "ready" here: checked before anything was copied.
  if (r2.kind !== "ready") throw new Error(uploadProblem(r2) ?? "");

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
