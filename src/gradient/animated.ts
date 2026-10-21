import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { gradient } from "./index.js";
import { assertUnit } from "./radial.js";
import { cssStops, normalizeStops, repeatSpan } from "./stops.js";
import type { GradientSpec } from "./types.js";

export interface AnimatedOptions {
  /** Seconds per cycle. Default 10. */
  duration?: number;
  kind: "rotate" | "shift" | "hue";
  /** CSS selector the rules target. Default ".vis-gradient". */
  selector?: string;
  /** Prefix for the keyframes / custom property names (a CSS identifier). Default "vis". */
  name?: string;
}

/** An identifier a stylesheet can embed anywhere without opening a new rule. */
const IDENT = /^[A-Za-z_][\w-]*$/;
/**
 * A selector is allow-listed, not scrubbed: tag/class/id/attribute (unquoted)/pseudo
 * names, combinators, commas, `*` and plain spaces. Quotes, backslash escapes, `@`,
 * `/`, braces, `;`, `<` and newlines are out, and brackets and parentheses must balance
 * (an unclosed one makes the browser read on into the rest of the stylesheet).
 */
const SELECTOR_CHARS = /^[\w\-.#*>+~,:[\]()=^$| ]+$/;

function balanced(selector: string): boolean {
  const closers: string[] = [];
  for (const ch of selector) {
    if (ch === "[") closers.push("]");
    else if (ch === "(") closers.push(")");
    else if ((ch === "]" || ch === ")") && closers.pop() !== ch) return false;
  }
  return closers.length === 0;
}

function finite(what: string, v: number): number {
  if (!Number.isFinite(v))
    throw new VisError(`${what} must be a finite number, got ${String(v)}`);
  return v;
}

/**
 * `rotate`: the gradient with its angle replaced by `calc(<own angle> + var(--<name>-angle))`.
 * Linear and conic only: the other kinds have no angle to turn.
 */
function rotating(spec: GradientSpec, prop: string): string {
  if (spec.kind !== "conic" && spec.kind !== "linear")
    throw new VisError(
      `rotate needs a conic or linear gradient, got ${spec.kind}`,
    );
  const stops = normalizeStops(spec.stops, spec.reverse);
  // Same rule as the static renderers: zero-width repeating stops have no CSS equivalent.
  if (spec.repeat) repeatSpan(stops);
  const turned = (deg: number): string =>
    deg === 0 ? `var(${prop})` : `calc(${fmt(deg)}deg + var(${prop}))`;
  if (spec.kind === "linear") {
    const fn = spec.repeat ? "repeating-linear-gradient" : "linear-gradient";
    return `${fn}(${turned(finite("linear angle", spec.angle ?? 180))}, ${cssStops(stops)})`;
  }
  const at = spec.at ?? [0.5, 0.5];
  assertUnit("conic `at`", at);
  const fn = spec.repeat ? "repeating-conic-gradient" : "conic-gradient";
  return `${fn}(from ${turned(finite("conic from", spec.from ?? 0))} at ${fmt(at[0] * 100)}% ${fmt(at[1] * 100)}%, ${cssStops(stops)})`;
}

/**
 * CSS-only animation for a gradient, honouring prefers-reduced-motion.
 * `rotate` needs a conic or linear spec (it animates the angle through a
 * registered `@property`); `shift` pans an oversized background; `hue`
 * rotates the hue with a filter, which tints the element's content (text,
 * children) as well as its background.
 */
export function animatedGradientCss(
  spec: GradientSpec,
  opts: AnimatedOptions,
): { css: string; keyframes: string } {
  const duration = opts.duration ?? 10;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new VisError(
      `duration must be positive seconds, got ${String(duration)}`,
    );
  const selector = opts.selector ?? ".vis-gradient";
  if (
    selector.trim() === "" ||
    !SELECTOR_CHARS.test(selector) ||
    !balanced(selector)
  )
    throw new VisError(
      `selector must be a plain CSS selector (letters, digits, _ - . # * > + ~ , : = ^ $ |, spaces, balanced [] and (); no quotes, escapes or @), got ${JSON.stringify(selector)}`,
    );
  const name = opts.name ?? "vis";
  if (!IDENT.test(name))
    throw new VisError(
      `name must be a CSS identifier (letters, digits, - and _, not starting with a digit), got ${JSON.stringify(name)}`,
    );
  const reduced = `@media (prefers-reduced-motion: reduce) { ${selector} { animation: none; } }`;
  const seconds = fmt(duration);
  switch (opts.kind) {
    case "rotate": {
      const prop = `--${name}-angle`;
      return {
        keyframes: `@property ${prop} { syntax: "<angle>"; inherits: false; initial-value: 0deg; }\n@keyframes ${name}-rotate { from { ${prop}: 0deg; } to { ${prop}: 360deg; } }`,
        css: `${selector} { background: ${rotating(spec, prop)}; animation: ${name}-rotate ${seconds}s linear infinite; }\n${reduced}`,
      };
    }
    case "shift":
      return {
        keyframes: `@keyframes ${name}-shift { from { background-position: 0% 0%; } to { background-position: 100% 100%; } }`,
        css: `${selector} { ${gradient(spec).css} background-size: 200% 200%; animation: ${name}-shift ${seconds}s ease-in-out infinite alternate; }\n${reduced}`,
      };
    case "hue":
      return {
        keyframes: `@keyframes ${name}-hue { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }`,
        css: `${selector} { ${gradient(spec).css} animation: ${name}-hue ${seconds}s linear infinite; }\n${reduced}`,
      };
    default:
      throw new VisError(
        `unknown animation kind: ${String((opts as { kind: unknown }).kind)}`,
      );
  }
}
