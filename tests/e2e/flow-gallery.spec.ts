// Type-only import (erased at runtime): `window.__flow` inside page.evaluate callbacks.
import type {} from "../../demo/global.js";

import { expect, test, type Page } from "@playwright/test";

import { fieldPresets } from "../../src/index.js";

const NAMES = Object.keys(fieldPresets);
const card = (page: Page, name: string) =>
  page.locator(`section.card[data-preset="${name}"]`);

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/flow.html${query}`);
  await expect(page.locator("section.card")).toHaveCount(NAMES.length);
}

/** The first bytes and the length of what a card's download link points at, read in the page. */
async function fetched(page: Page, name: string, head = 32) {
  return card(page, name)
    .locator("a[download]")
    .evaluate(async (a: HTMLAnchorElement, n: number) => {
      const bytes = new Uint8Array(await (await fetch(a.href)).arrayBuffer());
      return { head: Array.from(bytes.slice(0, n)), length: bytes.length };
    }, head);
}

const ascii = (bytes: number[], from: number, to: number): string =>
  String.fromCharCode(...bytes.slice(from, to));

test("every preset gets a card with its name, kind and five export buttons", async ({
  page,
}) => {
  await open(page);
  expect(NAMES).toHaveLength(19);
  for (const name of NAMES) {
    const c = card(page, name);
    await expect(c.getByRole("heading", { level: 2 })).toContainText(name);
    await expect(c.locator("button")).toHaveText([
      "png",
      "webp",
      "gif",
      "mp4",
      "webm",
    ]);
  }
});

// A card's field is compiled on first use, which costs a few hundred milliseconds of software GL
// (several seconds on a loaded runner, and live loops make every frame slower still), so the waits
// for a card to come alive are generous and this walk uses frozen time (one frame per card, no loops).
const COMPILE = { timeout: 45_000 };

test("scrolling through every card: each canvas is non-blank, live cards stay under the cap, no context leaks", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await open(page, "?t=1.25");
  for (const name of NAMES) {
    const c = card(page, name);
    await c.scrollIntoViewIfNeeded();
    await expect(c).toHaveAttribute("data-state", "still", COMPILE);
    // Read in the same task as the render: the drawing buffer is cleared after compositing.
    const { lit, spread } = await page.evaluate(
      (n) => window.__flow.sample(n, 1.25),
      name,
    );
    expect(lit, `${name} lit share`).toBeGreaterThan(0.99);
    expect(spread, `${name} luma range`).toBeGreaterThan(3);
    const s = await page.evaluate(() => window.__flow.stats());
    expect(s.live).toBeLessThanOrEqual(s.cap);
  }
  // The first card left the screen long ago: its handle and context are gone.
  await expect(card(page, NAMES[0] ?? "")).toHaveAttribute(
    "data-state",
    "idle",
    COMPILE,
  );
  const s = await page.evaluate(() => window.__flow.stats());
  expect(s.peak).toBeLessThanOrEqual(s.cap);
  expect(s.created).toBeGreaterThanOrEqual(NAMES.length);
  expect(s.leaked).toBe(0);
  // Every canvas not on a live card was released with its context lost.
  expect(s.open).toBe(s.live);
  expect(s.contexts).toBe(s.live);
  expect(s.released).toBe(s.created - s.live);
});

test("a viewport that shows every card still keeps only the cap live", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 6000 });
  await open(page);
  const cap = await page.evaluate(() => window.__flow.stats().cap);
  await expect(page.locator('section.card[data-state="live"]')).toHaveCount(
    cap,
    COMPILE,
  );
  await expect(page.locator('section.card[data-state="idle"]')).toHaveCount(
    NAMES.length - cap,
  );
  const s = await page.evaluate(() => window.__flow.stats());
  expect(s.peak).toBe(cap);
  expect(s.contexts).toBe(cap);
  // Live mode: every live card runs its loop.
  expect(s.running).toBe(cap);
});

test("reduced motion draws a still frame and starts no loop", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const first = card(page, NAMES[0] ?? "");
  await expect(first).toHaveAttribute("data-state", "still", COMPILE);
  const s = await page.evaluate(() => window.__flow.stats());
  expect(s.live).toBeGreaterThan(0);
  expect(s.running).toBe(0);
  const { lit } = await page.evaluate(
    (n) => window.__flow.sample(n, 0),
    NAMES[0] ?? "",
  );
  expect(lit).toBeGreaterThan(0.99);
});

test("?t freezes every card at one still frame", async ({ page }) => {
  await open(page, "?t=1.25");
  await expect(card(page, NAMES[0] ?? "")).toHaveAttribute(
    "data-state",
    "still",
    COMPILE,
  );
  expect(await page.evaluate(() => window.__flow.stats().running)).toBe(0);
});

test("an invalid parameter shows one visible error and builds no cards", async ({
  page,
}) => {
  await page.goto("/flow.html?w=641");
  await expect(page.getByRole("alert")).toContainText(
    "Invalid ?w=641: expected an even integer",
  );
  await expect(page.locator("section.card")).toHaveCount(0);
  expect(await page.evaluate(() => window.__flow.error)).toContain("?w=641");
});

/** Tab until an export button has focus (the page starts with a link before the first card). */
async function tabToButton(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement?.tagName === "BUTTON"))
      return;
  }
  throw new Error("no button received focus");
}

test("keyboard focus on an export button is visible", async ({ page }) => {
  await open(page);
  await tabToButton(page);
  const outline = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement!);
    return {
      tag: document.activeElement!.tagName,
      style: s.outlineStyle,
      width: s.outlineWidth,
    };
  });
  expect(outline).toEqual({ tag: "BUTTON", style: "solid", width: "2px" });
});

test("a keyboard export keeps focus on the pressed button", async ({
  page,
}) => {
  await open(page, "?w=160&h=90");
  await tabToButton(page);
  await page.keyboard.press("Enter");
  const first = card(page, NAMES[0] ?? "");
  await expect(first.locator("a[download]")).toBeVisible();
  const focused = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    format: (document.activeElement as HTMLElement | null)?.dataset.format,
    preset: document.activeElement?.closest("section")?.dataset.preset,
  }));
  expect(focused).toEqual({ tag: "BUTTON", format: "png", preset: NAMES[0] });
});

/**
 * Waits for the page to settle, then checks that no card is paused while it shows clearly more than a
 * live one, and that when 12 or fewer cards have half their area on screen all of them are live.
 */
async function expectMostVisibleLive(page: Page, label: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const vh = document.documentElement.clientHeight;
          const cards = Array.from(
            document.querySelectorAll<HTMLElement>("section.card"),
          ).map((c) => {
            const r = c.getBoundingClientRect();
            const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
            const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
            return {
              name: c.dataset.preset ?? "?",
              share: (w * h) / (r.width * r.height),
              live: c.dataset.state === "live",
            };
          });
          const { cap, live } = window.__flow.stats();
          const half = cards.filter((c) => c.share >= 0.5);
          const weakestLive = Math.min(
            1,
            ...cards.filter((c) => c.live).map((c) => c.share),
          );
          const bad = [
            ...cards
              .filter((c) => !c.live && c.share > weakestLive + 0.02)
              .map((c) => `${c.name} paused at ${c.share.toFixed(2)}`),
            ...(half.length <= cap
              ? half.filter((c) => !c.live).map((c) => `${c.name} half-visible`)
              : []),
          ];
          return { bad, over: live > cap, halfVisible: half.length };
        }),
      { message: label, ...COMPILE },
    )
    .toMatchObject({ bad: [], over: false });
}

test("while scrolling at a laptop size the live cards are the ones most on screen", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await open(page);
  for (const y of [0, 400, 600, 800, 1000]) {
    await page.evaluate((top) => {
      window.scrollTo(0, top);
    }, y);
    await expectMostVisibleLive(page, `scrollY ${String(y)}`);
  }
  const s = await page.evaluate(() => window.__flow.stats());
  expect(s.peak).toBeLessThanOrEqual(s.cap);
  expect(s.leaked).toBe(0);
});

test("resizing the window re-ranks the cards from fresh measurements", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await open(page);
  await page.evaluate(() => {
    window.scrollTo(0, 400);
  });
  await expectMostVisibleLive(page, "scrollY 400");
  // Fewer columns and a different height: no scroll event, only a resize.
  for (const [width, height] of [
    [800, 700],
    [1280, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectMostVisibleLive(page, `${String(width)}x${String(height)}`);
  }
  const s = await page.evaluate(() => window.__flow.stats());
  expect(s.peak).toBeLessThanOrEqual(s.cap);
  expect(s.leaked).toBe(0);
});

test("png export: a PNG of the export size, a link, bytes shown, and the old link revoked by the next export", async ({
  page,
}) => {
  await open(page);
  const first = card(page, NAMES[0] ?? "");
  await first.scrollIntoViewIfNeeded();
  const png = first.getByRole("button", { name: "png" });
  await png.click();
  await expect(first.locator("a[download]")).toHaveText(
    `Download ${NAMES[0] ?? ""}.png`,
  );
  const result = first.getByRole("status");
  await expect(result).toContainText("png 640x360");
  const sent = await fetched(page, NAMES[0] ?? "");
  expect(sent.head.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(ascii(sent.head, 12, 16)).toBe("IHDR");
  const dv = new DataView(Uint8Array.from(sent.head).buffer);
  expect([dv.getUint32(16), dv.getUint32(20)]).toEqual([640, 360]);
  await expect(result).toContainText(
    `(${sent.length.toLocaleString("en-US")} bytes)`,
  );
  const download = page.waitForEvent("download");
  await first.locator("a[download]").click();
  expect((await download).suggestedFilename()).toBe(`${NAMES[0] ?? ""}.png`);
  // The next export revokes this card's previous object URL.
  const oldHref = await first
    .locator("a[download]")
    .getAttribute("href", { timeout: 5000 });
  await first.getByRole("button", { name: "webp" }).click();
  await expect(result).toContainText("webp 640x360");
  const stale = await page.evaluate(
    (h) =>
      fetch(h ?? "").then(
        () => "readable",
        () => "revoked",
      ),
    oldHref,
  );
  expect(stale).toBe("revoked");
  const webp = await fetched(page, NAMES[0] ?? "");
  expect(ascii(webp.head, 0, 4)).toBe("RIFF");
  expect(ascii(webp.head, 8, 12)).toBe("WEBP");
  // No context was left behind by either export.
  const s = await page.evaluate(() => window.__flow.stats());
  expect(s.leaked).toBe(0);
});

test("export buttons are disabled while an export runs, on every card", async ({
  page,
}) => {
  await open(page, "?w=320&h=180&fps=10&duration=1");
  const c = card(page, NAMES[1] ?? "");
  await c.scrollIntoViewIfNeeded();
  // Click and look in the same task: a short export can finish between two polls.
  const during = await c
    .getByRole("button", { name: "gif" })
    .evaluate((gif: HTMLButtonElement) => {
      gif.click();
      return {
        busy: document.querySelectorAll("section.card[aria-busy]").length,
        disabled: document.querySelectorAll('button[aria-disabled="true"]')
          .length,
        all: document.querySelectorAll("button").length,
      };
    });
  expect(during).toEqual({ busy: 1, disabled: during.all, all: 19 * 5 });
  await expect(c.locator("a[download]")).toBeVisible({ timeout: 90_000 });
  await expect(c).not.toHaveAttribute("aria-busy", "true");
  await expect(c.getByRole("button", { name: "png" })).toBeEnabled();
});

test("a failed export is shown as visible text, never a dialog, and frees the buttons", async ({
  page,
}) => {
  page.on("dialog", () => {
    throw new Error("the page opened a dialog");
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "OffscreenCanvas", { value: undefined });
  });
  await open(page);
  const c = card(page, NAMES[0] ?? "");
  await c.scrollIntoViewIfNeeded();
  await c.getByRole("button", { name: "png" }).click();
  await expect(c.getByRole("status")).toContainText(
    "png export failed: exportCanvas needs OffscreenCanvas",
  );
  await expect(c.getByRole("status")).toHaveClass(/error/);
  await expect(c.getByRole("button", { name: "png" })).toBeEnabled();
  expect(await page.evaluate(() => window.__flow.stats().leaked)).toBe(0);
});

test("gif export: a GIF header with the export size", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, "?w=160&h=90&fps=10&duration=1");
  const c = card(page, NAMES[2] ?? "");
  await c.scrollIntoViewIfNeeded();
  await c.getByRole("button", { name: "gif" }).click();
  await expect(c.locator("a[download]")).toHaveText(
    `Download ${NAMES[2] ?? ""}.gif`,
    { timeout: 90_000 },
  );
  await expect(c.getByRole("status")).toContainText("gif 160x90 1s at 10 fps");
  const gif = await fetched(page, NAMES[2] ?? "");
  expect(ascii(gif.head, 0, 6)).toBe("GIF89a");
  const dv = new DataView(Uint8Array.from(gif.head).buffer);
  expect([dv.getUint16(6, true), dv.getUint16(8, true)]).toEqual([160, 90]);
  expect(gif.length).toBeGreaterThan(100);
});

// mp4 (H.264) and webm (VP9) need WebCodecs encoders; the cached headless Chromium may lack H.264.
// Locally an unsupported codec skips with the reason; on CI it must fail instead.
const VIDEO = [
  {
    format: "webm",
    probe: { codec: "vp09.00.10.08" },
    check: (b: number[]) => b.slice(0, 4),
    magic: [0x1a, 0x45, 0xdf, 0xa3],
  },
  {
    format: "mp4",
    probe: { codec: "avc1.640028", avc: { format: "avc" } },
    check: (b: number[]) => b.slice(4, 8),
    magic: [0x66, 0x74, 0x79, 0x70],
  },
] as const;

for (const { format, probe, check, magic } of VIDEO) {
  test(`${format} export: a valid container when this browser can encode it`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, "?w=160&h=90&fps=10&duration=1");
    const supported = await page.evaluate(async (p) => {
      if (typeof VideoEncoder === "undefined") return false;
      const r = await VideoEncoder.isConfigSupported({
        ...p,
        width: 160,
        height: 90,
        bitrate: 200_000,
        framerate: 10,
      });
      return r.supported === true;
    }, probe);
    test.skip(
      !supported && !process.env.CI,
      `this Chromium has no ${format} encoder (${probe.codec})`,
    );
    expect(supported, `${format} must be encodable on CI`).toBe(true);
    const c = card(page, NAMES[3] ?? "");
    await c.scrollIntoViewIfNeeded();
    await c.getByRole("button", { name: format }).click();
    await expect(c.locator("a[download]")).toHaveText(
      `Download ${NAMES[3] ?? ""}.${format}`,
      { timeout: 90_000 },
    );
    const out = await fetched(page, NAMES[3] ?? "");
    expect(check(out.head)).toEqual([...magic]);
  });
}
