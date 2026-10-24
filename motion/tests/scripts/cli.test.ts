import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
