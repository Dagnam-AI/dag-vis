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
  /** Set when the live field could not start: the card keeps its error and is not retried. */
  failed: boolean;
  /** Whether the card's field runs a loop (false for a still frame: frozen time or reduced motion). */
  animate: boolean;
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
    if (!c.failed) setState(c, "idle");
  }

  function start(c: Card): void {
    if (c.handle || c.failed) return;
    const canvas = el("canvas");
    // Decorative: the card's heading is its text alternative.
    canvas.setAttribute("aria-hidden", "true");
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
      // An export in progress holds the loops back: this card shows its first frame until it ends.
      if (still || exporting) handle.renderAt(p.t ?? 0);
      else handle.start();
      c.animate = !still;
      c.canvas = canvas;
      c.handle = handle;
      live.set(c.name, handle);
      counts.peak = Math.max(counts.peak, live.size);
      setState(c, still ? "still" : "live");
    } catch (e) {
      release(canvas, handle);
      c.failed = true;
      setState(c, "error");
      say(c, e instanceof Error ? e.message : String(e), true);
    }
  }

  /** Runs or holds every loop. A held card keeps showing its last frame. */
  function setLoops(on: boolean): void {
    for (const c of cards)
      if (c.handle && c.animate) {
        if (on) c.handle.start();
        else c.handle.stop();
      }
  }

  /** Pixels of the card inside the viewport, from a fresh measurement. */
  function shown(c: Card): number {
    const r = c.root.getBoundingClientRect();
    const w =
      Math.min(r.right, document.documentElement.clientWidth) -
      Math.max(r.left, 0);
    const h =
      Math.min(r.bottom, document.documentElement.clientHeight) -
      Math.max(r.top, 0);
    return Math.max(0, w) * Math.max(0, h);
  }
  /** Squared distance from the card's centre to the viewport's. */
  function offCentre(c: Card): number {
    const r = c.root.getBoundingClientRect();
    const dx =
      (r.left + r.right) / 2 - document.documentElement.clientWidth / 2;
    const dy =
      (r.top + r.bottom) / 2 - document.documentElement.clientHeight / 2;
    return dx * dx + dy * dy;
  }

  /** Cards waiting for a field, most visible first. One is started per task. */
  let queue: Card[] = [];
  let pump = 0;
  /**
   * Keeps the MAX_LIVE cards with the most pixels on screen (a sliver of a row loses to a full
   * one; ties go to the card nearest the middle), freeing what dropped out at once so the live
   * count never passes the cap. Everything is measured now, not taken from observer ratios,
   * which only change when a threshold is crossed.
   */
  function reconcile(): void {
    const area = new Map(cards.map((c) => [c, shown(c)]));
    const ranked = cards
      .filter((c) => (area.get(c) ?? 0) > 0)
      .sort(
        (a, b) =>
          (area.get(b) ?? 0) - (area.get(a) ?? 0) ||
          offCentre(a) - offCentre(b),
      )
      .slice(0, MAX_LIVE);
    for (const c of cards) if (!ranked.includes(c)) stop(c);
    queue = ranked.filter((c) => !c.handle && !c.failed);
    if (pump === 0 && queue.length > 0) pump = window.setTimeout(startNext);
  }
  /**
   * Compiling a field's shader costs hundreds of milliseconds on a software GL, so cards start one
   * per task: the page keeps answering, the card that matters most comes first, and a card that
   * stops being wanted while it waits is never built.
   */
  function startNext(): void {
    pump = 0;
    const c = queue.shift();
    if (c) start(c);
    if (queue.length > 0) pump = window.setTimeout(startNext);
  }
  let frame = 0;
  /** Scrolling, resizing and layout changes all land here, at most once per frame. */
  function schedule(): void {
    if (frame === 0)
      frame = requestAnimationFrame(() => {
        frame = 0;
        reconcile();
      });
  }
  const io = new IntersectionObserver(schedule);
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);

  async function runExport(
    c: Card,
    format: BrowserFormat,
    ext: string,
  ): Promise<void> {
    exporting = true;
    // The export renders on the main thread and the GL the live cards use: hold their loops until it ends.
    setLoops(false);
    // aria-disabled, not disabled: the button that was pressed keeps keyboard focus.
    for (const b of buttons) b.setAttribute("aria-disabled", "true");
    c.root.setAttribute("aria-busy", "true");
    if (c.url !== null) URL.revokeObjectURL(c.url);
    c.url = null;
    say(c, `Encoding ${format}...`);
    // A detached host of exactly the export size, so the canvas has that size whatever the card shows.
    const host = el("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = `position:fixed;top:0;left:-100000px;width:${String(p.w)}px;height:${String(p.h)}px;pointer-events:none`;
    let canvas: HTMLCanvasElement | null = null;
    let handle: Handle | null = null;
    const notes: string[] = [];
    try {
      canvas = el("canvas");
      host.append(canvas);
      document.body.append(host);
      open.add(canvas);
      counts.created += 1;
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
      // Nested, so a throwing release still unlocks the page.
      try {
        if (canvas) release(canvas, handle);
      } finally {
        host.remove();
        c.root.removeAttribute("aria-busy");
        exporting = false;
        setLoops(true);
        for (const b of buttons) b.removeAttribute("aria-disabled");
      }
    }
  }

  for (const [name, spec] of Object.entries(fieldPresets)) {
    const root = el("section", "card");
    root.dataset.preset = name;
    root.dataset.state = "idle";
    const title = el("h2", undefined, name);
    title.id = `preset-${name}`;
    title.append(el("span", "kind", spec.kind));
    const stage = el("div", "stage");
    const actions = el("div", "actions");
    // The buttons repeat across cards: the preset's heading names each group.
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-labelledby", title.id);
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
      failed: false,
      animate: false,
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
