// Type-only import (erased at runtime): `window.__picker` inside page.evaluate callbacks.
import type {} from "../../demo/global.js";

import { expect, test, type Page } from "@playwright/test";

import { fieldPresetCatalog } from "../../src/index.js";

// <FieldPresetPicker> in real Chromium: the CPU thumbnails really paint into their canvases (one picture per
// preset, no two alike) and the radiogroup keyboard contract holds against a live DOM and real focus.
const NAMES = fieldPresetCatalog.map((p) => p.name);
const LABELS = fieldPresetCatalog.map((p) => p.label);
const RADIOS = '#picker [role="radio"]';

async function open(page: Page): Promise<void> {
  await page.goto("/vis-background.html");
  await page.waitForFunction(() => window.__visBgReady === true);
  await expect(page.locator(RADIOS)).toHaveCount(NAMES.length);
  // Thumbnails arrive one task at a time: wait until every canvas holds an opaque pixel.
  await page.waitForFunction(() =>
    Array.from(
      document.querySelectorAll<HTMLCanvasElement>("#picker canvas"),
    ).every(
      (c) => c.getContext("2d")?.getImageData(0, 0, 1, 1).data[3] === 255,
    ),
  );
}

/** The labels of the radios whose `aria-checked` is true, and the index of the focused radio (-1 if none). */
const state = (page: Page) =>
  page.evaluate(() => {
    const radios = Array.from(
      document.querySelectorAll<HTMLElement>('#picker [role="radio"]'),
    );
    return {
      checked: radios
        .filter((r) => r.getAttribute("aria-checked") === "true")
        .map((r) => r.textContent),
      focused: radios.indexOf(document.activeElement as HTMLElement),
      tabbable: radios
        .map((r, i) => (r.tabIndex === 0 ? i : -1))
        .filter((i) => i >= 0),
    };
  });

test("has one radio per preset, labelled and in catalog order, none checked, the first the tab stop", async ({
  page,
}) => {
  await open(page);
  await expect(
    page.getByRole("radiogroup", { name: "Field preset" }),
  ).toBeVisible();
  expect(await page.locator(RADIOS).allTextContents()).toEqual(LABELS);
  expect(await state(page)).toEqual({
    checked: [],
    focused: -1,
    tabbable: [0],
  });
});

test("every thumbnail is painted (not blank) and no two presets look alike", async ({
  page,
}) => {
  await open(page);
  // An 8 x 8 grid of pixels per canvas: flat means blank, and equal grids would mean equal pictures.
  const grids = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLCanvasElement>("#picker canvas"),
    ).map((c) => {
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      const px: string[] = [];
      for (let gy = 0; gy < 8; gy++)
        for (let gx = 0; gx < 8; gx++)
          px.push(
            ctx
              .getImageData(
                Math.floor(((gx + 0.5) * c.width) / 8),
                Math.floor(((gy + 0.5) * c.height) / 8),
                1,
                1,
              )
              .data.join(","),
          );
      return px;
    }),
  );
  expect(grids).toHaveLength(NAMES.length);
  for (const [i, px] of grids.entries())
    expect(new Set(px).size, NAMES[i]).toBeGreaterThan(8);
  expect(new Set(grids.map((px) => px.join("|"))).size).toBe(NAMES.length);
  const size = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("#picker canvas");
    return [c?.width, c?.height];
  });
  expect(size).toEqual([160, 90]);
});

test("clicking a radio selects it and fires onChange with its name", async ({
  page,
}) => {
  await open(page);
  await page.locator(RADIOS).nth(NAMES.indexOf("rose")).click();
  expect(await page.evaluate(() => window.__picker.changes)).toEqual(["rose"]);
  expect(await state(page)).toMatchObject({
    checked: [LABELS[NAMES.indexOf("rose")]],
    tabbable: [NAMES.indexOf("rose")],
  });
});

test("ArrowRight selects the next preset and moves focus; wraps from the last to the first", async ({
  page,
}) => {
  await open(page);
  await page.locator(RADIOS).first().focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.__picker.changes)).toEqual([
    NAMES[1],
  ]);
  expect(await state(page)).toEqual({
    checked: [LABELS[1]],
    focused: 1,
    tabbable: [1],
  });
  await page.keyboard.press("End");
  expect((await state(page)).focused).toBe(NAMES.length - 1);
  await page.keyboard.press("ArrowRight");
  expect(await state(page)).toEqual({
    checked: [LABELS[0]],
    focused: 0,
    tabbable: [0],
  });
  await page.keyboard.press("ArrowLeft");
  expect((await state(page)).focused).toBe(NAMES.length - 1);
  expect(await page.evaluate(() => window.__picker.changes)).toEqual([
    NAMES[1],
    NAMES.at(-1),
    NAMES[0],
    NAMES.at(-1),
  ]);
});

test("Home and End jump to the ends, ArrowDown and ArrowUp mirror the horizontal arrows", async ({
  page,
}) => {
  await open(page);
  await page.locator(RADIOS).nth(5).click();
  await page.keyboard.press("Home");
  expect((await state(page)).focused).toBe(0);
  await page.keyboard.press("ArrowDown");
  expect((await state(page)).focused).toBe(1);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  expect((await state(page)).focused).toBe(NAMES.length - 1);
  await page.keyboard.press("End");
  expect(await state(page)).toEqual({
    checked: [LABELS.at(-1)],
    focused: NAMES.length - 1,
    tabbable: [NAMES.length - 1],
  });
});

test("Space and Enter select the focused radio", async ({ page }) => {
  await open(page);
  await page.locator(RADIOS).nth(3).focus();
  await page.keyboard.press("Space");
  await page.locator(RADIOS).nth(4).focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.__picker.changes)).toEqual([
    NAMES[3],
    NAMES[4],
  ]);
});
