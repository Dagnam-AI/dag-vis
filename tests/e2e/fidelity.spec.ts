// Type-only import (erased at runtime): `window.__vis` inside page.evaluate callbacks.
import type {} from "../../demo/global.js";

import { readFileSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { createRng } from "../../src/core/index.js";

import {
  writeReport,
  type FidelityRow,
  type FidelityVariant,
  type PixelDiff,
} from "./fidelity-report.js";

const T = 2;
const OUT = "fidelity";
const FRONTEND_ORIGIN = `http://localhost:${process.env.FIDELITY_FRONTEND_PORT ?? "5174"}`;
const GALLERY_ORIGIN = "http://localhost:5173";
const DEAD_API_ORIGIN = "http://127.0.0.1:59999";
const STEP_MS = 16;
/**
 * Dither is aligned with a measured 3-frame (about 48 ms) R3F start lag that was
 * fitted against the gallery frame it is compared with: R3F starts its clock about
 * three rAF frames after its canvas is in the DOM, so capturing at mount + 2 s
 * showed t = 1.955 s. Without the lag the difference is about 15% of pixels
 * (14.7% at dpr 1, light, measured before the crop below), with it under 1%. The
 * constant is empirical (frame-counted: it may drift under load or on other GPUs)
 * and a wrong value shows up only as a higher dither number, never as a failure.
 * FIDELITY_DITHER_LAG_FRAMES overrides it to re-measure. The other effects start
 * within the first frame (PixelBlast's frame is flat across 1.99-2.01 s).
 */
const START_LAG_FRAMES: Record<string, number> = {
  dither: Number(process.env.FIDELITY_DITHER_LAG_FRAMES ?? "3"),
};
const DITHER_NOTE =
  "Same frame in principle (no random phase in either), but aligned with a fitted start lag: START_LAG_FRAMES, a measured 3-frame (about 48 ms) R3F start lag fitted against this gallery frame itself. Without it the difference is about 15% of pixels. The constant is empirical (frame-counted, may drift under load or on other GPUs); a wrong value shows up only as a higher dither number.";
/** Landing card order (landing-content.ts PRICING.plans): Free=dither, Pro=pixel, Team=terminal, Enterprise=glitch. */
const ROWS = [
  { effect: "dither", card: "Free", index: 0, note: DITHER_NOTE },
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

interface Variant {
  id: string;
  title: string;
  colorScheme: "light" | "dark";
  dpr: 1 | 2;
  note: string;
}
/** The first variant is the main sign-off pass; the others show what the first cannot. */
const VARIANTS: Variant[] = [
  {
    id: "light-1x",
    title: "Light theme, dpr 1 (main pass)",
    colorScheme: "light",
    dpr: 1,
    note: "The landing's default theme at integer dpr 1 (the runtime rounds its buffer up 1 px at fractional dpr).",
  },
  {
    id: "light-2x",
    title: "Light theme, dpr 2 (Retina)",
    colorScheme: "light",
    dpr: 2,
    note: "Today's Dither forces dpr 1 on the landing (mvp-frontend dither.tsx), so its canvas is rendered at 1x and upscaled by the browser; @dagnam/vis renders at the device ratio (capped by maxDpr 2) with pixelSize scaled by dpr. A higher dither number here is that real difference, not tool noise. The dither lag was fitted at dpr 1 only.",
  },
  {
    id: "dark-1x",
    title: "Dark theme, dpr 1",
    colorScheme: "dark",
    dpr: 1,
    note: "prefers-color-scheme: dark: dark card background and glitch at dark:opacity-30. The gallery frame uses the card's real computed background and opacity.",
  },
];

interface Captured {
  /** Compared region in CSS px, whole pixels inside today's canvas box. */
  width: number;
  height: number;
  /** The CSS size the gallery stage is built at (the canvas's rounded size). */
  stage: { width: number; height: number };
  wrapper: { opacity: number; classes: string; background: string };
}

interface Watch {
  /** Throws, with the page's own errors, when the page has hit one. */
  check(context: string): void;
  consoleErrors: string[];
}

/** Collects uncaught page errors, 5xx responses from our own servers and console errors. */
function watch(page: Page, origins: string[], strictConsole: boolean): Watch {
  const problems: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500 && origins.some((o) => r.url().startsWith(o)))
      problems.push(`HTTP ${String(r.status())} for ${r.url()}`);
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    consoleErrors.push(m.text().slice(0, 300));
    if (strictConsole)
      problems.push(`console.error: ${m.text().slice(0, 300)}`);
  });
  return {
    consoleErrors,
    check(context) {
      if (problems.length > 0)
        throw new Error(
          `${context}: ${problems.slice(0, 3).join(" | ")}. (A stale or broken frontend install is the usual cause: run \`yarn install\` there.)`,
        );
    },
  };
}

