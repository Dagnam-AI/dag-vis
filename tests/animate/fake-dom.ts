import { vi } from "vitest";

/**
 * Deterministic stand-ins for the browser APIs the runtime touches. jsdom has
 * none of ResizeObserver / IntersectionObserver / matchMedia and its rAF is
 * wall-clock driven, so each is replaced by a hand-cranked version:
 * `frame(dt)` advances `performance.now()` and runs the queued rAF callbacks.
 */
type RoCb = (
  entries: { contentRect: { width: number; height: number } }[],
) => void;
type IoCb = (entries: { isIntersecting: boolean }[]) => void;

export interface FakeDom {
  resize(width: number, height: number): void;
  intersect(visible: boolean): void;
  hidden(v: boolean): void;
  frame(dtMs?: number): void;
  pending(): number;
  now(): number;
  resizeObservers: number;
  intersectionObservers: number;
  restore(): void;
}

export function installFakeDom(
  opts: { reducedMotion?: boolean; dpr?: number; observers?: boolean } = {},
): FakeDom {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = {
    ResizeObserver: g.ResizeObserver,
    IntersectionObserver: g.IntersectionObserver,
    matchMedia: g.matchMedia,
    requestAnimationFrame: g.requestAnimationFrame,
    cancelAnimationFrame: g.cancelAnimationFrame,
    dpr: window.devicePixelRatio,
    hidden: Object.getOwnPropertyDescriptor(Document.prototype, "hidden"),
  };
  const roCbs = new Set<RoCb>();
  const ioCbs = new Set<IoCb>();
  let now = 0;
  let nextId = 1;
  const queue = new Map<number, FrameRequestCallback>();
  let hidden = false;
  const dom: FakeDom = {
    resizeObservers: 0,
    intersectionObservers: 0,
    resize(width, height) {
      for (const cb of roCbs) cb([{ contentRect: { width, height } }]);
    },
    intersect(visible) {
      for (const cb of ioCbs) cb([{ isIntersecting: visible }]);
    },
    hidden(v) {
      hidden = v;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    frame(dtMs = 16) {
      now += dtMs;
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) cb(now);
    },
    pending: () => queue.size,
    now: () => now,
    restore() {
      Object.assign(g, {
        ResizeObserver: saved.ResizeObserver,
        IntersectionObserver: saved.IntersectionObserver,
        matchMedia: saved.matchMedia,
        requestAnimationFrame: saved.requestAnimationFrame,
        cancelAnimationFrame: saved.cancelAnimationFrame,
      });
      Object.defineProperty(window, "devicePixelRatio", {
        value: saved.dpr,
        configurable: true,
      });
      if (saved.hidden)
        Object.defineProperty(Document.prototype, "hidden", saved.hidden);
      nowSpy.mockRestore();
    },
  };
  if (opts.observers !== false) {
    g.ResizeObserver = class {
      constructor(private readonly cb: RoCb) {
        dom.resizeObservers += 1;
      }
      observe(): void {
        roCbs.add(this.cb);
      }
      disconnect(): void {
        roCbs.delete(this.cb);
      }
    };
    g.IntersectionObserver = class {
      constructor(private readonly cb: IoCb) {
        dom.intersectionObservers += 1;
      }
      observe(): void {
        ioCbs.add(this.cb);
      }
      disconnect(): void {
        ioCbs.delete(this.cb);
      }
    };
  } else {
    delete g.ResizeObserver;
    delete g.IntersectionObserver;
  }
  g.matchMedia = (q: string) => ({
    matches: q.includes("reduced-motion") && opts.reducedMotion === true,
    media: q,
  });
  g.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  };
  g.cancelAnimationFrame = (id: number) => {
    queue.delete(id);
  };
  Object.defineProperty(window, "devicePixelRatio", {
    value: opts.dpr ?? 1,
    configurable: true,
  });
  Object.defineProperty(Document.prototype, "hidden", {
    get: () => hidden,
    configurable: true,
  });
  const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
  return dom;
}
