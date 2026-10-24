import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  dirtyPaths,
  nearestExisting,
  videosDirProblem,
  type Git,
  type GitResult,
} from "../../src/lib/git-state.ts";

describe("dirtyPaths", () => {
  it("lists changed and untracked paths without the ignored ones", () => {
    const porcelain =
      " M motion/RENDERS.jsonl\n M src/a.ts\n?? motion/src/videos/x/X.tsx\nR  old.ts -> new.ts\n";
    expect(dirtyPaths(porcelain, ["motion/RENDERS.jsonl"])).toEqual([
      "src/a.ts",
      "motion/src/videos/x/X.tsx",
      "old.ts -> new.ts",
    ]);
  });

  it("is empty for a clean tree or an ignored-only change", () => {
    expect(dirtyPaths("", [])).toEqual([]);
    expect(
      dirtyPaths(" M motion/RENDERS.jsonl\n", ["motion/RENDERS.jsonl"]),
    ).toEqual([]);
  });
});

describe("nearestExisting", () => {
  it("walks up to the first folder that exists", () => {
    const here = new Set(["/a"]);
    const parent = (p: string): string => p.slice(0, p.lastIndexOf("/")) || "/";
    expect(nearestExisting("/a/b/c", (p) => here.has(p), parent)).toBe("/a");
    expect(nearestExisting("/a", (p) => here.has(p), parent)).toBe("/a");
  });
});

describe("videosDirProblem with a scripted git", () => {
  const answer =
    (...results: Partial<GitResult>[]): Git =>
    () => ({ status: 0, stdout: "", stderr: "", ...results.shift() });
  const scripted = (...results: Partial<GitResult>[]): Git => {
    const queue = [...results];
    return () => ({ status: 0, stdout: "", stderr: "", ...queue.shift() });
  };

  it("says no when git cannot be started", () => {
    expect(videosDirProblem("/a", "/a/v/x", answer({ status: null }))).toMatch(
      /could not be started/,
    );
  });

  it("allows a folder outside any repository", () => {
    expect(
      videosDirProblem(
        "/a",
        "/a/v/x",
        answer({ status: 128, stderr: "fatal" }),
      ),
    ).toBeNull();
  });

  it("allows a folder that is not in a work tree (inside .git, or a bare repository)", () => {
    expect(
      videosDirProblem("/a", "/a/v/x", answer({ stdout: "false\n" })),
    ).toBeNull();
  });

  it("allows an ignored folder and passes the probe to check-ignore", () => {
    const calls: string[][] = [];
    const git: Git = (_cwd, args) => {
      calls.push(args);
      return { status: 0, stdout: "true\n", stderr: "" };
    };
    expect(videosDirProblem("/a", "/a/v/x", git)).toBeNull();
    expect(calls[1]).toEqual(["check-ignore", "-q", "--", "/a/v/x"]);
  });

  it("refuses a folder in a work tree that is not ignored, naming the fix", () => {
    const problem = videosDirProblem(
      "/a",
      "/a/v/x",
      scripted({ stdout: "true\n" }, { status: 1 }),
    );
    expect(problem).toMatch(/not ignored/);
    expect(problem).toMatch(/\.gitignore/);
  });

  it("refuses when check-ignore itself fails", () => {
    expect(
      videosDirProblem(
        "/a",
        "/a/v/x",
        scripted({ stdout: "true\n" }, { status: 128, stderr: "boom\n" }),
      ),
    ).toMatch(/check-ignore failed: boom/);
    expect(
      videosDirProblem(
        "/a",
        "/a/v/x",
        scripted({ stdout: "true\n" }, { status: 128 }),
      ),
    ).toMatch(/failed: no message/);
  });
});

describe("videosDirProblem with real git in a temporary repository", () => {
  // Built under os.tmpdir(); never in the worktree. GIT_* is dropped so a hook's
  // environment cannot point these commands at another repository.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
  );
  const git: Git = (cwd, args) => {
    const r = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  let root: string;
  let outside: string;
  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "videos-git-")));
    outside = realpathSync(mkdtempSync(join(tmpdir(), "videos-nogit-")));
    expect(git(root, ["init", "-q"]).status).toBe(0);
    writeFileSync(join(root, ".gitignore"), "/videos/\n");
    mkdirSync(join(root, "videos"));
    mkdirSync(join(root, "other"));
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  const parent = (p: string): string => dirname(p);

  it("allows the ignored folder, also before it exists", () => {
    const probe = join(root, "videos", "demo", "demo-20261023-v1.mp4");
    expect(
      videosDirProblem(nearestExisting(probe, existsSync, parent), probe, git),
    ).toBeNull();
  });

  it("refuses a folder in the repository that is not ignored", () => {
    const probe = join(root, "other", "demo", "demo-20261023-v1.mp4");
    expect(
      videosDirProblem(nearestExisting(probe, existsSync, parent), probe, git),
    ).toMatch(/not ignored/);
  });

  it("allows a folder outside any repository", () => {
    const probe = join(outside, "videos", "demo", "demo-20261023-v1.mp4");
    expect(
      videosDirProblem(nearestExisting(probe, existsSync, parent), probe, git),
    ).toBeNull();
  });
});
