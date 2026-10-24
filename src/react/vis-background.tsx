import { useEffect, useRef, type CSSProperties, type RefObject } from "react";

import { VisError } from "../core/index.js";
import {
  createDither,
  createField,
  createGlitch,
  createPixelBlast,
  createRibbon,
  createTerminal,
  type DitherOptions,
  type EffectHandle,
  type EffectOptions,
  type FieldOptions,
  type GlitchOptions,
  type PixelBlastOptions,
  type RibbonEffectOptions,
  type TerminalOptions,
} from "../animate/index.js";
import type { FieldSpec } from "../field/index.js";

/** Options for one effect, where a key may be present-but-undefined (`{ loop: on ? {...} : undefined }`). */
type Loose<T> = { [K in keyof T]?: T[K] | undefined };

export interface VisEffectOptions {
  dither: DitherOptions;
  pixel: PixelBlastOptions;
  terminal: TerminalOptions;
  glitch: GlitchOptions;
  ribbon: RibbonEffectOptions;
  /** A field's seed and colours live in its `spec`; there is no `seed` or `colors` option. */
  field: FieldOptions & { spec: FieldSpec };
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
  [K in VisEffect]: BackgroundBase & { effect: K } & (K extends "field"
      ? { options: Loose<FieldOptions> & { spec: FieldSpec } }
      : { options?: Loose<VisEffectOptions[K]> });
}[VisEffect];

type Factory = (
  canvas: HTMLCanvasElement,
  opts?: EffectOptions,
) => EffectHandle;
/** The five effects that take the shared options; `field` is created from its spec in `mount()`. */
const FACTORIES: Record<Exclude<VisEffect, "field">, Factory> = {
  dither: createDither,
  pixel: createPixelBlast,
  terminal: createTerminal,
  glitch: createGlitch,
  ribbon: createRibbon,
};

interface Live {
  handle: EffectHandle;
  canvas: HTMLCanvasElement;
  /** The options key last applied to the handle. */
  key: string;
}

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
 * - `effect="field"` takes `options.spec` (a `FieldSpec`, required): its seed and
 *   colours belong to the spec, so the shared `seed` and `colors` options do not
 *   exist for it. A field's spec is fixed for the life of a handle, so a CHANGED
 *   spec (by value) recreates the effect: the canvas is replaced and one frame of
 *   flash is possible. An equal spec in a fresh object does nothing, and the
 *   other options still go through `update()`.
 * - Changing an option VALUE calls `update()` on the live effect (`seed`
 *   re-phases it, `colors` recolours it); equal re-renders do nothing.
 * - Adding or removing an option KEY recreates the effect, because `update()`
 *   cannot clear `loop`, `colors`, `tint` ... once set.
 * - Under `prefers-reduced-motion: reduce` the effect draws one static frame
 *   and never animates; skip mounting the component to draw nothing at all.
 * - Failures are contained, not thrown: invalid options (or no WebGL2) when
 *   the effect is CREATED leave no canvas and call `onError` once (a later
 *   change of the options retries); an invalid UPDATE keeps the canvas and the
 *   last valid options and calls `onError` once. An `onError` callback that
 *   itself throws is not contained.
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
  if (effect !== "field" && !Object.hasOwn(FACTORIES, effect))
    throw new VisError(
      `effect must be one of ${[...Object.keys(FACTORIES), "field"].join(", ")}, got ${JSON.stringify(effect)}`,
    );
  // Values may be explicit `undefined` (ignored by the effects); the cast only drops that from the type.
  // `spec` is typed as present for every effect: only `field` reads it, and a missing one
  // (an untyped caller) reaches createField as undefined, which throws a VisError naming it.
  const options = (given ?? {}) as EffectOptions & { spec: FieldSpec };
  // Rendered before any effect runs, so `current` is set whenever an effect reads it.
  const containerRef = useRef<HTMLDivElement>(
    null,
  ) as RefObject<HTMLDivElement>;
  const liveRef = useRef<Live | null>(null);
  // The options key of the last failed creation; a different key retries.
  const failedRef = useRef<string | null>(null);
  const onErrorRef = useRef(onError);
  const optionsKey = JSON.stringify(options);
  const shape = definedKeys(options);
  // A field's spec cannot change on a live handle, so its identity is part of the mount key.
  const specKey = effect === "field" ? JSON.stringify(options.spec) : "";
  const report = (error: unknown): void => {
    (onErrorRef.current ?? console.error)(error);
  };

  const mount = (): void => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.display = "block";
    canvas.style.pointerEvents = "none";
    containerRef.current.append(canvas);
    let handle: EffectHandle | undefined;
    try {
      handle =
        effect === "field"
          ? createField(canvas, options.spec, options)
          : FACTORIES[effect](canvas, options);
      handle.start();
    } catch (error) {
      handle?.destroy();
      canvas.remove();
      failedRef.current = optionsKey;
      report(error);
      return;
    }
    failedRef.current = null;
    liveRef.current = { handle, canvas, key: optionsKey };
  };
  const unmount = (): void => {
    const live = liveRef.current;
    liveRef.current = null;
    live?.handle.destroy();
    live?.canvas.remove();
  };

  // The effects run in this order within one commit, so they see the latest callback.
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    mount();
    return unmount;
  }, [effect, shape, specKey]);

  // Runs on mount too, where `live.key` already equals `optionsKey` and there is nothing to do.
  useEffect(() => {
    const live = liveRef.current;
    if (!live) {
      // The effect failed to create. This commit's own creation attempt (if any) has just
      // recorded its key, so only options that changed since the failure retry.
      if (failedRef.current !== optionsKey) mount();
    } else if (live.key !== optionsKey) {
      live.key = optionsKey;
      try {
        live.handle.update(options);
      } catch (error) {
        report(error); // the runtime validates first, so the live effect keeps its options
      }
    }
  }, [optionsKey]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ ...WRAPPER, ...style }}
    />
  );
}
