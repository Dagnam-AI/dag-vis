// Type-only import (erased at runtime): `window.__vis` inside page.evaluate callbacks.
import type {} from "../../demo/global.js";

import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { createRng } from "../../src/core/index.js";

import {
  writeReport,
  type FidelityRow,
  type PixelDiff,
} from "./fidelity-report.js";

const T = 2;
const OUT = "fidelity";
const FRONTEND = `http://localhost:${process.env.FIDELITY_FRONTEND_PORT ?? "5174"}`;
const GALLERY = "http://localhost:5173";
/** Landing card order (landing-content.ts PRICING.plans): Free=dither, Pro=pixel, Team=terminal, Enterprise=glitch. */
const ROWS = [
  {
    effect: "dither",
    card: "Free",
    index: 0,
    note: "Same frame in principle: no random phase in either, both at 2 s after start.",
  },
  {
    effect: "pixel",
    card: "Pro",
    index: 1,
    note: "Same frame in principle: crypto.getRandomValues is stubbed to createRng(1).next(), the gallery's seed-1 offset.",
  },
  {
    effect: "terminal",
    card: "Team",
    index: 2,
    note: "Same look, different phase (today's Math.random() offset cannot be matched), so the number is informational.",
  },
  {
    effect: "glitch",
    card: "Enterprise",
    index: 3,
    note: "Same look, different letters and phase. Deviation: colours now tween over 1/3 s (today's tween was a no-op after its first step). The number is informational.",
  },
] as const;
const EXTRAS = ["ribbon"];
const STEP_MS = 16;
/**
 * Frames between a card's canvas appearing and the effect's own clock starting
 * (measured, not guessed): R3F (Dither) starts its clock about three rAF frames
 * after its canvas is in the DOM, so capturing at mount + 2 s showed t = 1.955 s
 * (14.7% of pixels differ; best match at gallery t = 1.955 gave 0.6%). The others
 * start within the first frame (PixelBlast's frame is flat across 1.99-2.01 s).
 */
const START_LAG_FRAMES: Record<string, number> = { dither: 3 };

test.describe.configure({ mode: "serial" });

interface Wrapper {
  opacity: number;
  classes: string;
  background: string;
}
const captured: Record<
  string,
  { width: number; height: number; wrapper: Wrapper }
> = {};

test("today's landing cards, 2 s after each mounts", async ({ page }) => {
  // PixelBlast reads its phase as getRandomValues(new Uint32Array(1))[0] / 0xffffffff
  // and multiplies by 1000, exactly createRng(1).next() * 1000 in the gallery.
  const r = createRng(1).next();
  await page.addInitScript((seedValue: number) => {
    Reflect.set(window, "__stubHits", 0);
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((array: ArrayBufferView) => {
      if (array instanceof Uint32Array && array.length === 1) {
        Reflect.set(
          window,
          "__stubHits",
          Number(Reflect.get(window, "__stubHits")) + 1,
        );
        array[0] = Math.round(seedValue * 0xffffffff);
        return array;
      }
      return original(array as never);
    }) as typeof crypto.getRandomValues;
  }, r);
  // No API is ever contacted: every call to the (dead) API origin fails softly.
  let apiCalls = 0;
  await page.route("http://127.0.0.1:59999/**", async (route) => {
    apiCalls += 1;
    await route.abort("failed");
  });
  // The clock is paused from the start, so the page's time moves only when this
  // test advances it: each effect's own clock (THREE.Clock/performance.now)
  // reads exactly 2 s when its card is captured, whatever the load and network
  // delays were. (The brief's install-then-runFor leaves time flowing between
  // mount and capture, which makes the elapsed time arbitrary.)
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.goto(`${FRONTEND}/`, { waitUntil: "commit" });

  const cards = page.locator("#the-pricing .bg-card");
  let now = 1000;
  const mountedAt: Record<string, number> = {};
  let scrolled = false;
  for (
    let i = 0;
    i < 6000 && Object.keys(mountedAt).length < ROWS.length;
    i++
  ) {
    await page.clock.runFor(STEP_MS);
    now += STEP_MS;
    if (!scrolled && (await page.locator("#the-pricing").count()) > 0) {
      await page.locator("#the-pricing").scrollIntoViewIfNeeded();
      scrolled = true;
    }
    if ((await cards.count()) < ROWS.length) {
      await page.waitForTimeout(10);
      continue;
    }
    for (const row of ROWS) {
      if (row.effect in mountedAt) continue;
      if ((await cards.nth(row.index).locator("canvas").count()) > 0)
        mountedAt[row.effect] = now;
    }
    await page.waitForTimeout(10);
  }
  expect(Object.keys(mountedAt).sort()).toEqual(
    ROWS.map((r) => r.effect).sort(),
  );

  const byMount = [...ROWS].sort(
    (a, b) => (mountedAt[a.effect] ?? 0) - (mountedAt[b.effect] ?? 0),
  );
  for (const row of byMount) {
    const target =
      (mountedAt[row.effect] ?? 0) +
      T * 1000 +
      (START_LAG_FRAMES[row.effect] ?? 0) * STEP_MS;
    if (target > now) {
      await page.clock.runFor(target - now);
      now = target;
    }
    const card = cards.nth(row.index);
    const canvas = card.locator("canvas");
    const wrapper = canvas.locator(
      "xpath=ancestor::div[@aria-hidden='true'][1]",
    );
    const info = await wrapper.evaluate((el) => {
      const host = el.closest(".bg-card");
      if (!host) throw new Error("effect wrapper is outside a .bg-card");
      return {
        opacity: Number(getComputedStyle(el).opacity),
        classes: (
          (el.getAttribute("class") ?? "").match(/(?:dark:)?opacity-\d+/g) ?? []
        ).join(" "),
        background: getComputedStyle(host).backgroundColor,
      };
    });
    const box = await canvas.boundingBox();
    if (!box) throw new Error(`${row.effect}: canvas has no box`);
    captured[row.effect] = {
      width: Math.round(box.width),
      height: Math.round(box.height),
      wrapper: info,
    };
    // Context first (card text included); the canvas shots then hide every
    // sibling of the background wrapper, since an element screenshot captures
    // whatever is painted over the canvas box (the card's text and button).
    await card.screenshot({ path: `${OUT}/${row.effect}-card.png` });
    const hide = (on: boolean): Promise<void> =>
      wrapper.evaluate((el, hidden) => {
        for (const sibling of Array.from(el.parentElement?.children ?? [])) {
          if (sibling !== el && sibling instanceof HTMLElement) {
            sibling.style.setProperty("visibility", hidden ? "hidden" : "");
          }
        }
      }, on);
    await hide(true);
    await canvas.screenshot({ path: `${OUT}/${row.effect}-today-seen.png` });
    await wrapper.evaluate((el) => {
      el.style.setProperty("opacity", "1");
    });
    await canvas.screenshot({ path: `${OUT}/${row.effect}-today.png` });
    await wrapper.evaluate((el) => {
      el.style.removeProperty("opacity");
    });
    await hide(false);
  }
  const stubHits = await page.evaluate(() =>
    Number(Reflect.get(window, "__stubHits")),
  );
  expect(stubHits).toBeGreaterThan(0);
  console.log(
    `mounted at fake ms: ${JSON.stringify(mountedAt)}; getRandomValues stub hits: ${String(stubHits)}; API calls aborted: ${String(apiCalls)}`,
  );
});

