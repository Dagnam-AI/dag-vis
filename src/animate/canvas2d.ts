import { VisError } from "../core/index.js";
import type { FrameRenderer } from "./runtime.js";

export type Draw2d = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  t: number,
) => void;

/**
 * Canvas2D counterpart of `glRenderer`: `draw` receives the CSS-px size and the
 * dpr (the backing store is `size × dpr`). `dispose` only drops the context, so
 * the same canvas can be initialised again.
 */
export function canvas2dRenderer(draw: Draw2d): FrameRenderer {
  let ctx: CanvasRenderingContext2D | undefined;
  let dpr = 1;
  return {
    init(canvas) {
      const c = canvas.getContext("2d");
      if (!c)
        throw new VisError(
          "Canvas 2D is not available on this canvas (it may already hold a WebGL context)",
        );
      ctx = c;
    },
    resize(d) {
      dpr = d;
    },
    draw(t) {
      if (ctx)
        draw(ctx, ctx.canvas.width / dpr, ctx.canvas.height / dpr, dpr, t);
    },
    dispose() {
      ctx = undefined;
    },
  };
}
