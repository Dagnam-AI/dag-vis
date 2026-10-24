// `node scripts/store.ts <out/<video>/<video>-<yyyymmdd>-vN.mp4> [--upload]` | `node scripts/store.ts --check`
//
// Stores a finished render, its .props.json and its .check.json in TWO places:
//   (a) the local folder $DAG_VIDEOS_DIR (default ../info/videos beside this checkout; gitignored there): always;
//   (b) the owner's R2 bucket under videos/<video>/<file>: ONLY with --upload.
// Nothing is overwritten, locally or in the bucket.
//
// --upload IS A REMOTE WRITE. It is run by the owner's own command, never by
// render.ts, a test, CI or an agent that has not been told to by the owner.
// Credentials come from the environment only (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_VIDEOS_BUCKET): this script never reads, writes or
// prints them, and every message it prints has them removed.
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { storedCheckProblems } from "../src/lib/ledger.ts";
import { sha256Hex, signRequest } from "../src/lib/sigv4.ts";
import {
  contentTypeFor,
  ledgerRow,
  markUploaded,
  readR2,
  redact,
  videoKey,
} from "../src/lib/store.ts";
import { fail } from "./cli.ts";

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

// An empty variable counts as unset (resolve("") would be the current folder).
const configured = process.env.DAG_VIDEOS_DIR;
const videosDir = resolve(
  configured === undefined || configured === ""
    ? fileURLToPath(new URL("../../../info/videos", import.meta.url))
    : configured,
);
if (!existsSync(dirname(videosDir))) {
  console.error(
    `DAG_VIDEOS_DIR: ${dirname(videosDir)} (the parent of ${videosDir}) does not exist. Clone info beside dag-vis, or set DAG_VIDEOS_DIR to <an existing folder>/videos.`,
  );
  process.exit(1);
}
if (check) {
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

  const send = (
    method: "HEAD" | "PUT",
    key: string,
    body?: Buffer,
    contentType?: string,
  ): Promise<Response> => {
    const { url, headers } = signRequest({
      method,
      accountId: r2.accountId,
      bucket: r2.bucket,
      key,
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
      payloadSha256: sha256Hex(body ?? ""),
      contentType,
      now: new Date(),
    });
    return fetch(url, {
      method,
      headers,
      ...(body ? { body: new Uint8Array(body) } : {}),
      signal: AbortSignal.timeout(10 * 60_000),
    });
  };
  // HEAD then PUT: an object that exists is left alone. (Two owners uploading the same name at once could race; there is one owner.)
  for (const f of files) {
    const key = videoKey(video, basename(f));
    const head = await send("HEAD", key);
    if (head.status === 200) {
      console.log(`r2: ${key} already exists, left untouched`);
      continue;
    }
    if (head.status !== 404)
      throw new Error(`r2 HEAD ${key}: HTTP ${String(head.status)}`);
    const put = await send("PUT", key, readFileSync(f), contentTypeFor(f));
    if (!put.ok)
      throw new Error(
        `r2 PUT ${key}: HTTP ${String(put.status)} ${(await put.text()).slice(0, 300)}`,
      );
    console.log(`r2: ${key} uploaded`);
  }
  writeFileSync(
    ledgerPath,
    markUploaded(
      readFileSync(ledgerPath, "utf8"),
      file,
      videoKey(video, basename(mp4)),
    ),
  );
  console.log("RENDERS.jsonl: stored.r2 recorded (commit it)");
}
