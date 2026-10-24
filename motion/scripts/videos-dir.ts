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

const git: Git = (cwd, args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

/**
 * Exits 1, with a message that names the fix, unless renders can be written to
 * `<videos folder>/<probe>`: its parent folder exists, and if the folder is
 * inside a git work tree it is ignored there (a render is one `git add` from
 * entering history otherwise).
 */
export function requireUsableVideosDir(probe: string): void {
  if (!existsSync(dirname(videosDir))) {
    console.error(
      `DAG_VIDEOS_DIR: ${dirname(videosDir)} (the parent of ${videosDir}) does not exist. Clone info beside dag-vis, or set DAG_VIDEOS_DIR to <an existing folder>/videos.`,
    );
    process.exit(1);
  }
  const target = join(videosDir, probe);
  // A folder: the probe itself may already be a stored file, which git cannot be run in.
  const anchor = nearestExisting(
    target,
    (p) => existsSync(p) && statSync(p).isDirectory(),
    dirname,
  );
  // git sees real paths (on macOS /var is /private/var).
  const realAnchor = realpathSync(anchor);
  const problem = videosDirProblem(
    realAnchor,
    join(realAnchor, relative(anchor, target)),
    git,
  );
  if (problem !== null) {
    console.error(`DAG_VIDEOS_DIR (${videosDir}): ${problem}`);
    process.exit(1);
  }
}
