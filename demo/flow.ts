// DOM-typed names come from the animate entry (@dagnam/vis/animate); the DOM-free presets from the root.
import {
  createField,
  exportCanvas,
  type BrowserFormat,
  type EffectHandle,
  type FieldOptions,
} from "../src/animate/index.js";
import { fieldPresets, type FieldSpec } from "../src/index.js";
import { parseFlowParams, type FlowParams } from "./flow-params.js";

const FORMATS: readonly { format: BrowserFormat; ext: string }[] = [
  { format: "png", ext: "png" },
  { format: "webp", ext: "webp" },
  { format: "gif", ext: "gif" },
  { format: "mp4", ext: "mp4" },
  { format: "webm", ext: "webm" },
];
/** Seconds of the live loop (an export loops over its own `duration`). */
const LIVE_LOOP = 6;
/** Browsers cap live WebGL contexts at about 16 per page; the export needs one more. */
const MAX_LIVE = 12;
const QUALITY = 0.85;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type Handle = EffectHandle<FieldOptions>;
type State = "idle" | "live" | "still" | "error";

interface Card {
  name: string;
  spec: FieldSpec;
  root: HTMLElement;
  stage: HTMLElement;
  result: HTMLElement;
  canvas: HTMLCanvasElement | null;
  handle: Handle | null;
  /** The object URL of this card's last export, revoked by the next one or on page exit. */
  url: string | null;
}

const grid = document.querySelector<HTMLElement>("#grid");
if (!grid) throw new Error("#grid mount point is missing");

const params = parseFlowParams(location.search);
if (params.ok) build(params, grid);
else showError(params.error, grid);

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A bad URL builds no cards: one visible message, and hooks that throw it. */
function showError(error: string, into: HTMLElement): void {
  const p = el("p", "error", error);
  p.setAttribute("role", "alert");
  into.append(p);
  const fail = (): never => {
    throw new Error(error);
  };
  window.__flow = { error, stats: fail, sample: fail };
}

