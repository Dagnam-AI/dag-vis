// What git says about the checkout and about where renders are stored. Pure: the
// scripts hand in a runner for git, so nothing here starts a process.
export interface GitResult {
  /** The exit status, or null when git could not be started. */
  status: number | null;
  stdout: string;
  stderr: string;
}
export type Git = (cwd: string, args: string[]) => GitResult;

/**
 * Paths `git status --porcelain` lists, minus `ignored` (paths from the
 * repository root). The ledger is ignored: appending a line to it does not
 * change what a video is made of.
 */
export function dirtyPaths(
  porcelain: string,
  ignored: readonly string[],
): string[] {
  return porcelain
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.slice(3))
    .filter((path) => !ignored.includes(path));
}

/** The nearest ancestor of `path` (itself included) that exists. `parentOf` must reach one eventually. */
export function nearestExisting(
  path: string,
  exists: (p: string) => boolean,
  parentOf: (p: string) => string,
): string {
  let at = path;
  while (!exists(at)) at = parentOf(at);
  return at;
}

/**
 * Why `probe` (a path inside the videos folder, which may not exist yet) may not
 * be written to, or null. `anchor` is an existing folder above it. A folder
 * inside a git work tree must be ignored there, or a render is one `git add`
 * from entering history; a folder outside any repository is fine. If git cannot
 * answer, the answer is no.
 */
export function videosDirProblem(
  anchor: string,
  probe: string,
  git: Git,
): string | null {
  const inside = git(anchor, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status === null)
    return "git could not be started, so it cannot be checked that the videos folder is ignored";
  if (inside.status !== 0 || inside.stdout.trim() !== "true") return null;
  const ignored = git(anchor, ["check-ignore", "-q", "--", probe]);
  if (ignored.status === 0) return null;
  if (ignored.status === 1)
    return `${probe} is inside a git work tree and is not ignored there: add the videos folder to that repository's .gitignore (or point DAG_VIDEOS_DIR elsewhere) so renders can never be committed`;
  return `git check-ignore failed: ${ignored.stderr.trim() || "no message"}`;
}
