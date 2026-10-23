import { useEffect, useRef, type CSSProperties, type RefObject } from "react";

import { VisError } from "../core/index.js";
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

interface BackgroundBase {
  className?: string;
  style?: CSSProperties;
  /**
   * Called with the error when the effect cannot be created, started or
   * updated (no WebGL2, invalid options). The component then renders an empty
   * wrapper; without this prop the error goes to `console.error`.
   */
  onError?: (error: unknown) => void;
}

export type VisBackgroundProps = {
  [K in VisEffect]: BackgroundBase & {
    effect: K;
    options?: Loose<VisEffectOptions[K]>;
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

const WRAPPER: CSSProperties = { overflow: "hidden" };

/** The option keys that carry a value: `update()` cannot take one away again (undefined keeps the current value). */
const definedKeys = (options: object): string =>
  Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort()
    .join(",");

/**
 * A background effect filling its wrapper. Layout is yours: the wrapper only
 * sets `overflow: hidden`, so `className="absolute inset-0"` (or a sized
 * block) governs it. An unsized in-flow wrapper takes the canvas's 150 px
 * default height. Every effect instance gets its own `<canvas>`
 * (`aria-hidden`, `pointer-events: none`), created in an effect, appended to
 * the wrapper and removed on cleanup, so StrictMode's mount, unmount, mount
 * and a switch of `effect` never reuse a canvas.
 *
 * - Changing an option VALUE calls `update()` on the live effect (`seed`
 *   re-phases it, `colors` recolours it); equal re-renders do nothing.
 * - Adding or removing an option KEY recreates the effect, because `update()`
 *   cannot clear `loop`, `colors`, `tint` ... once set.
 * - Under `prefers-reduced-motion: reduce` the effect draws one static frame
 *   and never animates; skip mounting the component to draw nothing at all.
 * - A runtime failure (no WebGL2, invalid options) never escapes the effect:
 *   the canvas is removed, the wrapper stays empty and `onError` is called.
 * - An unknown `effect` name is a programmer error and throws a `VisError`
 *   while rendering (also on the server), like a bad prop type would.
 * - Server rendering emits an empty wrapper; all DOM work happens in effects.
 */
export function VisBackground({
  effect,
  options: given,
  className,
  style,
  onError,
}: VisBackgroundProps) {
  if (!Object.hasOwn(FACTORIES, effect))
    throw new VisError(
      `effect must be one of ${Object.keys(FACTORIES).join(", ")}, got ${JSON.stringify(effect)}`,
    );
  // Values may be explicit `undefined` (ignored by the effects); the cast only drops that from the type.
  const options = (given ?? {}) as EffectOptions;
  // Rendered before any effect runs, so `current` is set whenever an effect reads it.
  const containerRef = useRef<HTMLDivElement>(
    null,
  ) as RefObject<HTMLDivElement>;
  const handleRef = useRef<EffectHandle | null>(null);
  const onErrorRef = useRef(onError);
  const optionsKey = JSON.stringify(options);
  const shape = definedKeys(options);
  const report = (error: unknown): void => {
    (onErrorRef.current ?? console.error)(error);
  };

  // The effects below run in this order within one commit, so they see the latest callback.
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // A run that also recreates the effect finds `handleRef` cleared by the cleanup below.
  useEffect(() => {
    try {
      handleRef.current?.update(options);
    } catch (error) {
      report(error); // the runtime validates first, so the live effect keeps its options
    }
  }, [optionsKey]);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.display = "block";
    canvas.style.pointerEvents = "none";
    containerRef.current.append(canvas);
    let handle: EffectHandle | undefined;
    try {
      handle = FACTORIES[effect](canvas, options);
      handle.start();
    } catch (error) {
      handle?.destroy();
      canvas.remove();
      report(error);
      return;
    }
    handleRef.current = handle;
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
