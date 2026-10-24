import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
// A computed specifier: the config is plain JS, so there is nothing to type-check.
const { default: config } = (await import(
  pathToFileURL(join(ROOT, "motion/eslint.config.js")).href
)) as { default: Linter.Config[] };

// The real motion config, minus the root's type-checked rules (they need the
// file on disk and a TS program): only the entries scoped to motion/ files that
// carry the import boundary, in their original order, so the cascade between them is the real one.
const boundaryConfig: Linter.Config[] = [
  {
    files: ["motion/**/*.ts", "motion/**/*.tsx"],
    // No TS program: the cases are strings, not files on disk.
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { tsconfigRootDir: ROOT, projectService: false },
    },
  },
  ...config.filter(
    (c) =>
      c.files !== undefined &&
      c.rules !== undefined &&
      ("no-restricted-imports" in c.rules ||
        "motion-local/boundary" in c.rules),
  ),
];

/** Rule ids reported for `code` linted as if it were `file` (a path under the repository root). */
function lint(file: string, code: string): string[] {
  const linter = new Linter({ cwd: ROOT, configType: "flat" });
  return linter
    .verify(code, boundaryConfig, { filename: join(ROOT, file) })
    .map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

const BOUNDARY = "motion-local/boundary";
const RESTRICTED = "no-restricted-imports";

// Each import spelling as source text, built from the specifier so that this
// file holds no import-looking string literal: the structure test scans every
// motion file for those and would resolve them against THIS file.
const named = (spec: string): string => `import { x } from "${spec}";`;
const exportAll = (spec: string): string => `export * from "${spec}";`;
const exportNamed = (spec: string): string => `export { x } from "${spec}";`;
const dynamic = (spec: string): string => `await import("${spec}");`;
const equals = (spec: string): string => `import lib = require("${spec}");`;
const typed = (spec: string): string => `let x: import("${spec}").T;`;

describe("the motion import boundary, linted on strings", () => {
  it("lets a motion test import motion's own src, and rejects the library's src/", () => {
    const test = "motion/tests/lib/a.test.ts";
    expect(lint(test, named("../../src/lib/timing.ts"))).toEqual([]);
    expect(lint(test, named("../../../src/index.ts"))).toEqual([BOUNDARY]);
    // Same target, spelled differently: judged by where it resolves.
    expect(lint(test, named("../../../a/../src/./index.ts"))).toEqual([
      BOUNDARY,
    ]);
  });

  it("keeps motion/src/lib to its own siblings", () => {
    const lib = "motion/src/lib/a.ts";
    expect(lint(lib, named("./timing.ts"))).toEqual([]);
    expect(lint(lib, named("../bridge/brand.ts"))).toEqual([BOUNDARY]);
    expect(lint(lib, exportAll("../bridge/brand.ts"))).toEqual([BOUNDARY]);
    expect(lint(lib, exportNamed("../bridge/brand.ts"))).toEqual([BOUNDARY]);
  });

  it("allows node:crypto in sigv4.ts only, and rejects node:fs there", () => {
    const sigv4 = "motion/src/lib/sigv4.ts";
    expect(lint(sigv4, named("node:crypto"))).toEqual([]);
    expect(lint(sigv4, named("node:fs"))).toEqual([RESTRICTED]);
    expect(lint("motion/src/lib/other.ts", named("node:crypto"))).toEqual([
      RESTRICTED,
    ]);
  });

  it("allows the @dagnam/vis aliases and rejects its other subpaths", () => {
    const file = "motion/src/bridge/a.ts";
    expect(lint(file, named("@dagnam/vis"))).toEqual([]);
    expect(lint(file, named("@dagnam/vis/animate"))).toEqual([]);
    expect(lint(file, named("@dagnam/vis/node"))).toEqual([RESTRICTED]);
  });

  it("flags a dynamic import() of a string literal, and lets the alias through", () => {
    const test = "motion/tests/lib/a.test.ts";
    expect(lint(test, dynamic("../../../src/index.ts"))).toEqual([BOUNDARY]);
    expect(lint(test, dynamic("@dagnam/vis"))).toEqual([]);
  });

  it("flags the TypeScript-only spellings: import = require and import types", () => {
    const test = "motion/tests/lib/a.test.ts";
    expect(lint(test, equals("../../../src/index.ts"))).toEqual([BOUNDARY]);
    expect(lint(test, typed("../../../src/index.ts"))).toEqual([BOUNDARY]);
    expect(lint(test, typed("../../src/lib/timing.ts"))).toEqual([]);
  });
});
