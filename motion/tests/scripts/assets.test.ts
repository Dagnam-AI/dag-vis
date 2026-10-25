import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BRAND_FONTS } from "../../src/lib/font-files.ts";

// The real motion/ folder: the script and font list are copied from here.
const SOURCE = fileURLToPath(new URL("../..", import.meta.url));

// The script runs from a copy in a temp tree (<tmp>/motion, with the library's
// font folder at <tmp>/src/node/fonts), so it can only ever write there: it
// resolves motion/ from its own location. Nothing here touches the worktree.
let tmp: string;
let motion: string;
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "assets-")));
  motion = join(tmp, "motion");
  mkdirSync(join(motion, "scripts"), { recursive: true });
  mkdirSync(join(motion, "src/lib"), { recursive: true });
  copyFileSync(
    join(SOURCE, "scripts/assets.ts"),
    join(motion, "scripts/assets.ts"),
  );
  copyFileSync(
    join(SOURCE, "src/lib/font-files.ts"),
    join(motion, "src/lib/font-files.ts"),
  );
  for (const f of BRAND_FONTS) {
    const file = join(tmp, "src/node/fonts", f.from);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, f.family);
  }
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** A `git` on PATH that exits with `status` (and prints `message` to stderr). */
function fakeGit(status: number, message = ""): string {
  const bin = join(tmp, "bin");
  mkdirSync(bin, { recursive: true });
  const git = join(bin, "git");
  writeFileSync(
    git,
    `#!/bin/sh\necho "${message}" >&2\nexit ${String(status)}\n`,
  );
  chmodSync(git, 0o755);
  return bin;
}

function run(env: Record<string, string>) {
  const r = spawnSync(process.execPath, [join(motion, "scripts/assets.ts")], {
    cwd: motion,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

const noPublic = (): boolean => !existsSync(join(motion, "public"));

describe("scripts/assets.ts", () => {
  it("refuses, and says git failed, when git cannot find a repository", () => {
    // No repository at or below the ceiling, so git exits 128 instead of answering.
    const r = run({ GIT_CEILING_DIRECTORIES: tmp });
    expect(r.status).toBe(1);
    expect(r.err).toContain(
      "could not verify that public/fonts/ is gitignored",
    );
    expect(r.err).toContain("exited 128");
    expect(r.err).toContain("Nothing copied.");
    expect(noPublic()).toBe(true);
  });

  it("refuses, and says git could not run, when git is missing", () => {
    const empty = join(tmp, "empty");
    mkdirSync(empty);
    const r = run({ PATH: empty });
    expect(r.status).toBe(1);
    expect(r.err).toContain(
      "could not verify that public/fonts/ is gitignored",
    );
    expect(r.err).toContain("ENOENT");
    expect(noPublic()).toBe(true);
  });

  it("refuses with a different message when git says the folder is not ignored", () => {
    const r = run({ PATH: fakeGit(1) });
    expect(r.status).toBe(1);
    expect(r.err).toContain("public/fonts/ is not gitignored;");
    expect(r.err).not.toContain("could not verify");
    expect(r.err).toContain("Nothing copied.");
    expect(noPublic()).toBe(true);
  });

  it("copies every face flat into public/fonts only when git confirms the folder is ignored", () => {
    const r = run({ PATH: fakeGit(0) });
    expect(r.status).toBe(0);
    expect(r.out).toContain(
      `${String(BRAND_FONTS.length)} fonts copied to public/fonts`,
    );
    expect(readdirSync(join(motion, "public/fonts")).sort()).toEqual(
      BRAND_FONTS.map((f) => f.file.replace("fonts/", "")).sort(),
    );
    expect(
      readFileSync(join(motion, "public/fonts/moonhouse.ttf"), "utf8"),
    ).toBe("moonhouse");
    expect(existsSync(join(motion, "public/generated"))).toBe(true);
  });
});