/** Decodes two PNGs in the browser (no PNG library needed) and compares them. */
async function diff(
  page: Page,
  a: string,
  b: string,
): Promise<PixelDiff | null> {
  const pngs = [a, b].map((p) => readFileSync(p).toString("base64"));
  return page.evaluate(
    async ([x, y]) => {
      const load = async (b64: string): Promise<ImageData> => {
        const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
        const bmp = await createImageBitmap(blob, {
          colorSpaceConversion: "none",
        });
        const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d");
        if (!ctx) throw new Error("2d context unavailable");
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, bmp.width, bmp.height);
      };
      const [p, q] = [await load(x), await load(y)];
      if (p.width !== q.width || p.height !== q.height) return null;
      let over = 0;
      let sum = 0;
      for (let i = 0; i < p.data.length; i += 4) {
        let max = 0;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs((p.data[i + c] ?? 0) - (q.data[i + c] ?? 0));
          sum += d;
          max = Math.max(max, d);
        }
        if (max > 8) over += 1;
      }
      const n = p.width * p.height;
      return { over8: over / n, mean: sum / (n * 3) };
    },
    pngs as [string, string],
  );
}

test("gallery frames at the same size, t and seed, plus the diff report", async ({
  page,
}) => {
  const rows: FidelityRow[] = [];
  const sizeOf = (name: string): { width: number; height: number } =>
    captured[name] ?? captured.dither ?? { width: 320, height: 480 };
  for (const name of [...ROWS.map((r) => r.effect), ...EXTRAS]) {
    const size = sizeOf(name);
    const today = captured[name];
    await page.goto(
      `${GALLERY}/?effect=${name}&t=${String(T)}&seed=1&w=${String(size.width)}&h=${String(size.height)}`,
    );
    const stage = page.locator(`[data-effect="${name}"] .stage`);
    await expect(stage.locator("canvas")).toBeVisible();
    await page.evaluate(
      ([n, t]) => window.__vis.sample(n as string, t as number),
      [name, T],
    );
    if (!today) {
      await stage.screenshot({ path: `${OUT}/${name}-vis.png` });
      continue;
    }
    // Same backdrop as the card, so transparency composites like the landing's.
    await stage.evaluate((el, bg) => {
      el.style.setProperty("background", bg);
    }, today.wrapper.background);
    await stage.screenshot({ path: `${OUT}/${name}-vis.png` });
    await stage.locator("canvas").evaluate((el, o) => {
      el.style.setProperty("opacity", String(o));
    }, today.wrapper.opacity);
    await stage.screenshot({ path: `${OUT}/${name}-vis-seen.png` });
    const row = ROWS.find((r) => r.effect === name);
    if (!row) throw new Error(`no row for ${name}`);
    rows.push({
      effect: name,
      card: row.card,
      note: row.note,
      wrapper: `${today.wrapper.classes} (computed opacity ${String(today.wrapper.opacity)})`,
      size: `${String(size.width)}x${String(size.height)}`,
      raw: await diff(
        page,
        `${OUT}/${name}-today.png`,
        `${OUT}/${name}-vis.png`,
      ),
      seen: await diff(
        page,
        `${OUT}/${name}-today-seen.png`,
        `${OUT}/${name}-vis-seen.png`,
      ),
    });
  }
  for (const r of rows) {
    console.log(
      `${r.effect.padEnd(9)} raw: ${r.raw ? `${(r.raw.over8 * 100).toFixed(2)}% >8/255, mean ${r.raw.mean.toFixed(2)}` : "size mismatch"} | seen: ${r.seen ? `${(r.seen.over8 * 100).toFixed(2)}% >8/255, mean ${r.seen.mean.toFixed(2)}` : "size mismatch"}`,
    );
  }
  writeReport(OUT, rows, EXTRAS);
});
