import { mkdirSync, writeFileSync } from "node:fs";

/** Per-pair pixel difference; `null` when the two images differ in size. */
export interface PixelDiff {
  /** Share of pixels whose largest RGB channel difference exceeds 8/255. */
  over8: number;
  /** Mean absolute difference over the R, G and B channels (alpha is ignored), 0..255. */
  mean: number;
}

export interface FidelityRow {
  effect: string;
  card: string;
  note: string;
  /** The landing's CSS opacity wrapper classes and their computed value. */
  wrapper: string;
  /** Compared region in CSS px. */
  size: string;
  raw: PixelDiff | null;
  seen: PixelDiff | null;
}

/** One capture setting (theme and device pixel ratio) and its rows. */
export interface FidelityVariant {
  id: string;
  title: string;
  note: string;
  rows: FidelityRow[];
}

const pct = (n: number): string => `${(n * 100).toFixed(2)}%`;
const stat = (label: string, d: PixelDiff | null): string =>
  d === null
    ? `${label}: size mismatch`
    : `${label}: ${pct(d.over8)} of pixels differ by more than 8/255, mean abs diff ${d.mean.toFixed(2)}/255 (RGB)`;

/** A static page: per variant and effect, today's canvas beside the @dagnam/vis frame, raw and with the landing's CSS opacity. */
export function writeReport(
  dir: string,
  variants: FidelityVariant[],
  extras: string[],
): void {
  mkdirSync(dir, { recursive: true });
  const fig = (src: string, cap: string): string =>
    `<figure><img src="${src}" /><figcaption>${cap}</figcaption></figure>`;
  const section = (v: FidelityVariant, r: FidelityRow): string => `
    <section>
      <h3>${r.effect} <small>(${r.card} card, compared region ${r.size} CSS px)</small></h3>
      <p>${r.note}</p>
      <p class="meta">Landing wrapper: <code>${r.wrapper}</code></p>
      <h4>Raw canvas, no CSS opacity</h4>
      <p class="meta">${stat("raw", r.raw)}</p>
      <div class="pair">${fig(`${v.id}/${r.effect}-today.png`, "today (mvp-frontend)")}${fig(`${v.id}/${r.effect}-vis.png`, "@dagnam/vis")}</div>
      <h4>As seen: same CSS opacity over the same card background</h4>
      <p class="meta">${stat("as seen", r.seen)}</p>
      <div class="pair">${fig(`${v.id}/${r.effect}-today-seen.png`, "today (mvp-frontend)")}${fig(`${v.id}/${r.effect}-vis-seen.png`, "@dagnam/vis")}</div>
      <h4>Context: today's whole card</h4>
      <div class="pair">${fig(`${v.id}/${r.effect}-card.png`, "today, full card")}</div>
    </section>`;
  const variant = (v: FidelityVariant): string =>
    `<h2 id="${v.id}">${v.title}</h2><p class="meta">${v.note}</p>${v.rows.map((r) => section(v, r)).join("")}`;
  const extra = (name: string): string => `
    <section><h2>${name} <small>(new, no site equivalent)</small></h2>
      <div class="pair">${fig(`${name}-vis.png`, "@dagnam/vis")}</div></section>`;
  writeFileSync(
    `${dir}/index.html`,
    `<!doctype html><meta charset="utf-8"><title>dag-vis fidelity</title>
<style>body{background:#111;color:#ddd;font:14px ui-monospace,monospace;padding:24px;max-width:1500px}.pair{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0}img{display:block;border:1px solid #333}small,.meta{color:#999}h2{margin-top:40px;border-top:1px solid #333;padding-top:16px}h4{font-size:13px;color:#bbb;margin:16px 0 4px}code{color:#e8a}</style>
<h1>Fidelity: today's landing cards vs @dagnam/vis</h1>
<p>Compared: today's effect canvas, captured when the page clock reads 2 s after that card mounted, against the @dagnam/vis gallery rendered at <code>?t=2&amp;seed=1</code> at the same size. PixelBlast's phase is seeded like the gallery (crypto.getRandomValues stubbed); terminal and glitch use an unmatched Math.random() phase. Dither is aligned with a fitted start lag (see its note).</p>
<p class="meta">Both captures are cropped to whole pixels inside the canvas box (the card border and the page chrome are excluded) and composited over the card's real background. A sign-off aid, not a pass/fail test: the numbers depend on the GPU (software GL here) and, for terminal and glitch, on the unmatched phase. Not covered: other viewport widths, hover and tilt, the glitch colour tween over time.</p>
<p class="meta">${variants.map((v) => `<a href="#${v.id}" style="color:#9cf">${v.id}</a>`).join(" | ")}</p>
${variants.map(variant).join("")}${extras.map(extra).join("")}`,
  );
}
