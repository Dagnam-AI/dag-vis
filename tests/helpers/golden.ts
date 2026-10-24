import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

const GOLDENS = join(dirname(fileURLToPath(import.meta.url)), "..", "goldens");

/**
 * Pin `actual` to tests/goldens/<name>. The file is written ONLY with
 * UPDATE_GOLDENS=1; a missing golden fails (a test that creates its own
 * expectation pins nothing), and so does a byte diff.
 */
export function expectGolden(name: string, actual: string): void {
  const path = join(GOLDENS, name);
  if (process.env.UPDATE_GOLDENS === "1") {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, actual, "utf8");
  }
  if (!existsSync(path))
    throw new Error(
      `golden ${name} does not exist: create it with UPDATE_GOLDENS=1`,
    );
  expect(actual).toBe(readFileSync(path, "utf8"));
}
