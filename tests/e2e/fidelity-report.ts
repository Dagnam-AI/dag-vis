import { mkdirSync, writeFileSync } from "node:fs";

/** Per-pair pixel difference; `null` when the two images differ in size. */
export interface PixelDiff {
  /** Share of pixels whose largest channel difference exceeds 8/255. */
  over8: number;
  /** Mean absolute difference over all channels, 0..255. */
  mean: number;
}

export interface FidelityRow {
  effect: string;
  card: string;
  note: string;
  /** The landing's CSS opacity wrapper classes and their computed value (light mode). */
  wrapper: string;
  /** Canvas size in CSS px (dpr 1). */
  size: string;
  raw: PixelDiff | null;
  seen: PixelDiff | null;
}

const pct = (n: number): string => `${(n * 100).toFixed(2)}%`;
const stat = (label: string, d: PixelDiff | null): string =>
  d === null
    ? `${label}: size mismatch`
    : `${label}: ${pct(d.over8)} of pixels differ by more than 8/255, mean abs diff ${d.mean.toFixed(2)}/255`;

/** A static page: per effect, today's canvas beside the @dagnam/vis frame, raw and with the landing's CSS opacity. */
export function writeReport(
  dir: string,
  rows: FidelityRow[],
  extras: string[],
): void {
  mkdirSync(dir, { recursive: true });
  const fig = (src: string, cap: string): string =>
    `<figure><img src="${src}" /><figcaption>${cap}</figcaption></figure>`;
  const section = (r: FidelityRow): string => `
    <section>
      <h2>${r.effect} <small>(${r.card} card, canvas ${r.size})</small></h2>
      <p>${r.note}</p>
      <p class="meta">Landing wrapper: <code>${r.wrapper}</code></p>
      <h3>Raw canvas, no CSS opacity</h3>
      <p class="meta">${stat("raw", r.raw)}</p>
      <div class="pair">${fig(`${r.effect}-today.png`, "today (mvp-frontend)")}${fig(`${r.effect}-vis.png`, "@dagnam/vis")}</div>
      <h3>As seen: same CSS opacity over the same card background</h3>
      <p class="meta">${stat("as seen", r.seen)}</p>
      <div class="pair">${fig(`${r.effect}-today-seen.png`, "today (mvp-frontend)")}${fig(`${r.effect}-vis-seen.png`, "@dagnam/vis")}</div>
      <h3>Context: today's whole card</h3>
      <div class="pair">${fig(`${r.effect}-card.png`, "today, full card")}</div>
    </section>`;
  const extra = (name: string): string => `
    <section><h2>${name} <small>(new, no site equivalent)</small></h2>
      <div class="pair">${fig(`${name}-vis.png`, "@dagnam/vis")}</div></section>`;
  writeFileSync(
    `${dir}/index.html`,
    `<!doctype html><meta charset="utf-8"><title>dag-vis fidelity</title>
<style>body{background:#111;color:#ddd;font:14px ui-monospace,monospace;padding:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0}img{display:block;border:1px solid #333}small,.meta{color:#999}h3{font-size:13px;color:#bbb;margin:16px 0 4px}code{color:#e8a}</style>
<h1>Fidelity: today's landing cards vs @dagnam/vis, 1 s after mount equals t = 2 s, seed 1, dpr 1, light theme</h1>
<p class="meta">A sign-off aid, not a pass/fail test: the numbers depend on the GPU and, for terminal and glitch, on an unmatched random phase.</p>
${rows.map(section).join("")}${extras.map(extra).join("")}`,
  );
}
