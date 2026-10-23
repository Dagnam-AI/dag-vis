import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

const GOLDENS = join(dirname(fileURLToPath(import.meta.url)), "..", "goldens");

/**
 * Pin `actual` to tests/goldens/<name>. Regenerate with UPDATE_GOLDENS=1 (or
 * when the file does not exist yet); otherwise a byte diff fails the test.
 */
export function expectGolden(name: string, actual: string): void {
  const path = join(GOLDENS, name);
  if (process.env.UPDATE_GOLDENS === "1" || !existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, actual, "utf8");
  }
  expect(actual).toBe(readFileSync(path, "utf8"));
}