/**
 * Screenshots whole pixels inside the locator's box: the origin rounds up and the
 * far edge down, so the card border (today) and the page chrome (gallery) never
 * enter the capture. Passing `size` reuses today's region on the gallery side.
 */
async function shoot(
  page: Page,
  target: Locator,
  path: string,
  size?: { width: number; height: number },
): Promise<{ width: number; height: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error(`${path}: no bounding box`);
  const x = Math.ceil(box.x);
  const y = Math.ceil(box.y);
  const width = size?.width ?? Math.floor(box.x + box.width) - x;
  const height = size?.height ?? Math.floor(box.y + box.height) - y;
  await page.screenshot({ path, clip: { x, y, width, height } });
  return { width, height };
}

/** Decodes two PNGs in the browser (no PNG library needed) and compares their RGB. */
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

const results: FidelityVariant[] = [];

test.describe.configure({ mode: "serial" });

for (const variant of VARIANTS) {
  test.describe(variant.id, () => {
    test.use({
      colorScheme: variant.colorScheme,
      deviceScaleFactor: variant.dpr,
    });
    const dir = `${OUT}/${variant.id}`;
    const captured: Record<string, Captured> = {};

    test(`today's landing cards, 2 s after each mounts`, async ({ page }) => {
      const watcher = watch(page, [FRONTEND_ORIGIN], false);
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
      // Nothing outside the two local servers is ever contacted: the dead API
      // origin and every other origin (fonts, CDNs, analytics) are aborted. The
      // landing serves its fonts itself, so this does not change the look; the
      // aborted external URLs are logged below so a change would be visible.
      let apiCalls = 0;
      const external = new Set<string>();
      await page.route("**/*", async (route) => {
        const origin = new URL(route.request().url()).origin;
        if (origin === FRONTEND_ORIGIN) return route.fallback();
        if (origin === DEAD_API_ORIGIN) apiCalls += 1;
        else external.add(origin);
        return route.abort("failed");
      });
      // The clock is paused from the start, so the page's time moves only when
      // this test advances it: each effect's own clock (THREE.Clock and
      // performance.now) is exact whatever the load and network delays were.
      // (The brief's install-then-runFor leaves time flowing between mount and
      // capture, which makes the elapsed time arbitrary.)
      await page.clock.install({ time: 0 });
      await page.clock.pauseAt(1000);
      await page.goto(`${FRONTEND_ORIGIN}/`, { waitUntil: "commit" });

      const cards = page.locator("#the-pricing .bg-card");
      let now = 1000;
      const mountedAt: Record<string, number> = {};
      let scrolled = false;
      const deadline = Date.now() + 90_000;
      while (
        Object.keys(mountedAt).length < ROWS.length &&
        Date.now() < deadline
      ) {
        watcher.check("Landing page");
        await page.clock.runFor(STEP_MS);
        now += STEP_MS;
        if (!scrolled && (await page.locator("#the-pricing").count()) > 0) {
          await page.locator("#the-pricing").scrollIntoViewIfNeeded();
          scrolled = true;
        }
        if ((await cards.count()) >= ROWS.length) {
          for (const row of ROWS) {
            if (row.effect in mountedAt) continue;
            if ((await cards.nth(row.index).locator("canvas").count()) > 0)
              mountedAt[row.effect] = now;
          }
        }
        await page.waitForTimeout(10);
      }
      watcher.check("Landing page");
      if (Object.keys(mountedAt).length < ROWS.length)
        throw new Error(
          `Landing cards did not all mount in 90 s (mounted: ${Object.keys(mountedAt).join(", ") || "none"}). Console errors: ${watcher.consoleErrors.slice(-3).join(" | ") || "none"}`,
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
              (el.getAttribute("class") ?? "").match(
                /(?:dark:)?opacity-\d+/g,
              ) ?? []
            ).join(" "),
            background: getComputedStyle(host).backgroundColor,
          };
        });
        // Context first (card text included); the canvas shots then hide every
        // sibling of the background wrapper, since a screenshot captures
        // whatever is painted over the canvas box (the card's text and button).
        await card.screenshot({ path: `${dir}/${row.effect}-card.png` });
        const hide = (on: boolean): Promise<void> =>
          wrapper.evaluate((el, hidden) => {
            for (const sibling of Array.from(
              el.parentElement?.children ?? [],
            )) {
              if (sibling !== el && sibling instanceof HTMLElement) {
                sibling.style.setProperty("visibility", hidden ? "hidden" : "");
              }
            }
          }, on);
        await hide(true);
        const region = await shoot(
          page,
          canvas,
          `${dir}/${row.effect}-today-seen.png`,
        );
        await wrapper.evaluate((el) => {
          el.style.setProperty("opacity", "1");
        });
        await shoot(page, canvas, `${dir}/${row.effect}-today.png`, region);
        await wrapper.evaluate((el) => {
          el.style.removeProperty("opacity");
        });
        await hide(false);
        const box = await canvas.boundingBox();
        if (!box) throw new Error(`${row.effect}: canvas has no box`);
        captured[row.effect] = {
          width: region.width,
          height: region.height,
          stage: {
            width: Math.round(box.width),
            height: Math.round(box.height),
          },
          wrapper: info,
        };
      }
      const stubHits = await page.evaluate(() =>
        Number(Reflect.get(window, "__stubHits")),
      );
      expect(stubHits).toBeGreaterThan(0);
      console.log(
        `[${variant.id}] mounted at fake ms: ${JSON.stringify(mountedAt)}; stub hits: ${String(stubHits)}; API calls aborted: ${String(apiCalls)}; external origins aborted: ${[...external].join(", ") || "none"}`,
      );
    });

    test(`gallery frames at the same size, t and seed`, async ({ page }) => {
      const watcher = watch(page, [GALLERY_ORIGIN], true);
      const rows: FidelityRow[] = [];
      const names: string[] = ROWS.map((r) => r.effect);
      if (variant.id === VARIANTS[0]?.id) names.push(...EXTRAS);
      for (const name of names) {
        const today = captured[name];
        // The ribbon has no landing card: it borrows the dither card's size.
        const size = (today ?? captured.dither)?.stage;
        if (!size) throw new Error(`no landing capture for ${name}`);
        await page.goto(
          `${GALLERY_ORIGIN}/?effect=${name}&t=${String(T)}&seed=1&w=${String(size.width)}&h=${String(size.height)}`,
        );
        // Put the stage at the page origin so its box is whole pixels.
        await page.addStyleTag({
          content:
            "header{display:none}#gallery{padding:0}.card{border:0;padding:0}",
        });
        const stage = page.locator(`[data-effect="${name}"] .stage`);
        await expect(stage.locator("canvas")).toBeVisible();
        await page.evaluate(
          ([n, t]) => window.__vis.sample(n as string, t as number),
          [name, T],
        );
        watcher.check("Gallery page");
        if (!today) {
          await shoot(page, stage, `${OUT}/${name}-vis.png`);
          continue;
        }
        const region = { width: today.width, height: today.height };
        // Same backdrop as the card, so transparency composites like the landing's.
        await stage.evaluate((el, bg) => {
          el.style.setProperty("background", bg);
        }, today.wrapper.background);
        await shoot(page, stage, `${dir}/${name}-vis.png`, region);
        await stage.locator("canvas").evaluate((el, o) => {
          el.style.setProperty("opacity", String(o));
        }, today.wrapper.opacity);
        await shoot(page, stage, `${dir}/${name}-vis-seen.png`, region);
        const row = ROWS.find((r) => r.effect === name);
        if (!row) throw new Error(`no row for ${name}`);
        rows.push({
          effect: name,
          card: row.card,
          note: row.note,
          wrapper: `${today.wrapper.classes} (computed opacity ${String(today.wrapper.opacity)})`,
          size: `${String(region.width)}x${String(region.height)}`,
          raw: await diff(
            page,
            `${dir}/${name}-today.png`,
            `${dir}/${name}-vis.png`,
          ),
          seen: await diff(
            page,
            `${dir}/${name}-today-seen.png`,
            `${dir}/${name}-vis-seen.png`,
          ),
        });
      }
      for (const r of rows) {
        console.log(
          `[${variant.id}] ${r.effect.padEnd(9)} raw: ${r.raw ? `${(r.raw.over8 * 100).toFixed(2)}% >8/255, mean ${r.raw.mean.toFixed(2)}` : "size mismatch"} | seen: ${r.seen ? `${(r.seen.over8 * 100).toFixed(2)}% >8/255, mean ${r.seen.mean.toFixed(2)}` : "size mismatch"}`,
        );
      }
      results.push({
        id: variant.id,
        title: variant.title,
        note: variant.note,
        rows,
      });
    });
  });
}

test("fidelity report page", () => {
  writeReport(OUT, results, EXTRAS);
});
