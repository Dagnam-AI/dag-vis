import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { videosFolderProblem } from "../../scripts/videos-dir.ts";

// Real git in repositories built under os.tmpdir(); never in the worktree or the
// info clone. The script's own path logic (nearest existing folder, real paths)
// is what is under test, with the real git it will run.
describe("videosFolderProblem", () => {
  let root: string;
  let outside: string;
  const probe = "demo/demo-20261023-v1.mp4";

  beforeAll(() => {
    // Not realpath'd on purpose: on macOS os.tmpdir() is itself behind a symlink.
    root = mkdtempSync(join(tmpdir(), "videos-dir-repo-"));
    outside = mkdtempSync(join(tmpdir(), "videos-dir-plain-"));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
    );
    const init = spawnSync("git", ["init", "-q"], { cwd: root, env });
    expect(init.status).toBe(0);
    writeFileSync(join(root, ".gitignore"), "/videos/\n");
    mkdirSync(join(root, "videos"));
    mkdirSync(join(root, "other"));
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("allows an ignored folder, whether or not it exists yet", () => {
    expect(videosFolderProblem(join(root, "videos"), probe)).toBeNull();
    expect(
      videosFolderProblem(join(root, "videos", "deeper"), probe),
    ).toBeNull();
  });

  it("allows an ignored folder when the probe is a file that is already stored (git cannot run in a file)", () => {
    mkdirSync(join(root, "videos", "demo"), { recursive: true });
    writeFileSync(join(root, "videos", probe), "x");
    expect(videosFolderProblem(join(root, "videos"), probe)).toBeNull();
  });

  it("refuses a folder in the repository that is not ignored, naming DAG_VIDEOS_DIR and the fix", () => {
    const problem = videosFolderProblem(join(root, "other"), probe);
    expect(problem).toMatch(/^DAG_VIDEOS_DIR \(/);
    expect(problem).toMatch(/not ignored/);
    expect(problem).toMatch(/\.gitignore/);
  });

  it("allows a folder outside any repository", () => {
    expect(videosFolderProblem(join(outside, "videos"), probe)).toBeNull();
  });

  it("looks through a symlink: a link outside the repository to a folder inside it is judged by where it leads", () => {
    symlinkSync(join(root, "other"), join(outside, "link-other"));
    symlinkSync(join(root, "videos"), join(outside, "link-videos"));
    expect(
      videosFolderProblem(join(outside, "link-other", "v"), probe),
    ).toMatch(/not ignored/);
    expect(
      videosFolderProblem(join(outside, "link-videos", "v"), probe),
    ).toBeNull();
  });

  it("names a missing parent folder", () => {
    expect(
      videosFolderProblem(join(outside, "absent", "videos"), probe),
    ).toMatch(/DAG_VIDEOS_DIR: .*does not exist/);
  });

  it("refuses when git is not on the PATH", () => {
    const path = process.env.PATH;
    process.env.PATH = join(outside, "no-git-here");
    try {
      expect(videosFolderProblem(join(root, "videos"), probe)).toMatch(
        /git could not be started/,
      );
    } finally {
      if (path === undefined) delete process.env.PATH;
      else process.env.PATH = path;
    }
  });

  it("asks git in English whatever the locale", () => {
    const lang = process.env.LC_ALL;
    process.env.LC_ALL = "fr_FR.UTF-8";
    try {
      expect(videosFolderProblem(join(outside, "videos"), probe)).toBeNull();
    } finally {
      if (lang === undefined) delete process.env.LC_ALL;
      else process.env.LC_ALL = lang;
    }
  });
});
