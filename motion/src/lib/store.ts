// Where a finished render is stored: a local folder always, the owner's R2 bucket on request.
// Pure: no fs, no network, no clock.
import { isVideoSlug } from "./video-name.ts";

export interface Stored {
  /** Relative to the local videos folder ($DAG_VIDEOS_DIR): `<video>/<file>`. */
  local: string;
  /** The R2 object key, or null until the owner has run `store.ts --upload`. */
  r2: string | null;
}

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
  | { kind: "endpoint"; problem: string }
  | {
      kind: "ready";
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
      /** Origin of a loopback test double; undefined for the real bucket. */
      endpoint?: string | undefined;
    };

const R2_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_VIDEOS_BUCKET",
] as const;

/**
 * Set only by the upload test: the origin of a server on this machine that
 * stands in for R2. Unset, the endpoint is built from R2_ACCOUNT_ID.
 */
export const R2_ENDPOINT_VAR = "MOTION_R2_ENDPOINT";

/** Why `value` may not stand in for R2, or null: only `http://127.0.0.1[:port]` and `http://[::1][:port]`, nothing else in the URL, so the signed upload can never be sent to another machine. */
export function endpointProblem(value: string): string | null {
  const rule = `${R2_ENDPOINT_VAR} must be http://127.0.0.1:<port> or http://[::1]:<port> (a test double on this machine) and nothing more`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return rule;
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  const bare =
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === "";
  return url.protocol === "http:" && loopback && bare ? null : rule;
}

/** The owner's bucket and credentials come from the environment only; nothing is read from a file. */
export function readR2(
  env: Readonly<Record<string, string | undefined>>,
): R2Status {
  const value = (name: (typeof R2_VARS)[number]): string => env[name] ?? "";
  const missing = R2_VARS.filter((name) => value(name) === "");
  if (missing.length === R2_VARS.length) return { kind: "absent" };
  if (missing.length > 0) return { kind: "partial", missing };
  const endpoint = env[R2_ENDPOINT_VAR] ?? "";
  const problem = endpoint === "" ? null : endpointProblem(endpoint);
  if (problem !== null) return { kind: "endpoint", problem };
  return {
    kind: "ready",
    endpoint: endpoint === "" ? undefined : new URL(endpoint).origin,
    accountId: value("R2_ACCOUNT_ID"),
    accessKeyId: value("R2_ACCESS_KEY_ID"),
    secretAccessKey: value("R2_SECRET_ACCESS_KEY"),
    bucket: value("R2_VIDEOS_BUCKET"),
  };
}

/** The line `--upload` prints to stderr when the requests go to a local test double and not to R2, so a variable left exported cannot go unnoticed. No credential in it. Null for the real bucket. */
export function endpointNotice(r2: R2Status): string | null {
  if (r2.kind !== "ready" || r2.endpoint === undefined) return null;
  return `${R2_ENDPOINT_VAR} is set: this upload goes to the test double at ${new URL(r2.endpoint).host}, not to R2`;
}

/** Why `--upload` cannot start, naming the missing variables (never a value), or null when all four are set. */
export function uploadProblem(r2: R2Status): string | null {
  if (r2.kind === "ready") return null;
  if (r2.kind === "endpoint") return `R2 upload: ${r2.problem}`;
  if (r2.kind === "partial")
    return `R2 upload: also set ${r2.missing.join(", ")}`;
  return `R2 upload: set ${R2_VARS.join(", ")} (none is set)`;
}

/** What the local copy does with a file: write it, leave an identical one, or refuse a different one (renders are never overwritten). */
export function localCopyAction(
  storedSha256: string | null,
  sha256: string,
): "copy" | "skip" | "conflict" {
  if (storedSha256 === null) return "copy";
  return storedSha256 === sha256 ? "skip" : "conflict";
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
 * Whether an object already in the bucket is this file. An object that carries
 * our `x-amz-meta-sha256` is this file only if that equals the local sha256; any
 * other value is a different file, however its size and ETag look. Only an
 * object with no such metadata is judged by size and a plain MD5 ETag (a
 * single-part PUT's ETag is the MD5 of the body; a multipart ETag has a dash and
 * says nothing about the bytes). Returns the problem otherwise: nothing is
 * overwritten and nothing is recorded as uploaded.
 */
export function existingObjectProblem(
  remote: RemoteObject,
  local: LocalObject,
): string | null {
  if (remote.sha256 !== null)
    return remote.sha256 === local.sha256
      ? null
      : "the object there has a different sha256 (a different file under the same name)";
  const etag = remote.etag?.replaceAll('"', "") ?? "";
  return /^[0-9a-f]{32}$/i.test(etag) &&
    etag.toLowerCase() === local.md5 &&
    remote.bytes === local.bytes
    ? null
    : "the object there carries no sha256 metadata and its size and MD5 ETag do not match this file";
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
