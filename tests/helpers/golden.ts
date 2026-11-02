import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

const GOLDENS = join(dirname(fileURLToPath(import.meta.url)), "..", "goldens");

/**
 * Pin `actual` to tests/goldens/<name>. The file is written ONLY with
 * UPDATE_GOLDENS=1; a missing golden fails (a test that creates its own
 * expectation pins nothing), and so does a byte diff. `root` is the folder
 * the goldens live in (the repo's by default; a test of this helper passes a
 * temporary one, so nothing transient appears in tests/goldens).
 */
export function expectGolden(
  name: string,
  actual: string,
  root: string = GOLDENS,
  writeOnly = false,
): void {
  const path = join(root, name);
  if (process.env.UPDATE_GOLDENS === "1") {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, actual, "utf8");
  }
  if (!existsSync(path))
    throw new Error(
      `golden ${name} does not exist: create it with UPDATE_GOLDENS=1`,
    );
  if (!writeOnly) expect(actual).toBe(readFileSync(path, "utf8"));
}

/**
 * Pin numbers read off a rendering (pixels) to tests/goldens/<name>, which holds them as
 * JSON: each must be within `tolerance` of the golden (a libm last bit can move a
 * channel by one on another platform). Written ONLY with UPDATE_GOLDENS=1, like
 * `expectGolden`.
 */
export function expectGoldenNear(
  name: string,
  actual: readonly (readonly number[])[],
  tolerance = 2,
  root: string = GOLDENS,
): void {
  expectGolden(name, `${JSON.stringify(actual)}\n`, root, true);
  const want = JSON.parse(readFileSync(join(root, name), "utf8")) as number[][];
  expect(actual.length).toBe(want.length);
  actual.forEach((row, i) => {
    expect(row.length).toBe(want[i]?.length);
    row.forEach((v, j) => {
      expect(
        Math.abs(v - (want[i]?.[j] ?? Infinity)),
        `${name}[${i}][${j}]`,
      ).toBeLessThanOrEqual(tolerance);
    });
  });
}
