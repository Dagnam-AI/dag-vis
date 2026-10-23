// Types `window.__vis` inside page.evaluate callbacks (type-only: erased at runtime).
import type {} from "../../demo/global.js";

import { expect, test } from "@playwright/test";

// The effect names the gallery exposes (demo/main.ts), one card each.
const EFFECTS = ["dither", "pixel", "terminal", "glitch", "ribbon"] as const;
const T = 2;

for (const name of EFFECTS) {
  test(`${name}: renders a non-blank, deterministic frame at t=${String(T)}`, async ({
    page,
  }) => {
    await page.goto(`/?effect=${name}&t=${String(T)}&seed=1`);
    const stage = page.locator(`[data-effect="${name}"] .stage`);
    await expect(stage.locator("canvas")).toBeVisible();
    const coverage = await page.evaluate(
      ([n, t]) => window.__vis.sample(n as string, t as number),
      [name, T],
    );
    expect(coverage).toBeGreaterThan(0.01);
    const [a, b] = await page.evaluate(
      ([n, t]) => [
        window.__vis.snapshot(n as string, t as number),
        window.__vis.snapshot(n as string, t as number),
      ],
      [name, T],
    );
    expect(a).toBe(b);
    // An artifact for the owner's sign-off, never compared against a baseline.
    await stage.screenshot({ path: `screenshots/${name}.png` });
  });
}

test("ribbon loops seamlessly: frame 0 equals frame duration, and just before it is next to it", async ({
  page,
}) => {
  await page.goto("/?effect=ribbon&t=0&seed=1");
  await expect(page.locator('[data-effect="ribbon"] canvas')).toBeVisible();
  const f = await page.evaluate(() => {
    const ribbon = window.__vis.handles.ribbon;
    if (!ribbon) throw new Error("no ribbon handle");
    const snap = (t: number): string => window.__vis.snapshot("ribbon", t);
    // Mean absolute difference (0..255) between the frames at two times.
    const pixels = (t: number): Uint8ClampedArray => {
      ribbon.renderAt(t);
      const c = document.createElement("canvas");
      c.width = ribbon.canvas.width;
      c.height = ribbon.canvas.height;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      ctx.drawImage(ribbon.canvas, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const diff = (a: number, b: number): number => {
      const x = pixels(a);
      const y = pixels(b);
      let sum = 0;
      for (let i = 0; i < x.length; i += 1)
        sum += Math.abs((x[i] ?? 0) - (y[i] ?? 0));
      return sum / x.length;
    };
    // Control: the gallery creates the ribbon without `loop`, so it drifts and
    // the frames at 0 and 4 differ. Without this the equality below could pass
    // on a ribbon that never moves.
    const unlooped = [snap(0), snap(4)];
    ribbon.update({ loop: { duration: 4 } });
    return {
      unlooped,
      duration: ribbon.duration,
      looped: [snap(0), snap(4), snap(2)],
      // The phase must complete a full turn per loop, so a frame an instant
      // before the end is as far from frame 0 as a frame an instant after it
      // (and both are far closer than the middle of the loop).
      nearEnd: diff(3.99, 0),
      nearStart: diff(0.01, 0),
      middle: diff(2, 0),
    };
  });
  expect(f.unlooped[0]).not.toBe(f.unlooped[1]);
  expect(f.duration).toBe(4);
  const [start, end, middle] = f.looped;
  expect(end).toBe(start);
  expect(middle).not.toBe(start);
  expect(f.middle).toBeGreaterThan(0);
  expect(f.nearEnd / f.nearStart).toBeGreaterThan(0.5);
  expect(f.nearEnd / f.nearStart).toBeLessThan(2);
  expect(f.nearEnd).toBeLessThan(f.middle);
});

test("every effect runs live, then destroys cleanly and leaves its canvas usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?seed=1");
  await expect(page.locator(".card canvas")).toHaveCount(EFFECTS.length);
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const handles = Object.entries(window.__vis.handles);
    const runningBefore = handles.map(([, h]) => h.running);
    for (const [, h] of handles) h.destroy();
    return handles.map(([name, h], i) => {
      // The destroy contract: the canvas keeps its context (no loseContext),
      // so a recreated effect can draw on it; the handle itself is dead.
      const gl = h.canvas.getContext("webgl2");
      const usable = gl
        ? !gl.isContextLost()
        : h.canvas.getContext("2d") !== null;
      let afterDestroy = "no error";
      try {
        h.renderAt(0);
      } catch (e) {
        afterDestroy = (e as Error).message;
      }
      return {
        name,
        runningBefore: runningBefore[i],
        runningAfter: h.running,
        usable,
        afterDestroy,
      };
    });
  });
  expect(r.map((x) => x.name)).toEqual([...EFFECTS]);
  for (const x of r) {
    expect(x.runningBefore, `${x.name} was running`).toBe(true);
    expect(x.runningAfter, `${x.name} stopped`).toBe(false);
    expect(x.usable, `${x.name} canvas keeps its context`).toBe(true);
    expect(x.afterDestroy, `${x.name} rejects use`).toMatch(/destroyed/);
  }
  expect(errors).toEqual([]);
});

test("a bad URL shows one error naming the parameter and builds no cards", async ({
  page,
}) => {
  await page.goto("/?seed=abc");
  // Scoped to #gallery > p.error: every slider form also holds an empty p.error.
  const error = page.locator("#gallery > p.error");
  await expect(error).toHaveCount(1);
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error).toContainText("?seed=abc");
  await expect(page.locator(".card")).toHaveCount(0);
  const message = await page.evaluate(() => window.__vis.error);
  expect(message).toContain("?seed=abc");
  expect(Object.keys(await page.evaluate(() => window.__vis.handles))).toEqual(
    [],
  );
});

test("?w=&h= sizes the stage", async ({ page }) => {
  await page.goto("/?effect=ribbon&t=0&w=200&h=300");
  const stage = page.locator('[data-effect="ribbon"] .stage');
  await expect(stage.locator("canvas")).toBeVisible();
  const box = await stage.boundingBox();
  expect(box?.width).toBe(200);
  expect(box?.height).toBe(300);
  await expect(page.locator("#gallery > p.error")).toHaveCount(0);
});
