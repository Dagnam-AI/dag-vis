import { useEffect, useRef, type CSSProperties, type RefObject } from "react";

import {
  createDither,
  createGlitch,
  createPixelBlast,
  createRibbon,
  createTerminal,
  type DitherOptions,
  type EffectHandle,
  type EffectOptions,
  type GlitchOptions,
  type PixelBlastOptions,
  type RibbonEffectOptions,
  type TerminalOptions,
} from "../animate/index.js";

/** Options for one effect, where a key may be present-but-undefined (`{ loop: on ? {...} : undefined }`). */
type Loose<T> = { [K in keyof T]?: T[K] | undefined };

export interface VisEffectOptions {
  dither: DitherOptions;
  pixel: PixelBlastOptions;
  terminal: TerminalOptions;
  glitch: GlitchOptions;
  ribbon: RibbonEffectOptions;
}
export type VisEffect = keyof VisEffectOptions;

export type VisBackgroundProps = {
  [K in VisEffect]: {
    effect: K;
    options?: Loose<VisEffectOptions[K]>;
    className?: string;
    style?: CSSProperties;
  };
}[VisEffect];

type Factory = (
  canvas: HTMLCanvasElement,
  opts?: EffectOptions,
) => EffectHandle;
const FACTORIES: Record<VisEffect, Factory> = {
  dither: createDither,
  pixel: createPixelBlast,
  terminal: createTerminal,
  glitch: createGlitch,
  ribbon: createRibbon,
};

const WRAPPER: CSSProperties = { position: "relative", overflow: "hidden" };

/** The option keys that carry a value: `update()` cannot take one away again (undefined keeps the current value). */
const definedKeys = (options: object): string =>
  Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort()
    .join(",");

/**
 * A background effect filling its wrapper (size the wrapper with `className` /
 * `style`). Every effect instance gets its own `<canvas>`, created in an
 * effect, appended to the wrapper and removed again on cleanup, so StrictMode's
 * mount, unmount, mount and a switch of `effect` never reuse a canvas.
 *
 * - Changing an option VALUE calls `update()` on the live effect (`seed`
 *   re-phases it, `colors` recolours it); equal re-renders do nothing.
 * - Adding or removing an option KEY recreates the effect, because `update()`
 *   cannot clear `loop`, `colors`, `tint` ... once set.
 * - Under `prefers-reduced-motion: reduce` the effect draws one static frame
 *   and never animates; skip mounting the component to draw nothing at all.
 * - Invalid options throw a `VisError` from the effect that creates or
 *   updates them; put an error boundary above it if options come from users.
 * - Server rendering emits an empty wrapper; all DOM work happens in effects.
 */
export function VisBackground({
  effect,
  options: given,
  className,
  style,
}: VisBackgroundProps) {
  // Values may be explicit `undefined` (ignored by the effects); the cast only drops that from the type.
  const options = (given ?? {}) as EffectOptions;
  // Rendered before any effect runs, so `current` is set whenever an effect reads it.
  const containerRef = useRef<HTMLDivElement>(
    null,
  ) as RefObject<HTMLDivElement>;
  const handleRef = useRef<EffectHandle | null>(null);
  const optionsKey = JSON.stringify(options);
  const shape = definedKeys(options);

  // Declared first: a run that also recreates the effect finds `handleRef`
  // already cleared by the cleanup below, so only a pure value change updates.
  useEffect(() => {
    handleRef.current?.update(options);
  }, [optionsKey]);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.display = "block";
    containerRef.current.append(canvas);
    const handle = FACTORIES[effect](canvas, options);
    handleRef.current = handle;
    handle.start();
    return () => {
      handleRef.current = null;
      handle.destroy();
      canvas.remove();
    };
  }, [effect, shape]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ ...WRAPPER, ...style }}
    />
  );
}
