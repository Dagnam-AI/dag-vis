// Type-only import (erased at runtime): `window.__visBg` inside page.evaluate callbacks.
import type {} from "../../demo/global.js";

import { expect, test, type Page } from "@playwright/test";

// <VisBackground effect="field"> in real Chromium (SwiftShader): the wrapper owns one canvas per mount and
// must lose that canvas's WebGL context itself when it drops it, because browsers cap live contexts (16 in Chrome).
async function open(page: Page): Promise<void> {
  await page.goto("/vis-background.html");
  await page.waitForFunction(() => window.__visBgReady === true);
  await expect(page.locator("#stage canvas")).toHaveCount(1);
}

/** Marks the canvas now in #stage so the page can still ask about it after it is replaced or removed. */
const holdStageCanvas = (page: Page): Promise<void> =>
  page.evaluate(() => {
    window.__held = document.querySelector("#stage canvas");
  });

const heldContextLost = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const held = window.__held;
    if (!held) throw new Error("no canvas was held");
    // getContext returns the canvas's existing context; none is ever created here.
    const gl = held.getContext("webgl2");
    return gl === null ? false : gl.isContextLost();
  });

const drawn = (page: Page, selector: string) =>
  page.evaluate(
    (s) => window.__visBg.sample(document.querySelector<HTMLCanvasElement>(s)!),
    selector,
  );

test("mounts exactly one canvas and it is drawn (not one flat colour)", async ({
  page,
}) => {
  await open(page);
  const { lost, distinct } = await drawn(page, "#stage canvas");
  expect(lost).toBe(false);
  expect(distinct).toBeGreaterThan(8);
});

test("a changed spec replaces the canvas: the new one draws and the old one's context is lost", async ({
  page,
}) => {
  await open(page);
  await holdStageCanvas(page);
  await page.click("#flip");
  await page.waitForFunction(
    () => document.querySelector("#stage canvas") !== window.__held,
  );
  await expect(page.locator("#stage canvas")).toHaveCount(1);
  expect(await page.evaluate(() => window.__held?.isConnected)).toBe(false);
  expect(await heldContextLost(page)).toBe(true);
  const { lost, distinct } = await drawn(page, "#stage canvas");
  expect(lost).toBe(false);
  expect(distinct).toBeGreaterThan(8);
});

test("unmounting removes the canvas and loses its context", async ({
  page,
}) => {
  await open(page);
  await holdStageCanvas(page);
  await page.click("#toggle");
  await expect(page.locator("#stage canvas")).toHaveCount(0);
  expect(await heldContextLost(page)).toBe(true);
});

test("mounting and unmounting 24 times (past Chrome's 16-context cap) never warns, and the last one still draws", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("Too many active WebGL contexts"))
      warnings.push(m.text());
  });
  await open(page);
  await page.evaluate(() => {
    window.__visBg.cycle(24);
  });
  expect(warnings).toEqual([]);
  const { lost, distinct } = await drawn(page, "#cycle canvas");
  expect(lost).toBe(false);
  expect(distinct).toBeGreaterThan(8);
  // Every earlier canvas was released by the wrapper, not force-lost by the browser.
  const state = await page.evaluate(() =>
    window.__visBg.cycled.map((c) => ({
      connected: c.isConnected,
      lost: c.getContext("webgl2")?.isContextLost() ?? null,
    })),
  );
  expect(state.slice(0, -1).every((s) => !s.connected && s.lost)).toBe(true);
  expect(state.at(-1)).toEqual({ connected: true, lost: false });
  // Chrome force-loses the OLDEST live context first: without the fix that is the page's own background.
  const stage = await drawn(page, "#stage canvas");
  expect(stage.lost).toBe(false);
  expect(stage.distinct).toBeGreaterThan(8);
});
