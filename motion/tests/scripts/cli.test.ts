import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  MOTION,
  REMOTION_BIN,
  cli,
  fail,
  nameOrFail,
  requireMotionCwd,
} from "../../scripts/cli.ts";
import { ExitError } from "./harness.ts";

// scripts/cli.ts parses process.argv and exits the process, so it is driven
// from a child: a throwaway driver (outside the repo) imports it by path.
const CLI = fileURLToPath(new URL("../../scripts/cli.ts", import.meta.url));
let dir: string;
let driver: string;
beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "cli-")));
  driver = join(dir, "driver.mts");
  writeFileSync(
    driver,
    `const { cli } = await import(process.env.CLI_PATH);
const r = cli("tool <a> <b> [--json]", ["json"], 2);
console.log(JSON.stringify({ flags: [...r.flags], positionals: r.positionals }));
`,
  );
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const run = (...args: string[]) => {
  const r = spawnSync(process.execPath, [driver, ...args], {
    encoding: "utf8",
    env: { ...process.env, CLI_PATH: CLI },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

describe("scripts/cli.ts", () => {
  it("returns the flags given and the positionals", () => {
    expect(JSON.parse(run("a", "b").stdout)).toEqual({
      flags: [],
      positionals: ["a", "b"],
    });
    expect(JSON.parse(run("--json", "a", "b").stdout)).toEqual({
      flags: ["json"],
      positionals: ["a", "b"],
    });
    const twice = JSON.parse(run("a", "--json", "b", "--json").stdout) as {
      flags: string[];
    };
    expect(twice.flags).toEqual(["json"]);
  });

  it("stops at -- so later arguments are positionals", () => {
    expect(JSON.parse(run("--", "--json", "b").stdout)).toEqual({
      flags: [],
      positionals: ["--json", "b"],
    });
  });

  it.each(["--jsn", "-j", "--no-json"])(
    "exits 1 naming the unknown option %s, with the usage line and no stack",
    (flag) => {
      const r = run(flag, "a", "b");
      expect(r.status).toBe(1);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain(`Unknown option '${flag}'`);
      expect(r.stderr).toContain("usage: tool <a> <b> [--json]");
      expect(r.stderr).not.toMatch(/\n\s+at /);
    },
  );

  it("refuses a value given to a boolean flag", () => {
    const r = run("--json=x", "a", "b");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("--json");
    expect(r.stderr).toContain("usage:");
  });

  it.each([[[]], [["a"]], [["a", "b", "c"]]])(
    "exits 1 when the positional count is wrong (%j)",
    (args) => {
      const r = run(...args);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(
        `expected 2 argument(s), got ${String(args.length)}`,
      );
      expect(r.stderr).toContain("usage:");
    },
  );
});

// The same module, in this process: the helpers every script calls first.
describe("scripts/cli.ts helpers", () => {
  const exiting = <T>(
    f: () => T,
  ): { code?: number; err: string; value?: T } => {
    const err: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation((m: unknown) => {
      err.push(String(m));
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new ExitError(Number(code ?? 0));
    });
    try {
      return { value: f(), err: err.join("\n") };
    } catch (e) {
      if (!(e instanceof ExitError)) throw e;
      return { code: e.code, err: err.join("\n") };
    } finally {
      log.mockRestore();
      exit.mockRestore();
    }
  };
  const withArgv = <T>(args: string[], f: () => T): T => {
    const saved = process.argv;
    process.argv = ["node", "tool", ...args];
    try {
      return f();
    } finally {
      process.argv = saved;
    }
  };

  it("knows motion/ and the local remotion bin whatever the cwd is", () => {
    expect(MOTION).toBe(
      fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, ""),
    );
    expect(REMOTION_BIN).toBe(join(MOTION, "node_modules/.bin/remotion"));
  });

  it("fail exits 1 with the message and the usage line", () => {
    expect(exiting(() => fail("tool <a>", "nope"))).toEqual({
      code: 1,
      err: "nope\nusage: tool <a>",
    });
  });

  it("nameOrFail returns a usable video name and exits 1 naming the rule for another", () => {
    expect(exiting(() => nameOrFail("u", "pipeline-proof")).value).toBe(
      "pipeline-proof",
    );
    const bad = exiting(() => nameOrFail("u", "Bad_Name"));
    expect(bad.code).toBe(1);
    expect(bad.err).toContain(
      'a video name (lower-case letters and digits joined by single hyphens) is required, got "Bad_Name"',
    );
    expect(exiting(() => nameOrFail("u", undefined)).code).toBe(1);
  });

  it("requireMotionCwd accepts motion/ and refuses any other folder, naming both", () => {
    const cwd = vi.spyOn(process, "cwd");
    cwd.mockReturnValue(MOTION);
    expect(
      exiting(() => {
        requireMotionCwd("u");
      }).code,
    ).toBeUndefined();
    cwd.mockReturnValue(tmpdir());
    const refused = exiting(() => {
      requireMotionCwd("u");
    });
    cwd.mockRestore();
    expect(refused.code).toBe(1);
    expect(refused.err).toContain(`run from ${MOTION}, not ${tmpdir()}`);
  });

  it("cli parses process.argv: flags without dashes, the positionals, and no count check when none is given", () => {
    const parsed = withArgv(["--json", "a", "b", "c"], () =>
      cli("u", ["json"]),
    );
    expect([...parsed.flags]).toEqual(["json"]);
    expect(parsed.positionals).toEqual(["a", "b", "c"]);
  });

  it("cli exits 1 for an unknown option and for a wrong count", () => {
    expect(
      withArgv(["--jsn"], () => exiting(() => cli("u", ["json"], 0)).code),
    ).toBe(1);
    const count = withArgv(["a"], () => exiting(() => cli("u", [], 2)));
    expect(count).toEqual({
      code: 1,
      err: "expected 2 argument(s), got 1\nusage: u",
    });
  });
});
