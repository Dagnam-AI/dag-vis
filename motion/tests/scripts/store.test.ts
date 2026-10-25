import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Cli from "../../scripts/cli.ts";
import { runScript, writeRender } from "./harness.ts";

const SCRIPT = fileURLToPath(
  new URL("../../scripts/store.ts", import.meta.url),
);

// motion/ is a temp tree (RENDERS.jsonl and out/ are scratch). git is real, run
// on temp folders. No R2 variable is set and no request is made.
const h = vi.hoisted(() => ({ motion: "" }));
vi.mock("../../scripts/cli.ts", async (original) => ({
  ...(await original<typeof Cli>()),
  get MOTION() {
    return h.motion;
  },
}));

let tmp: string;
let videos: string;
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "store-")));
  h.motion = join(tmp, "motion");
  mkdirSync(h.motion);
  videos = join(tmp, "videos");
  vi.stubEnv("DAG_VIDEOS_DIR", videos);
  for (const name of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_VIDEOS_BUCKET",
    "MOTION_R2_ENDPOINT",
  ])
    vi.stubEnv(name, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tmp, { recursive: true, force: true });
});

describe("scripts/store.ts --check", () => {
  it("says the videos folder is usable, naming it, and exits 0", async () => {
    const r = await runScript(SCRIPT, ["--check"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(`videos folder ok: ${videos}`);
  });

  it("exits 1 naming DAG_VIDEOS_DIR when the folder's parent does not exist", async () => {
    vi.stubEnv("DAG_VIDEOS_DIR", join(tmp, "missing", "videos"));
    const r = await runScript(SCRIPT, ["--check"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("DAG_VIDEOS_DIR");
    expect(r.err).toContain("does not exist");
  });

  it("refuses a videos folder inside a git work tree that does not ignore it", async () => {
    const repo = join(tmp, "repo");
    mkdirSync(repo);
    expect(
      spawnSync("git", ["init", "-q"], {
        cwd: repo,
        env: Object.fromEntries(
          Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
        ),
      }).status,
    ).toBe(0);
    vi.stubEnv("DAG_VIDEOS_DIR", join(repo, "videos"));
    const r = await runScript(SCRIPT, ["--check"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("DAG_VIDEOS_DIR");
  });
});

describe("scripts/store.ts: arguments", () => {
  it.each([
    [["--check", "x.mp4"], "expected one render file, or --check alone"],
    [["a.mp4", "b.mp4"], "expected one render file, or --check alone"],
    [[], "expected one render file, or --check"],
    [["--bogus"], "Unknown option '--bogus'"],
    [["--upload=1", "a.mp4"], "Option '--upload' does not take an argument"],
  ])("exits 1 with the usage line for %j", async (argv, message) => {
    const r = await runScript(SCRIPT, argv);
    expect(r.code).toBe(1);
    expect(r.err).toContain(message);
    expect(r.err).toContain("usage: node scripts/store.ts");
  });

  it("refuses to run from another folder", async () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(tmp);
    const r = await runScript(SCRIPT, ["--check"]);
    cwd.mockRestore();
    expect(r.code).toBe(1);
    expect(r.err).toContain(`not ${tmp}`);
  });
});

describe("scripts/store.ts: the local copy", () => {
  it("copies the three files into <videos>/<video>/ and leaves an identical copy alone on a second run", async () => {
    const render = writeRender(h.motion, "demo");
    const first = await runScript(SCRIPT, [render.mp4]);
    expect(first.code).toBe(0);
    expect(readdirSync(join(videos, "demo")).sort()).toEqual(
      render.files.map((f) => f.split("/").at(-1)!).sort(),
    );
    expect(first.out).toContain(
      `local: demo/${render.name} -> ${join(videos, "demo", render.name)}`,
    );
    expect(readFileSync(join(videos, "demo", render.name), "utf8")).toBe(
      "pretend mp4 of demo",
    );
    const second = await runScript(SCRIPT, [render.mp4]);
    expect(second.code).toBe(0);
    expect(second.out).toContain(`local: demo/${render.name} already stored`);
    expect(second.out).not.toContain("->");
  });

  it("refuses to overwrite a different file already stored", async () => {
    const render = writeRender(h.motion, "demo");
    mkdirSync(join(videos, "demo"), { recursive: true });
    writeFileSync(join(videos, "demo", render.name), "someone else's bytes");
    const r = await runScript(SCRIPT, [render.mp4]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "exists with different content; renders are never overwritten",
    );
    expect(readFileSync(join(videos, "demo", render.name), "utf8")).toBe(
      "someone else's bytes",
    );
  });

  it("stores nothing, and says what is missing, when one of the three files is absent", async () => {
    const render = writeRender(h.motion, "demo");
    rmSync(render.files[1]!);
    const r = await runScript(SCRIPT, [render.mp4]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(`missing ${render.files[1]!}`);
    expect(existsSync(videos)).toBe(false);
  });

  it("refuses a file name that is not a versioned render", async () => {
    const render = writeRender(h.motion, "demo");
    const odd = join(h.motion, "out/demo/odd.mp4");
    writeFileSync(odd, "x");
    writeFileSync(join(h.motion, "out/demo/odd.props.json"), "{}");
    writeFileSync(join(h.motion, "out/demo/odd.check.json"), "{}");
    const r = await runScript(SCRIPT, [odd]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('invalid file name "odd.mp4" for video "demo"');
    expect(render.name).toBeTruthy();
  });

  it("stores only a render whose check record passed, naming the problems", async () => {
    const render = writeRender(h.motion, "demo", ["frames 1, expected 2"]);
    const r = await runScript(SCRIPT, [render.mp4]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("did not pass its checks: frames 1, expected 2");
    expect(existsSync(videos)).toBe(false);
  });
});

describe("scripts/store.ts --upload without credentials", () => {
  it("exits 1 naming the missing variables, before anything is copied or sent", async () => {
    const render = writeRender(h.motion, "demo");
    const r = await runScript(SCRIPT, [render.mp4, "--upload"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain(
      "R2 upload: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_VIDEOS_BUCKET (none is set)",
    );
    expect(existsSync(videos)).toBe(false);
  });
});
