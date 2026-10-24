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
