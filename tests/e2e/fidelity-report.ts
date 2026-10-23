import { mkdirSync, writeFileSync } from "node:fs";

/** Per-pair pixel difference; `null` when the two images differ in size. */
export interface PixelDiff {
  /** Share of pixels whose largest RGB channel difference exceeds 8/255. */
  over8: number;
  /** Mean absolute difference over the R, G and B channels (alpha is ignored), 0..255. */
  mean: number;
}

/** The per-run fit of the landing Dither's start lag (frames of 16 ms of page time). */
export interface LagFit {
  chosen: number;
  /** The lag an earlier version hard-coded, shown for comparison. */
  oldFixed: number;
  /** True when FIDELITY_DITHER_LAG_FRAMES skipped the fit. */
  override: boolean;
  figures: { lag: number; diff: PixelDiff | null }[];
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
  /** Only the dither row. */
  fit?: LagFit;
}

/** One capture setting (theme and device pixel ratio) and its rows. */
export interface FidelityVariant {
  id: string;
  title: string;
  note: string;
  dpr: number;
  /** Machine load (1 min average) when this pass finished. */
  load: number;
  /** Shown prominently when the dither alignment looks unreliable; never a failure. */
  banner?: string;
  rows: FidelityRow[];
}

export interface RunStamp {
  node: string;
  chromium: string;
  loadAtStart: number;
  loadAtEnd: number;
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
  stamp: RunStamp,
): void {
  mkdirSync(dir, { recursive: true });
  const fig = (src: string, cap: string): string =>
    `<figure><img src="${src}" /><figcaption>${cap}</figcaption></figure>`;
  const fitBlock = (v: FidelityVariant, f: LagFit): string => {
    const at = (lag: number): string => {
      const d = f.figures.find((x) => x.lag === lag)?.diff;
      return d ? pct(d.over8) : "not captured";
    };
    const best = at(f.chosen);
    const rows = f.figures
      .map(
        (x) =>
          `<tr${x.lag === f.chosen ? ' class="best"' : ""}><td>${String(x.lag)}</td><td>${String(x.lag * 16)} ms</td><td>${x.diff ? `${pct(x.diff.over8)}, mean ${x.diff.mean.toFixed(2)}` : "size mismatch"}</td></tr>`,
      )
      .join("");
    return `<div class="fit"><p>Dither start-lag fit${f.override ? " (SKIPPED: FIDELITY_DITHER_LAG_FRAMES override, no fit)" : ""}: chosen lag <b>${String(f.chosen)}</b> frames (${String(f.chosen * 16)} ms); figure at the chosen lag <b>${best}</b>; at lag 0 ${at(0)}; at the old fixed lag ${String(f.oldFixed)} ${at(f.oldFixed)}.</p>
      <table><tr><th>lag (frames)</th><th>page time</th><th>raw difference vs the gallery frame (over 8/255)</th></tr>${rows}</table>
      ${v.dpr === 2 ? `<p class="warn">At dpr 2 the lag fit and the resolution difference cannot be separated: today's Dither is forced to dpr 1 on the landing (rendered at 1x and upscaled by the browser) while @dagnam/vis renders at dpr 2. The best-lag figure above, ${best}, is the floor of both together; it does not prove either is aligned.</p>` : ""}</div>`;
  };
  const section = (v: FidelityVariant, r: FidelityRow): string => `
    <section>
      <h3>${r.effect} <small>(${r.card} card, compared region ${r.size} CSS px)</small></h3>
      <p>${r.note}</p>
      ${r.fit ? fitBlock(v, r.fit) : ""}
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
    `<h2 id="${v.id}">${v.title}</h2>${v.banner ? `<p class="banner">${v.banner}</p>` : ""}<p class="meta">${v.note} Machine load (1 min) at the end of this pass: ${v.load.toFixed(1)}.</p>${v.rows.map((r) => section(v, r)).join("")}`;
  const extra = (name: string): string => `
    <section><h2>${name} <small>(new, no site equivalent)</small></h2>
      <div class="pair">${fig(`${name}-vis.png`, "@dagnam/vis")}</div></section>`;
  writeFileSync(
    `${dir}/index.html`,
    `<!doctype html><meta charset="utf-8"><title>dag-vis fidelity</title>
<style>body{background:#111;color:#ddd;font:14px ui-monospace,monospace;padding:24px;max-width:1500px}.pair{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0}img{display:block;border:1px solid #333}small,.meta{color:#999}h2{margin-top:40px;border-top:1px solid #333;padding-top:16px}h4{font-size:13px;color:#bbb;margin:16px 0 4px}code{color:#e8a}.banner{background:#7a1f1f;color:#fff;padding:10px 14px;font-weight:bold}.warn{color:#e8b86b}.fit{border-left:3px solid #444;padding-left:12px}table{border-collapse:collapse}td,th{border:1px solid #333;padding:2px 8px;text-align:left}tr.best{background:#243}</style>
<h1>Fidelity: today's landing cards vs @dagnam/vis</h1>
<p>Compared: today's effect canvas, captured when the page clock reads 2 s after that card mounted, against the @dagnam/vis gallery rendered at <code>?t=2&amp;seed=1</code> at the same size. PixelBlast's phase is seeded like the gallery (crypto.getRandomValues stubbed); terminal and glitch use an unmatched Math.random() phase. Dither is aligned with a fitted start lag (see its note).</p>
<p class="meta">Both captures are the canvas box snapped to whole device pixels by the same rule (the card border and the page chrome are excluded) and composited over the card's real background. A sign-off aid, not a pass/fail test: the numbers depend on the GPU (software GL here) and, for terminal and glitch, on the unmatched phase. Not covered: other viewport widths, hover and tilt, the glitch colour tween over time.</p>
<p class="meta">Run: Node ${stamp.node}, Chromium ${stamp.chromium} (headless, software GL), machine load (1 min) ${stamp.loadAtStart.toFixed(1)} at start and ${stamp.loadAtEnd.toFixed(1)} at the end.</p>
${variants.some((v) => v.banner) ? '<p class="banner">Alignment looks unreliable in at least one pass (see the red banners below). Re-run when the machine is quiet.</p>' : ""}
<p class="meta">${variants.map((v) => `<a href="#${v.id}" style="color:#9cf">${v.id}</a>`).join(" | ")}</p>
${variants.map(variant).join("")}${extras.map(extra).join("")}`,
  );
}
