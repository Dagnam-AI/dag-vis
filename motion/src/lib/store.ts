// Where a finished render is stored: a local folder always, the owner's R2 bucket on request.
// Pure: no fs, no network, no clock.
export interface Stored {
  /** Relative to the local videos folder ($DAG_VIDEOS_DIR): `<video>/<file>`. */
  local: string;
  /** The R2 object key, or null until the owner has run `store.ts --upload`. */
  r2: string | null;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isVideoSlug = (video: string): boolean => SLUG.test(video);
const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `videos/<video>/<file>`, the file exactly as the versioned render named it; throws on anything else (no traversal, no stray extension). */
export function videoKey(video: string, file: string): string {
  if (!isVideoSlug(video)) throw new Error(`invalid video name "${video}"`);
  if (
    !new RegExp(
      `^${escapeRegExp(video)}-\\d{8}-v\\d+\\.(mp4|props\\.json|check\\.json)$`,
    ).test(file)
  ) {
    throw new Error(`invalid file name "${file}" for video "${video}"`);
  }
  return `videos/${video}/${file}`;
}

export function newStored(video: string, file: string): Stored {
  return { local: `${video}/${file}`, r2: null };
}

export const contentTypeFor = (file: string): string =>
  file.endsWith(".mp4") ? "video/mp4" : "application/json";

export type R2Status =
  | { kind: "absent" }
  | { kind: "partial"; missing: string[] }
  | {
      kind: "ready";
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
    };

const R2_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_VIDEOS_BUCKET",
] as const;

/** The owner's bucket and credentials come from the environment only; nothing is read from a file. */
export function readR2(
  env: Readonly<Record<string, string | undefined>>,
): R2Status {
  const value = (name: (typeof R2_VARS)[number]): string => env[name] ?? "";
  const missing = R2_VARS.filter((name) => value(name) === "");
  if (missing.length === R2_VARS.length) return { kind: "absent" };
  if (missing.length > 0) return { kind: "partial", missing };
  return {
    kind: "ready",
    accountId: value("R2_ACCOUNT_ID"),
    accessKeyId: value("R2_ACCESS_KEY_ID"),
    secretAccessKey: value("R2_SECRET_ACCESS_KEY"),
    bucket: value("R2_VIDEOS_BUCKET"),
  };
}

/** The one ledger line for `file`, or an error: a file the ledger does not know is not a render. */
export function ledgerRow(
  ledger: string,
  file: string,
): { file: string; sha256: string; stored: Stored } {
  const rows = ledger
    .split("\n")
    .filter((line) => line !== "")
    .map(
      (line) =>
        JSON.parse(line) as { file: string; sha256: string; stored: Stored },
    )
    .filter((row) => row.file === file);
  const [row, ...others] = rows;
  if (row === undefined) throw new Error(`no ledger line for ${file}`);
  if (others.length > 0)
    throw new Error(`${String(rows.length)} ledger lines for ${file}`);
  return row;
}

/** Records the R2 key on the ledger line for `file` (the one sanctioned edit of a ledger line: r2 goes from null to its key). */
export function markUploaded(
  ledger: string,
  file: string,
  key: string,
): string {
  const row = ledgerRow(ledger, file);
  if (row.stored.r2 !== null && row.stored.r2 !== key)
    throw new Error(
      `${file} is already recorded as uploaded to ${row.stored.r2}`,
    );
  return ledger
    .split("\n")
    .map((line) =>
      line !== "" && (JSON.parse(line) as { file: string }).file === file
        ? JSON.stringify({ ...row, stored: { ...row.stored, r2: key } })
        : line,
    )
    .join("\n");
}

/** `text` with every secret removed, longest first so one secret containing another is still cleared. Empty secrets are ignored. */
export function redact(text: string, secrets: readonly string[]): string {
  return [...secrets]
    .filter((s) => s !== "")
    .sort((a, b) => b.length - a.length)
    .reduce((out, s) => out.replaceAll(s, "[redacted]"), text);
}

/** What a HEAD of an object that already exists says about it (header values, null when absent or unreadable). */
export interface RemoteObject {
  /** `x-amz-meta-sha256`, set by our own PUT. */
  sha256: string | null;
  /** `ETag` as sent, quotes included. */
  etag: string | null;
  /** `Content-Length`. */
  bytes: number | null;
}
export interface LocalObject {
  sha256: string;
  md5: string;
  bytes: number;
}

/**
 * Whether an object already in the bucket is this file. It is when our own
 * sha256 metadata says so, or, for objects without it, when the size and a
 * plain MD5 ETag match (a single-part PUT's ETag is the MD5 of the body; a
 * multipart ETag has a dash and says nothing about the bytes). Returns the
 * problem otherwise: nothing is overwritten and nothing is recorded as uploaded.
 */
export function existingObjectProblem(
  remote: RemoteObject,
  local: LocalObject,
): string | null {
  if (remote.sha256 === local.sha256) return null;
  const etag = remote.etag?.replaceAll('"', "") ?? "";
  if (
    /^[0-9a-f]{32}$/i.test(etag) &&
    etag.toLowerCase() === local.md5 &&
    remote.bytes === local.bytes
  )
    return null;
  return remote.sha256 === null
    ? "the object there carries no sha256 metadata and its size and MD5 ETag do not match this file"
    : "the object there has a different sha256 (a different file under the same name)";
}

/** Names of the files the ledger records for `video`, so a name already used is never used again. */
export function ledgerNames(ledger: string, video: string): string[] {
  return ledger
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as { video: string; file: string })
    .filter((row) => row.video === video)
    .map((row) => row.file.slice(row.file.lastIndexOf("/") + 1));
}
