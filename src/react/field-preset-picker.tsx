import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react";

import type { Size } from "../core/index.js";
import { bounded, integerIn, parseSize } from "../core/validate.js";
import {
  MAX_T,
  fieldPresetCatalog,
  fieldPresetNames,
  fieldPresets,
  parseFieldPreset,
  renderField,
  type FieldPresetName,
} from "../field/index.js";

export interface FieldPresetPickerProps {
  /** The chosen preset (`null` or omitted: none; the first radio is then the tab stop). Must be a preset name. */
  value?: FieldPresetName | null | undefined;
  /** Called with the preset the user picked: a click, or an arrow key, Home or End (which also move focus). */
  onChange: (name: FieldPresetName) => void;
  /** Thumbnail size in whole pixels, each side 1..512. Default 160 x 90. */
  thumbSize?: Size | undefined;
  /** Second of the animation the thumbnails show, within ±1000000. Default 0. */
  t?: number | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  /** The group's accessible name. Default "Field preset". */
  "aria-label"?: string | undefined;
}

const DEFAULT_THUMB: Size = { width: 160, height: 90 };
/** Largest thumbnail side: the 128 cached frames of 512 x 512 are then about 128 MB, the most the cache can hold. */
const MAX_THUMB = 512;
/** Thumbnails kept for the next time a picker opens; the oldest goes first. */
const CACHE_LIMIT = 128;
const COUNT = fieldPresetNames.length;

// Module-level, so a picker that opens again is instant. Only ever filled from effects (never while rendering on the server).
const cache = new Map<string, ImageData>();
const keyOf = (name: FieldPresetName, size: Size, t: number): string =>
  `${name}|${size.width}|${size.height}|${t}`;

/** The CPU frame of a preset as an `ImageData`, rendered once per key. */
function thumbnail(name: FieldPresetName, size: Size, t: number): ImageData {
  const key = keyOf(name, size, t);
  const hit = cache.get(key);
  if (hit) return hit;
  const { data } = renderField(fieldPresets[name], { ...size, t });
  // renderField allocates a plain ArrayBuffer; its type only says ArrayBufferLike.
  const image = new ImageData(
    data as Uint8ClampedArray<ArrayBuffer>,
    size.width,
    size.height,
  );
  if (cache.size >= CACHE_LIMIT)
    for (const oldest of cache.keys()) {
      cache.delete(oldest); // a Map iterates in insertion order
      break;
    }
  cache.set(key, image);
  return image;
}

/** Where a key goes from radio `k` (before wrapping). */
const MOVES: ReadonlyMap<string, (k: number) => number> = new Map([
  ["ArrowRight", (k) => k + 1],
  ["ArrowDown", (k) => k + 1],
  ["ArrowLeft", (k) => k - 1],
  ["ArrowUp", (k) => k - 1],
  ["Home", () => 0],
  ["End", () => COUNT - 1],
]);

/** One preset's canvas. Its CPU frame is drawn in a task of its own (cancelled with the effect), or at once from the cache. */
function Thumb({
  name,
  size,
  t,
}: {
  name: FieldPresetName;
  size: Size;
  t: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null) as RefObject<HTMLCanvasElement>;
  useEffect(() => {
    const draw = (): void => {
      // No 2d context (the canvas was given another kind): leave it blank.
      ref.current
        .getContext("2d")
        ?.putImageData(thumbnail(name, size, t), 0, 0);
    };
    if (cache.has(keyOf(name, size, t))) {
      draw();
      return;
    }
    const task = setTimeout(draw, 0);
    return () => {
      clearTimeout(task);
    };
  }, [name, size.width, size.height, t]);
  return (
    <canvas
      ref={ref}
      width={size.width}
      height={size.height}
      aria-hidden="true"
    />
  );
}

/**
 * A browsable list of every field preset, each name under its thumbnail, as a controlled
 * `radiogroup`: `value` is the chosen preset and `onChange` hears the one picked. Style it
 * with `className` and `[aria-checked="true"]`; the layout is only a minimal grid and the
 * focus ring is the browser's.
 *
 * Keyboard: one tab stop (the checked radio, or the first when none is). The arrow keys
 * move focus and selection together and wrap around, Home and End jump to the ends, and
 * Space and Enter select as on any button.
 *
 * Thumbnails are the CPU `renderField` frame of each preset (no WebGL, so no GL contexts),
 * drawn after mount one per task so the page stays responsive, cancelled on unmount and
 * when `thumbSize` or `t` change, and cached by name, size and `t` (the newest 128), so a
 * picker that opens again is instant. Server rendering emits the list with empty canvases;
 * all DOM work is in effects.
 *
 * A bad `thumbSize`, `t` or `value` is a programmer error and throws a `VisError` while
 * rendering, as `<VisBackground>` does for an unknown effect.
 */
export function FieldPresetPicker({
  value,
  onChange,
  thumbSize = DEFAULT_THUMB,
  t = 0,
  className,
  style,
  "aria-label": label = "Field preset",
}: FieldPresetPickerProps) {
  const { width, height } = parseSize("thumbSize", thumbSize);
  const size: Size = {
    width: integerIn("thumbSize.width", width, 1, MAX_THUMB),
    height: integerIn("thumbSize.height", height, 1, MAX_THUMB),
  };
  bounded("t", t, -MAX_T, MAX_T);
  const checked =
    value == null ? -1 : fieldPresetNames.indexOf(parseFieldPreset(value));
  const tabStop = Math.max(checked, 0);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const move = MOVES.get(event.key);
    if (!move) return;
    event.preventDefault(); // the arrow keys and Home and End would scroll the page
    const radios = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
    const to =
      (move(radios.indexOf(event.target as HTMLButtonElement)) + COUNT) % COUNT;
    radios.forEach((radio, i) => {
      if (i === to) radio.focus();
    });
    fieldPresetNames.forEach((name, i) => {
      if (i === to) onChange(name);
    });
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={className}
      onKeyDown={onKeyDown}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${size.width}px, 1fr))`,
        gap: 12,
        ...style,
      }}
    >
      {fieldPresetCatalog.map(({ name, label: text }, i) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={i === checked}
          tabIndex={i === tabStop ? 0 : -1}
          onClick={() => {
            onChange(name);
          }}
        >
          <Thumb name={name} size={size} t={t} />
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}
