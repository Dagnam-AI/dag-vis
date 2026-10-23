import {
  COMMON_DEFAULTS,
  DITHER_DEFAULTS,
  GLITCH_DEFAULTS,
  PIXEL_BLAST_DEFAULTS,
  RIBBON_DEFAULTS,
  TERMINAL_DEFAULTS,
  createDither,
  createGlitch,
  createPixelBlast,
  createRibbon,
  createTerminal,
  type EffectHandle,
  type EffectOptions,
} from "../src/animate/index.js";
import { CONTROLS, bindControls } from "./controls.js";
import { parseParams, type Params } from "./params.js";

type AnyOptions = EffectOptions & Record<string, unknown>;
type Factory = (canvas: HTMLCanvasElement, opts: AnyOptions) => EffectHandle;

interface Def {
  make: Factory;
  /** What the sliders show for options the landing preset does not set. */
  defaults: Record<string, unknown>;
  landing: Record<string, unknown>;
}

/**
 * `landing` is exactly the props the landing page passes today
 * (mvp-frontend the-pricing-section.tsx), in the new option names. Ribbon is
 * not on the landing page; its preset is the brand red-to-white pair.
 *
 * The landing also wraps each effect in CSS opacity (BG_OPACITY: pixel/dither
 * 40%, terminal 30%, glitch 15-30%). The gallery draws at full opacity, so a
 * fidelity comparison must read the effect canvas, not a composited card.
 */
const EFFECTS: Record<string, Def> = {
  dither: {
    make: createDither,
    defaults: DITHER_DEFAULTS,
    landing: {
      waveSpeed: 0.15,
      waveAmplitude: 0.1,
      colorNum: 4,
      pixelSize: 1,
      color: "#e64040",
    },
  },
  pixel: {
    make: createPixelBlast,
    defaults: PIXEL_BLAST_DEFAULTS,
    landing: {
      color: "#ef4444",
      patternDensity: 2,
      pixelSize: 4,
      edgeFade: 0.4,
    },
  },
  terminal: {
    make: createTerminal,
    defaults: TERMINAL_DEFAULTS,
    landing: { tint: "#ef4444" },
  },
  glitch: {
    make: createGlitch,
    defaults: GLITCH_DEFAULTS,
    landing: {
      colors: ["#3a1212", "#7a1f1f", "#ef4444"],
      glitchSpeed: 50,
      smooth: true,
      vignette: "none",
    },
  },
  ribbon: {
    make: createRibbon,
    defaults: RIBBON_DEFAULTS,
    landing: { colors: ["#ef4444", "#ffffff"] },
  },
};

const gallery = document.querySelector<HTMLElement>("#gallery");
if (!gallery) throw new Error("#gallery mount point is missing");

const params = parseParams(location.search, Object.keys(EFFECTS));
const handles: Record<string, EffectHandle> = {};

if (params.ok) buildCards(params, gallery);
else showError(params.error, gallery);

function buildCards(
  { seed, t: frozen, effect: only, w: width, h: height }: Params & { ok: true },
  into: HTMLElement,
): void {
  for (const [name, def] of Object.entries(EFFECTS)) {
    if (only !== null && only !== name) continue;
    const card = document.createElement("section");
    card.className = "card";
    card.dataset.effect = name;
    const stage = document.createElement("div");
    stage.className = "stage";
    stage.style.width = `${String(width)}px`;
    stage.style.height = `${String(height)}px`;
    const canvas = document.createElement("canvas");
    stage.appendChild(canvas);
    const title = document.createElement("h2");
    title.textContent = name;
    const form = document.createElement("div");
    form.className = "controls";
    card.append(stage, title, form);
    into.appendChild(card);

    const opts: AnyOptions = { seed, ...def.landing };
    const handle = def.make(canvas, opts);
    handles[name] = handle;
    if (frozen === null) handle.start();
    else handle.renderAt(frozen);
    bindControls(
      form,
      CONTROLS[name] ?? [],
      { ...COMMON_DEFAULTS, ...def.defaults, ...opts },
      (patch) => {
        handle.update(patch);
        if (frozen !== null) handle.renderAt(frozen);
      },
    );
  }
}

/** A bad URL builds no cards: one visible message, and a `__vis` whose calls throw it. */
function showError(error: string, into: HTMLElement): void {
  const p = document.createElement("p");
  p.className = "error";
  p.setAttribute("role", "alert");
  p.textContent = error;
  into.appendChild(p);
  const fail = (): never => {
    throw new Error(error);
  };
  window.__vis = { error, handles, sample: fail, snapshot: fail };
}

/** Copy the effect's canvas into a 2D canvas in the SAME task (the WebGL buffer is intact until compositing). */
function copy(name: string, t: number): CanvasRenderingContext2D {
  const h = handles[name];
  if (!h) throw new Error(`no effect named ${name} on this page`);
  h.renderAt(t);
  const c = document.createElement("canvas");
  c.width = h.canvas.width;
  c.height = h.canvas.height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(h.canvas, 0, 0);
  return ctx;
}

if (params.ok)
  window.__vis = {
    handles,
    /** Fraction of pixels with alpha > 0 after renderAt(t). */
    sample(name, t) {
      const ctx = copy(name, t);
      const d = ctx.getImageData(
        0,
        0,
        ctx.canvas.width,
        ctx.canvas.height,
      ).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > 0) n += 1;
      return n / (d.length / 4);
    },
    /** PNG data URL of the frame at t (determinism checks). */
    snapshot(name, t) {
      return copy(name, t).canvas.toDataURL();
    },
  };
