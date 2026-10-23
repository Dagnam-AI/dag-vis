// Type-only import (erased at runtime): `window.__vis` inside page.evaluate callbacks.
import type {} from "../../demo/global.js";

import { copyFileSync, readFileSync } from "node:fs";
import { loadavg } from "node:os";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { createRng } from "../../src/core/index.js";

import {
  writeReport,
  type FidelityRow,
  type FidelityVariant,
  type LagFit,
  type PixelDiff,
} from "./fidelity-report.js";

const T = 2;
const OUT = "fidelity";
const FRONTEND_ORIGIN = `http://localhost:${process.env.FIDELITY_FRONTEND_PORT ?? "5174"}`;
const GALLERY_ORIGIN = "http://localhost:5173";
const DEAD_API_ORIGIN = "http://127.0.0.1:59999";
const STEP_MS = 16;
/**
 * R3F (the landing's Dither) starts its own clock a few rAF frames after its canvas
 * is in the DOM, and how many depends on real-time events (ResizeObserver, lazy
 * chunks, shader compile) and so on machine load: a fixed lag gave 0.8% on a quiet
 * machine and 45% on a loaded one. So the lag is FITTED PER RUN: the dither card is
 * captured at each of DITHER_LAGS frames after mount + 2 s (one 16 ms page-clock step
 * each; the paused clock holds the frame still between steps), and the gallery test
 * keeps the candidate with the lowest raw difference against the gallery frame.
 * That is one integer fitted to the frame it is compared with: it cannot remove a
 * texture or resolution difference (the dpr 2 floor stays), and the chosen lag, the
 * figures at lag 0 and at the old fixed 3, and the best figure are all printed on the
 * page, with a banner when the fit looks unreliable. The other effects start within
 * their first frame and are captured once. FIDELITY_DITHER_LAG_FRAMES=<n> skips the
 * fit and uses n frames; anything but a non-negative integer is an error.
 */
function parseLag(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw))
    throw new Error(
      `FIDELITY_DITHER_LAG_FRAMES must be a non-negative integer number of frames, got "${raw}"`,
    );
  return Number(raw);
}
const LAG_OVERRIDE = parseLag(process.env.FIDELITY_DITHER_LAG_FRAMES);
const DITHER_LAGS =
  LAG_OVERRIDE === undefined ? [0, 1, 2, 3, 4, 5, 6] : [LAG_OVERRIDE];
