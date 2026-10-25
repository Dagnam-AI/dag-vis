import { useLayoutEffect, useRef, type RefObject } from "react";

import type { EffectHandle } from "@dagnam/vis/animate";

export interface EffectCanvasProps {
  /**
   * Builds the effect on the canvas it is given. Memoise it (`useCallback`): a
   * new identity destroys the handle and builds a fresh one, which is also how
   * a different effect or spec is applied (a field throws on a changed spec,
   * so it is recreated, never updated). Pass `maxDpr: 16` so Remotion's
   * `--scale` reaches the canvas, and `loop: { duration }` from the timing file.
   */
  create: (canvas: HTMLCanvasElement) => EffectHandle;
  /** Seconds: `frame / fps`. */
  t: number;
  width: number;
  height: number;
}

/**
 * Remotion renders frame N from a frame number; the library renders from
 * seconds. This is the whole bridge: a sized box (the runtime reads the
 * canvas parent's rect), one handle per `create`, and `renderAt(t)` drawn in
 * a layout effect (the GL context keeps no drawing buffer, so a JavaScript
 * readback must happen in the same task as the draw; Remotion captures the
 * frame in a later task). `start()` is never called: no requestAnimationFrame,
 * no clock. The first `renderAt` installs a resize observer on the box, which
 * only repaints the last frame when the box changes size, so a frame is still
 * a pure function of `t`.
 *
 * Setup is synchronous (the context and shaders are built inside `create` and
 * the first `renderAt`), so there is nothing to hold the render for.
 */
export function EffectCanvas({ create, t, width, height }: EffectCanvasProps) {
  // Rendered before any effect runs, so `current` is set whenever an effect reads it.
  const box = useRef<HTMLDivElement>(null) as RefObject<HTMLDivElement>;
  // Empty until the create effect runs; it runs before the paint effect below, the only reader.
  const handle = useRef<EffectHandle>(null as never);

  useLayoutEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    box.current.append(canvas);
    const created = create(canvas);
    handle.current = created;
    return () => {
      created.destroy();
      canvas.remove();
    };
  }, [create]);

  // `create` is a dependency so a rebuilt handle is painted at once, not on the next frame.
  useLayoutEffect(() => {
    handle.current.renderAt(t);
  }, [create, t, width, height]);

  return (
    <div
      ref={box}
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        overflow: "hidden",
      }}
    />
  );
}
