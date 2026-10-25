// The local videos folder, shared by render.ts and store.ts: $DAG_VIDEOS_DIR, by
// default ../info/videos beside this checkout.
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  nearestExisting,
  videosDirProblem,
  type Git,
} from "../src/lib/git-state.ts";

// An empty variable counts as unset (resolve("") would be the current folder).
const configured = process.env.DAG_VIDEOS_DIR;
export const videosDir = resolve(
  configured === undefined || configured === ""
    ? fileURLToPath(new URL("../../../info/videos", import.meta.url))
    : configured,
);

// LC_ALL=C: the "not a git repository" message is matched, so it must not be translated.
const runGit: Git = (cwd, args) => {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

/**
 * Why renders cannot be written to `<folder>/<probe>`, or null: the parent of
 * the folder must exist, and if the folder is inside a git work tree it is
 * ignored there (a render is one `git add` from entering history otherwise).
 */
export function videosFolderProblem(
  folder: string,
  probe: string,
  git: Git = runGit,
): string | null {
  if (!existsSync(dirname(folder)))
    return `DAG_VIDEOS_DIR: ${dirname(folder)} (the parent of ${folder}) does not exist. Clone info beside dag-vis, or set DAG_VIDEOS_DIR to <an existing folder>/videos.`;
  const target = join(folder, probe);
  // A folder: the probe itself may already be a stored file, which git cannot be run in.
  const anchor = nearestExisting(
    target,
    (p) => existsSync(p) && statSync(p).isDirectory(),
    dirname,
  );
  // git sees real paths (on macOS /var is /private/var, and a symlink must not dodge the check).
  const realAnchor = realpathSync(anchor);
  const problem = videosDirProblem(
    realAnchor,
    join(realAnchor, relative(anchor, target)),
    git,
  );
  return problem === null ? null : `DAG_VIDEOS_DIR (${folder}): ${problem}`;
}

/** Exits 1 with the problem, if any, for `<videos folder>/<probe>`. */
export function requireUsableVideosDir(probe: string): void {
  const problem = videosFolderProblem(videosDir, probe);
  if (problem !== null) {
    console.error(problem);
    process.exit(1);
  }
}