const OLD_FIXED_LAG = 3;
const LAG_DIR = "dither-lag";
const DITHER_NOTE =
  "Same frame in principle (no random phase in either), but R3F starts its clock a load-dependent number of frames after its canvas appears, so the landing capture is fitted: it was taken at several lags (16 ms page-clock steps) and the one closest to this gallery frame is shown. The fit is one integer fitted to the frame it is compared with; it cannot remove a texture or resolution difference. See the fit table below.";
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
    note: "The landing's default theme at integer dpr 1 (at a fractional dpr the @dagnam/vis runtime rounds its canvas buffer up by 1 px, which would shift every pixel against today's canvas, so only integer ratios are compared).",
  },
  {
    id: "light-2x",
    title: "Light theme, dpr 2 (Retina)",
    colorScheme: "light",
    dpr: 2,
    note: "Today's Dither forces dpr 1 on the landing (its dither component), so its canvas is rendered at 1x and upscaled by the browser; @dagnam/vis renders at the device ratio (capped by maxDpr 2) with pixelSize scaled by dpr. A higher dither number here is that real difference, not tool noise. The dither lag was fitted at dpr 1 only.",
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
  /** Compared region in CSS px: today's canvas box snapped to whole device pixels. */
  width: number;
  height: number;
  /** The canvas's bounding box as laid out (logged: a fractional origin matters for the crop). */
  box: { x: number; y: number; width: number; height: number };
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
    const text = m.text().slice(0, 300);
    consoleErrors.push(text);
    // The landing's console is noisy by design (every aborted API call logs), so
    // only a graphics failure there is fatal; the gallery tolerates no error.
    if (strictConsole || /webgl|shader|context[ -]?lost/i.test(text))
      problems.push(`console.error: ${text}`);
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
 * Screenshots the locator's box on whole DEVICE pixels, with the same rule on both
 * sides: each edge is rounded to the nearest device pixel, which is how Chrome snaps
 * a layout box when it paints it (the landing canvas sits at y = 247.77 and is drawn
 * at 248; its border row is above that). Flooring the origin would pull that border
 * row into the capture, and ceiling it would shift the crop a pixel whenever the
 * fraction is below .5. The gallery stage is placed at the page origin, where the
 * rule is a no-op. Passing `size` reuses today's region on the gallery side.
 */
async function shoot(
  page: Page,
  target: Locator,
  path: string,
  size?: { width: number; height: number },
): Promise<{ width: number; height: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error(`${path}: no bounding box`);
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const snap = (v: number): number => Math.round(v * dpr) / dpr;
  const x = snap(box.x);
  const y = snap(box.y);
  const width = size?.width ?? snap(box.x + box.width) - x;
  const height = size?.height ?? snap(box.y + box.height) - y;
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
const RUN_START_LOAD = loadavg()[0] ?? 0;

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
      // (Installing the clock and then letting it run leaves time flowing between
      // mount and capture, which makes the elapsed time arbitrary.)
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

      // One capture event per effect at mount + 2 s; the dither card is captured at
      // every candidate lag instead (the gallery test fits it), in time order.
      const events = ROWS.flatMap((row) =>
        (row.effect === "dither" ? DITHER_LAGS : [0]).map((lag) => ({
          row,
          lag,
          at: (mountedAt[row.effect] ?? 0) + T * 1000 + lag * STEP_MS,
        })),
      ).sort((a, b) => a.at - b.at);
      for (const { row, lag, at } of events) {
        if (at > now) {
          await page.clock.runFor(at - now);
          now = at;
        }
        const card = cards.nth(row.index);
        const canvas = card.locator("canvas");
        const wrapper = canvas.locator(
          "xpath=ancestor::div[@aria-hidden='true'][1]",
        );
        const base =
          row.effect === "dither"
            ? `${dir}/${LAG_DIR}/lag${String(lag)}`
            : `${dir}/${row.effect}`;
        if (!(row.effect in captured)) {
          // Context first (card text included); the canvas shots then hide every
          // sibling of the background wrapper, since a screenshot captures
          // whatever is painted over the canvas box (the card's text and button).
          await card.screenshot({ path: `${dir}/${row.effect}-card.png` });
        }
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
        const region = await shoot(page, canvas, `${base}-today-seen.png`);
        await wrapper.evaluate((el) => {
          el.style.setProperty("opacity", "1");
        });
        await shoot(page, canvas, `${base}-today.png`, region);
        await wrapper.evaluate((el) => {
          el.style.removeProperty("opacity");
        });
        await hide(false);
        const box = await canvas.boundingBox();
        if (!box) throw new Error(`${row.effect}: canvas has no box`);
        captured[row.effect] ??= {
          width: region.width,
          height: region.height,
          box,
          stage: {
            width: Math.round(box.width),
            height: Math.round(box.height),
          },
          wrapper: info,
        };
      }
      // Errors that only appear after the effects have mounted and drawn count too.
      watcher.check("Landing page (after capture)");
      const stubHits = await page.evaluate(() =>
        Number(Reflect.get(window, "__stubHits")),
      );
      expect(stubHits).toBeGreaterThan(0);
      console.log(
        `[${variant.id}] mounted at fake ms: ${JSON.stringify(mountedAt)}; canvas boxes: ${JSON.stringify(Object.fromEntries(Object.entries(captured).map(([k, c]) => [k, c.box])))}; stub hits: ${String(stubHits)}; API calls aborted: ${String(apiCalls)}; external origins aborted: ${[...external].join(", ") || "none"}`,
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
        let fit: LagFit | undefined;
        if (name === "dither") {
          // Fit the start lag: keep the candidate capture closest to this frame.
          const figures = [];
          for (const lag of DITHER_LAGS)
            figures.push({
              lag,
              diff: await diff(
                page,
                `${dir}/${LAG_DIR}/lag${String(lag)}-today.png`,
                `${dir}/${name}-vis.png`,
              ),
            });
          const score = (f: { diff: PixelDiff | null }): number[] => [
            f.diff?.over8 ?? Infinity,
            f.diff?.mean ?? Infinity,
          ];
          const best = figures.reduce((a, b) => {
            const [a0 = 0, a1 = 0] = score(a);
            const [b0 = 0, b1 = 0] = score(b);
            return b0 < a0 || (b0 === a0 && b1 < a1) ? b : a;
          });
          for (const suffix of ["today", "today-seen"])
            copyFileSync(
              `${dir}/${LAG_DIR}/lag${String(best.lag)}-${suffix}.png`,
              `${dir}/${name}-${suffix}.png`,
            );
          fit = {
            chosen: best.lag,
            oldFixed: OLD_FIXED_LAG,
            override: LAG_OVERRIDE !== undefined,
            figures,
          };
        }
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
          ...(fit ? { fit } : {}),
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
      watcher.check("Gallery page (after capture)");
      // A banner, never a failure: this is a sign-off tool and the run completes.
      const fit = rows.find((r) => r.effect === "dither")?.fit;
      const reasons: string[] = [];
      if (fit && !fit.override) {
        const best = fit.figures.find((f) => f.lag === fit.chosen)?.diff;
        if (fit.chosen < 1 || fit.chosen > 6)
          reasons.push(
            `the fitted dither lag is ${String(fit.chosen)}, outside 1..6`,
          );
        if (variant.dpr === 1 && (!best || best.over8 > 0.05))
          reasons.push(
            `the best dpr 1 dither figure is ${best ? `${(best.over8 * 100).toFixed(1)}%` : "unmeasurable"}, above 5%`,
          );
      }
      if (fit)
        console.log(
          `[${variant.id}] dither lag fit: chosen ${String(fit.chosen)}${fit.override ? " (override)" : ""}; ${fit.figures.map((f) => `lag ${String(f.lag)}: ${f.diff ? `${(f.diff.over8 * 100).toFixed(2)}%` : "n/a"}`).join(", ")}${reasons.length > 0 ? `; BANNER: ${reasons.join("; ")}` : ""}`,
        );
      results.push({
        id: variant.id,
        title: variant.title,
        note: variant.note,
        dpr: variant.dpr,
        load: loadavg()[0] ?? 0,
        ...(reasons.length > 0
          ? {
              banner: `Alignment looks unreliable (${reasons.join("; ")}). Re-run when the machine is quiet.`,
            }
          : {}),
        rows,
      });
    });
  });
}

test("fidelity report page", ({ browser }) => {
  writeReport(OUT, results, EXTRAS, {
    node: process.version,
    chromium: browser.version(),
    loadAtStart: RUN_START_LOAD,
    loadAtEnd: loadavg()[0] ?? 0,
  });
});
