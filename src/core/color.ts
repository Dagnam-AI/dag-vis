import { VisError } from "./errors.js";

/** sRGB components and alpha, all 0..1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Clamp to 0..1; NaN counts as 0 so it can never reach a serialised colour. */
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v || 0));
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*[^)]*\)$/i;
const OKLCH = /^oklch\(\s*[^)]*\)$/i;
/** Plain decimal numbers only: no empty string, no 0x/0b literals, no Infinity. */
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
/** Text between the first "(" and the final ")". */
const body = (s: string): string => s.slice(s.indexOf("(") + 1, -1);

function parseHex(hex: string): Rgba {
  const h = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex;
  const n = (i: number): number => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
}

/**
 * One numeric token. A trailing "%" (only when `pctOf` is given) means that
 * fraction of `pctOf`. Anything that is not a finite decimal throws, so an
 * empty or malformed token can never silently become 0.
 */
function num(raw: string, input: string, pctOf?: number): number {
  const scale = raw.endsWith("%") ? pctOf : undefined;
  const text = scale === undefined ? raw : raw.slice(0, -1);
  const v = Number(text);
  if (!DECIMAL.test(text) || !Number.isFinite(v))
    throw new VisError(`invalid number "${raw}" in colour: ${input}`);
  return scale === undefined ? v : (v / 100) * scale;
}

function parseAlpha(raw: string | undefined, input: string): number {
  if (raw === undefined) return 1;
  const v = num(raw, input, 1);
  if (v < 0 || v > 1) throw new VisError(`invalid alpha in colour: ${input}`);
  return v;
}

/** "a, b, c" | "a b c" | "a b c / alpha" | "a, b, c, alpha" → [a, b, c, alpha?] */
function splitArgs(
  body: string,
  input: string,
): { parts: string[]; alpha: string | undefined } {
  const segments = body.split("/").map((s) => s.trim());
  if (segments.length > 2) throw new VisError(`invalid colour: ${input}`);
  const [main = "", slashAlpha] = segments;
  // Empty tokens (`1,,2`) are kept so num() rejects them.
  const parts = main.split(/\s*,\s*|\s+/);
  if (slashAlpha !== undefined) return { parts, alpha: slashAlpha };
  return parts.length === 4
    ? { parts: parts.slice(0, 3), alpha: parts[3] }
    : { parts, alpha: undefined };
}

function parseRgb(body: string, input: string): Rgba {
  const { parts, alpha } = splitArgs(body, input);
  if (parts.length !== 3) throw new VisError(`invalid rgb() colour: ${input}`);
  const [r, g, b] = parts.map((p) => {
    const v = num(p, input, 255);
    if (v < 0 || v > 255)
      throw new VisError(`invalid rgb() channel in colour: ${input}`);
    return v / 255;
  }) as [number, number, number];
  return { r, g, b, a: parseAlpha(alpha, input) };
}

// --- OKLab / OKLCH (Björn Ottosson's published matrices) -------------------

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

type Lab = [number, number, number];

function rgbToOklab(c: Rgba): Lab {
  const r = srgbToLinear(c.r);
  const g = srgbToLinear(c.g);
  const b = srgbToLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, A, B]: Lab, a: number): Rgba {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: clamp01(
      linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    ),
    g: clamp01(
      linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    ),
    b: clamp01(
      linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ),
    a,
  };
}

function parseOklch(body: string, input: string): Rgba {
  const { parts, alpha } = splitArgs(body, input);
  if (parts.length !== 3)
    throw new VisError(`invalid oklch() colour: ${input}`);
  const [lRaw, cRaw, hRaw] = parts as [string, string, string];
  const L = num(lRaw, input, 1);
  const C = num(cRaw, input);
  const H = num(hRaw.replace(/deg$/i, ""), input);
  const rad = (H * Math.PI) / 180;
  return oklabToRgb(
    [L, C * Math.cos(rad), C * Math.sin(rad)],
    parseAlpha(alpha, input),
  );
}

/**
 * #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() (comma or space syntax, optional
 * `/ alpha`), oklch(). Anything else throws VisError naming the input — a
 * generator never silently falls back to black.
 */
export function parseColor(input: string): Rgba {
  const s = input.trim();
  if (s === "") throw new VisError("invalid colour: empty string");
  if (HEX.test(s)) return parseHex(s.slice(1));
  if (RGB.test(s)) return parseRgb(body(s), input);
  if (OKLCH.test(s)) return parseOklch(body(s), input);
  throw new VisError(`invalid colour: ${input}`);
}

const hex2 = (v: number): string =>
  Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, "0");

/** #rrggbb, or #rrggbbaa when alpha < 1. */
export function toHex(c: Rgba): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a < 1 ? `${base}${hex2(c.a)}` : base;
}

/** CSS/SVG paint: hex when opaque, rgba() otherwise. */
export function toCss(c: Rgba): string {
  if (c.a >= 1) return toHex(c);
  const ch = (v: number): number => Math.round(clamp01(v) * 255);
  return `rgba(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)}, ${Math.round(c.a * 1000) / 1000})`;
}

export function withAlpha(c: Rgba, a: number): Rgba {
  return { ...c, a: clamp01(a) };
}

/** Perceptual mix in OKLab; alpha linear; t clamped to 0..1. */
export function mix(a: Rgba, b: Rgba, t: number): Rgba {
  const k = clamp01(t);
  if (k === 0) return { ...a };
  if (k === 1) return { ...b };
  const la = rgbToOklab(a);
  const lb = rgbToOklab(b);
  const lab: Lab = [
    la[0] + (lb[0] - la[0]) * k,
    la[1] + (lb[1] - la[1]) * k,
    la[2] + (lb[2] - la[2]) * k,
  ];
  return oklabToRgb(lab, a.a + (b.a - a.a) * k);
}

/** n colours evenly sampled across ≥ 2 evenly spaced stops. */
export function ramp(stops: readonly string[], n: number): Rgba[] {
  if (stops.length < 2)
    throw new VisError(`ramp() needs at least 2 stops, got ${stops.length}`);
  if (!Number.isInteger(n) || n < 1)
    throw new VisError(`ramp() needs n >= 1, got ${String(n)}`);
  const parsed = stops.map(parseColor);
  const out: Rgba[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const pos = t * (parsed.length - 1);
    const lo = Math.min(Math.floor(pos), parsed.length - 2);
    out.push(
      parsed.slice(lo, lo + 2).reduce((from, to) => mix(from, to, pos - lo)),
    );
  }
  return out;
}

/** [r, g, b] in 0..1 for shader uniforms. */
export function toVec3(input: string): [number, number, number] {
  const c = parseColor(input);
  return [c.r, c.g, c.b];
}
