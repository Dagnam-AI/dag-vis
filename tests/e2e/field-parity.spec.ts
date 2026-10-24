// Type-only import (erased at runtime): `window.__parity` inside page.evaluate callbacks.
import type {} from "../../demo/global.js";

import { expect, test, type Page } from "@playwright/test";

import {
  createRng,
  fieldPresets,
  renderField,
  type FieldSpec,
} from "../../src/index.js";

const W = 256;
const H = 144;
const T = 1.25;
const LOOP = 6;
const MAX_DIFF = 2;

// 64 points, one jittered point per cell of an 8x8 grid, the same on every run.
const rng = createRng(7);
const POINTS: [number, number][] = [];
for (let gy = 0; gy < 8; gy++) {
  for (let gx = 0; gx < 8; gx++) {
    POINTS.push([
      Math.floor((gx + rng.next()) * (W / 8)),
      Math.floor((gy + rng.next()) * (H / 8)),
    ]);
  }
}

/** Renders `name` at `t` on the GPU and on the CPU and fails on any sampled channel more than 2/255 apart. */
async function expectParity(
  page: Page,
  name: string,
  spec: FieldSpec,
  t: number,
): Promise<void> {
  await page.goto("/parity.html");
  await page.waitForFunction(() => window.__parityReady === true);
  const gpu = await page.evaluate(
    ([n, time, loop, pts]) => window.__parity(n, time, loop, pts),
    [name, t, LOOP, POINTS] as const,
  );
  expect(gpu.slice(-2), "drawing buffer size").toEqual([W, H]);
  const cpu = renderField(spec, { width: W, height: H, t, loop: LOOP });
  let worst = 0;
  const bad: string[] = [];
  POINTS.forEach(([x, y], k) => {
    const i = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) {
      const want = cpu.data[i + c] ?? NaN;
      const got = gpu[k * 3 + c] ?? NaN;
      const d = Math.abs(want - got);
      worst = Math.max(worst, d);
      if (!(d <= MAX_DIFF))
        bad.push(
          `(${String(x)},${String(y)}) ch${String(c)}: cpu ${String(want)} gpu ${String(got)}`,
        );
    }
  });
  expect(bad, `${name}: max channel diff ${String(worst)}/255`).toEqual([]);
}

test.describe("field presets: CPU and GPU agree (64 points per preset, within 2/255 per channel)", () => {
  for (const [name, spec] of Object.entries(fieldPresets)) {
    test(name, async ({ page }) => {
      await expectParity(page, name, spec, T);
    });
  }
});

// A t past the loop goes through the live path (the runtime's wrap, the time coordinates the
// host uploads) and must land on the frame the CPU draws: one preset per kind, at two whole
// loops plus T. The shader itself never sees t, only the CPU-computed coordinates.
test.describe("field presets: CPU and GPU agree after the loop wraps", () => {
  for (const name of ["violet-dusk", "fluid-dawn", "fluted-ember"] as const) {
    test(`${name} at t beyond the loop`, async ({ page }) => {
      await expectParity(page, name, fieldPresets[name], T + 2 * LOOP);
    });
  }
});
