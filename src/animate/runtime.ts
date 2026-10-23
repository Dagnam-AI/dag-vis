import { VisError, parseColor } from "../core/index.js";

/** Options every effect shares. `speed: 1` is today's motion. */
export interface EffectOptions {
  speed?: number;
  colors?: string[];
  seed?: number;
  fps?: number;
  maxDpr?: number;
  autoPause?: boolean;
  loop?: { duration: number };
}

export interface EffectHandle<O extends EffectOptions = EffectOptions> {
  readonly canvas: HTMLCanvasElement;
  readonly running: boolean;
  readonly duration?: number | undefined;
  start(): void;
  stop(): void;
  update(opts: Patch<O>): void;
  /** Render the frame for virtual time `t` (seconds). Deterministic: reads no clock. */
  renderAt(t: number): void;
  destroy(): void;
}

/** What an effect gives the runtime: resources, resize, one frame, release. */
export interface FrameRenderer {
  init(canvas: HTMLCanvasElement): void;
  resize(dpr: number): void;
  draw(t: number): void;
  dispose(): void;
}

/** A partial whose keys may be present-but-undefined (props spreads); undefined keeps the current value. */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export type ResolvedOptions<O extends EffectOptions> = Required<
  Omit<O, "colors" | "loop">
> &
  Pick<O, "colors" | "loop">;

export const COMMON_DEFAULTS = {
  speed: 1,
  seed: 1,
  fps: 60,
  maxDpr: 2,
  autoPause: true,
} as const;

/** Assign defined keys of `patch` onto `target` (an explicit `undefined` keeps the current value). */
export function merge<T extends object>(target: T, patch: Patch<T>): T {
  const out = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch))
    if (value !== undefined) out[key] = value;
  return target;
}

export function assertFinite(
  name: string,
  v: number,
  min: number,
  inclusive = true,
): void {
  const ok = Number.isFinite(v) && (inclusive ? v >= min : v > min);
  if (!ok)
    throw new VisError(
      `${name} must be a finite number ${inclusive ? ">=" : ">"} ${min}, got ${String(v)}`,
    );
}

export function validateCommon(o: ResolvedOptions<EffectOptions>): void {
  assertFinite("speed", o.speed, 0);
  assertFinite("fps", o.fps, 0, false);
  assertFinite("maxDpr", o.maxDpr, 0, false);
  if (!Number.isInteger(o.seed))
    throw new VisError(`seed must be an integer, got ${String(o.seed)}`);
  if (o.loop) assertFinite("loop.duration", o.loop.duration, 0, false);
  for (const c of o.colors ?? []) parseColor(c);
}

export function loopTime(
  t: number,
  loop: { duration: number } | undefined,
): number {
  if (!loop) return t;
  const d = loop.duration;
  return ((t % d) + d) % d;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function createRuntime<O extends EffectOptions>(
  canvas: HTMLCanvasElement,
  opts: ResolvedOptions<O>,
  validate: (o: ResolvedOptions<O>) => void,
  renderer: FrameRenderer,
): EffectHandle<O> {
  let inited = false;
  let running = false;
  let destroyed = false;
  let staticOnly = false;
  let outOfView = false;
  let hidden = false;
  let scheduled = 0;
  let virtual = 0;
  // The time of the frame last drawn: what a resize or update must repaint.
  let lastT = 0;
  let lastNow = 0;
  let lastDraw = Number.NEGATIVE_INFINITY;
  let ro: ResizeObserver | undefined;
  let io: IntersectionObserver | undefined;

  // The common fields, typed concretely (indexing the generic `opts` leaves them possibly undefined).
  const common = opts as unknown as ResolvedOptions<EffectOptions>;

  const paused = (): boolean => opts.autoPause && (outOfView || hidden);

  function applySize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, common.maxDpr);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    renderer.resize(dpr);
  }

  function ensureInit(): void {
    if (destroyed) throw new VisError("effect handle was destroyed");
    if (inited) return;
    inited = true;
    renderer.init(canvas);
    const parent = canvas.parentElement;
    if (!parent) {
      renderer.resize(1);
      return;
    }
    const rect = parent.getBoundingClientRect();
    applySize(Math.max(1, rect.width), Math.max(1, rect.height));
    if (typeof ResizeObserver === "undefined") return;
    ro = new ResizeObserver((entries) => {
      for (const { contentRect: r } of entries) {
        applySize(Math.max(1, r.width), Math.max(1, r.height));
        // The resize cleared the canvas; a non-looping handle must repaint itself.
        if (staticOnly || !running) renderer.draw(loopTime(lastT, opts.loop));
      }
    });
    ro.observe(parent);
  }

  function renderAt(t: number): void {
    ensureInit();
    lastT = t;
    renderer.draw(loopTime(t, opts.loop));
  }

  function tick(now: number): void {
    scheduled = 0;
    if (!running || paused()) return;
    virtual += ((now - lastNow) / 1000) * common.speed;
    lastNow = now;
    if (now - lastDraw >= 1000 / common.fps - 1) {
      lastDraw = now;
      renderAt(virtual);
    }
    schedule();
  }

  function schedule(): void {
    if (scheduled === 0 && running && !paused())
      scheduled = requestAnimationFrame(tick);
  }

  function resume(): void {
    lastNow = performance.now();
    schedule();
  }

  const onVisibility = (): void => {
    hidden = document.hidden;
    if (!hidden) resume();
  };

  function watch(): void {
    if (!opts.autoPause) return;
    // Read the tab state now: the listener is gone while stopped, so a stale flag would freeze the loop.
    hidden = document.hidden;
    document.addEventListener("visibilitychange", onVisibility);
    if (typeof IntersectionObserver === "undefined") return;
    io = new IntersectionObserver((entries) => {
      for (const entry of entries) outOfView = !entry.isIntersecting;
      if (!outOfView) resume();
    });
    io.observe(canvas);
  }

  function unwatch(): void {
    document.removeEventListener("visibilitychange", onVisibility);
    io?.disconnect();
    io = undefined;
  }

  function start(): void {
    ensureInit();
    if (running) return;
    running = true;
    staticOnly =
      typeof matchMedia === "function" && matchMedia(REDUCED_MOTION).matches;
    if (staticOnly) {
      renderAt(0);
      return;
    }
    lastDraw = Number.NEGATIVE_INFINITY;
    watch();
    resume();
  }

  function stop(): void {
    running = false;
    if (scheduled !== 0) cancelAnimationFrame(scheduled);
    scheduled = 0;
    unwatch();
  }

  function update(patch: Patch<O>): void {
    // Validate a merged copy so a rejected patch leaves the live options untouched.
    const next = merge({ ...opts }, patch as Patch<ResolvedOptions<O>>);
    validate(next);
    Object.assign(opts, next);
    if (staticOnly) renderer.draw(loopTime(lastT, opts.loop));
    // autoPause: false (or any option) may lift a pause nothing else will end.
    else if (running && scheduled === 0) resume();
  }

  function destroy(): void {
    if (destroyed) return;
    stop();
    staticOnly = false;
    ro?.disconnect();
    ro = undefined;
    if (inited) renderer.dispose();
    destroyed = true;
  }

  return {
    canvas,
    get running() {
      return running;
    },
    get duration() {
      return opts.loop?.duration;
    },
    start,
    stop,
    update,
    renderAt,
    destroy,
  };
}