function build(p: FlowParams & { ok: true }, into: HTMLElement): void {
  const cards: Card[] = [];
  const byRoot = new Map<Element, Card>();
  const live = new Map<string, Handle>();
  /** Every canvas not yet released: cards' canvases and a running export's. */
  const open = new Set<HTMLCanvasElement>();
  const counts = { peak: 0, created: 0, released: 0, leaked: 0 };
  let exporting = false;

  const setState = (c: Card, state: State): void => {
    c.root.dataset.state = state;
  };
  const say = (c: Card, text: string, isError = false): void => {
    c.result.className = isError ? "result error" : "result";
    c.result.replaceChildren(text);
  };
  const buttons: HTMLButtonElement[] = [];

  /** Destroy the handle (it frees its GL objects, not the context), then lose the context and drop the canvas. */
  function release(canvas: HTMLCanvasElement, handle: Handle | null): void {
    handle?.destroy();
    const gl = canvas.getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    if (gl && !gl.isContextLost()) counts.leaked += 1;
    canvas.remove();
    open.delete(canvas);
    counts.released += 1;
  }

  function stop(c: Card): void {
    if (c.canvas) release(c.canvas, c.handle);
    live.delete(c.name);
    c.canvas = null;
    c.handle = null;
    setState(c, "idle");
  }

  function start(c: Card): void {
    if (c.handle) return;
    const canvas = el("canvas");
    c.stage.append(canvas);
    open.add(canvas);
    counts.created += 1;
    let handle: Handle | null = null;
    try {
      handle = createField(canvas, c.spec, {
        loop: { duration: LIVE_LOOP },
        maxDpr: 1.5,
      });
      // Reduced motion, or a frozen time: one still frame, no loop.
      const still = p.t !== null || matchMedia(REDUCED_MOTION).matches;
      if (still) handle.renderAt(p.t ?? 0);
      else handle.start();
      c.canvas = canvas;
      c.handle = handle;
      live.set(c.name, handle);
      counts.peak = Math.max(counts.peak, live.size);
      setState(c, still ? "still" : "live");
    } catch (e) {
      release(canvas, handle);
      setState(c, "error");
      say(c, e instanceof Error ? e.message : String(e), true);
    }
  }

  const visible = new Set<Card>();
  /** Frees what left the screen first, so the live count never passes the cap on the way. */
  function reconcile(): void {
    let slots = MAX_LIVE;
    const wanted = new Set<Card>();
    for (const c of cards) if (visible.has(c) && slots-- > 0) wanted.add(c);
    for (const c of cards) if (!wanted.has(c)) stop(c);
    for (const c of wanted) start(c);
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const c = byRoot.get(e.target);
      if (!c) continue;
      if (e.isIntersecting) visible.add(c);
      else visible.delete(c);
    }
    reconcile();
  });

  async function runExport(
    c: Card,
    format: BrowserFormat,
    ext: string,
  ): Promise<void> {
    exporting = true;
    for (const b of buttons) b.disabled = true;
    c.root.setAttribute("aria-busy", "true");
    if (c.url !== null) URL.revokeObjectURL(c.url);
    c.url = null;
    say(c, `Encoding ${format}...`);
    // A detached host of exactly the export size, so the canvas has that size whatever the card shows.
    const host = el("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = `position:fixed;top:0;left:-100000px;width:${String(p.w)}px;height:${String(p.h)}px;pointer-events:none`;
    const canvas = el("canvas");
    host.append(canvas);
    document.body.append(host);
    open.add(canvas);
    counts.created += 1;
    let handle: Handle | null = null;
    const notes: string[] = [];
    try {
      handle = createField(canvas, c.spec, {
        loop: { duration: p.duration },
        maxDpr: 1,
        autoPause: false,
      });
      const started = performance.now();
      const blob = await exportCanvas(handle, {
        format,
        fps: p.fps,
        duration: p.duration,
        width: p.w,
        height: p.h,
        quality: QUALITY,
        warn: (m) => notes.push(m),
      });
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      c.url = URL.createObjectURL(blob);
      const link = el("a", undefined, `Download ${c.name}.${ext}`);
      link.href = c.url;
      link.download = `${c.name}.${ext}`;
      const animated =
        format === "gif" || format === "mp4" || format === "webm";
      c.result.className = "result";
      c.result.replaceChildren(
        `${format} ${String(p.w)}x${String(p.h)}${
          animated ? ` ${String(p.duration)}s at ${String(p.fps)} fps` : ""
        }: ${size(blob.size)} (${blob.size.toLocaleString("en-US")} bytes) in ${secs}s. `,
        link,
        ...notes.map((n) => ` ${n}`),
      );
    } catch (e) {
      say(
        c,
        `${format} export failed: ${e instanceof Error ? e.message : String(e)}`,
        true,
      );
    } finally {
      release(canvas, handle);
      host.remove();
      c.root.removeAttribute("aria-busy");
      exporting = false;
      for (const b of buttons) b.disabled = unsupported(b.dataset.format);
    }
  }

  for (const [name, spec] of Object.entries(fieldPresets)) {
    const root = el("section", "card");
    root.dataset.preset = name;
    root.dataset.state = "idle";
    const title = el("h2", undefined, name);
    title.append(el("span", "kind", spec.kind));
    const stage = el("div", "stage");
    const actions = el("div", "actions");
    const result = el("p", "result");
    result.setAttribute("role", "status");
    const card: Card = {
      name,
      spec,
      root,
      stage,
      result,
      canvas: null,
      handle: null,
      url: null,
    };
    for (const { format, ext } of FORMATS) {
      const b = el("button", undefined, format);
      b.type = "button";
      b.dataset.format = format;
      b.disabled = unsupported(format);
      if (b.disabled)
        b.title = `${format} export needs WebCodecs, which this browser lacks`;
      b.addEventListener("click", () => {
        if (!exporting) void runExport(card, format, ext);
      });
      actions.append(b);
      buttons.push(b);
    }
    root.append(title, stage, actions, result);
    into.append(root);
    cards.push(card);
    byRoot.set(root, card);
    io.observe(root);
  }

  addEventListener("pagehide", () => {
    for (const c of cards) if (c.url !== null) URL.revokeObjectURL(c.url);
  });

  window.__flow = {
    stats: () => ({
      live: live.size,
      peak: counts.peak,
      cap: MAX_LIVE,
      running: [...live.values()].filter((h) => h.running).length,
      created: counts.created,
      released: counts.released,
      open: open.size,
      contexts: [...open].filter((c) => {
        const gl = c.getContext("webgl2");
        return gl !== null && !gl.isContextLost();
      }).length,
      leaked: counts.leaked,
    }),
    // Render and copy into a 2D canvas in the SAME task: the WebGL buffer is cleared after compositing.
    sample(name, t) {
      const handle = live.get(name);
      if (!handle) throw new Error(`no live card named ${name}`);
      handle.renderAt(t);
      const c = el("canvas");
      c.width = handle.canvas.width;
      c.height = handle.canvas.height;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      ctx.drawImage(handle.canvas, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      let lo = 255;
      let hi = 0;
      for (let i = 0; i < d.length; i += 4) {
        const luma =
          0.2126 * (d[i] ?? 0) +
          0.7152 * (d[i + 1] ?? 0) +
          0.0722 * (d[i + 2] ?? 0);
        if (luma > 0) lit += 1;
        lo = Math.min(lo, luma);
        hi = Math.max(hi, luma);
      }
      return { lit: lit / (d.length / 4), spread: hi - lo };
    },
  };
}

/** mp4 and webm are encoded with WebCodecs. */
function unsupported(format: string | undefined): boolean {
  return (
    (format === "mp4" || format === "webm") &&
    typeof VideoEncoder === "undefined"
  );
}

function size(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
