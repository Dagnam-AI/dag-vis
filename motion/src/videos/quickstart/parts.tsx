// Shared parts: the palette, text and box primitives, the wordmark and the
// reveal line. Every colour is THEME or a mix of it; every number is LAYOUT's.
import type { CSSProperties, ReactNode } from "react";

import { THEME } from "../../bridge/brand.ts";
import { easeOutCubic, progress } from "../../lib/ease.ts";
import { CUES, HEIGHT, LAYOUT, WIDTH } from "./timing.ts";

const mix = (percent: number, base: string): string =>
  `color-mix(in srgb, ${THEME.foreground} ${String(percent)}%, ${base})`;

export const C = {
  bg: THEME.background,
  fg: THEME.foreground,
  accent: THEME.accent,
  /** Node cards and dialogs: a dark grey. */
  panel: mix(7, THEME.background),
  /** Inputs and chips on a panel. */
  raised: mix(13, THEME.background),
  hairline: mix(24, "transparent"),
  /** Section names and field labels: quiet, but easy to read on a phone. */
  label: mix(78, "transparent"),
  dim: mix(62, "transparent"),
  /** Grey bars: abstract code, tracks. */
  bar: mix(26, THEME.background),
  /** The canvas the nodes sit on: lets the field show through. */
  canvas: `color-mix(in srgb, ${THEME.background} 62%, transparent)`,
} as const;

/** Line height of every Txt, and where a line of `size` px starts to sit centred in a box `h` px tall with a 2 px border. */
export const LINE = 1.22;
export const centred = (h: number, size: number): number =>
  (h - 2 * LAYOUT.hairline - size * LINE) / 2;

export const UI = `${THEME.ui}, ${THEME.text}`;
export const DISPLAY = `${THEME.display}, ${THEME.text}`;

/** `list[i]`, or an error naming the index: the lists are fixed-size, so a miss is a typo in timing.ts. */
export function at<T>(list: readonly T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`no entry ${String(i)}`);
  return item;
}

/** 0 to 1, linear, over the frames of a cue. */
export const along = (frame: number, cue: readonly [number, number]): number =>
  progress(frame, cue[0], cue[1]);

/** 0 to 1, eased out, over the frames of a cue. */
export const appear = (frame: number, cue: readonly [number, number]): number =>
  easeOutCubic(progress(frame, cue[0], cue[1]));

export interface BoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  border?: string;
  opacity?: number;
  /** Extra transform, e.g. a lift while it arrives. */
  transform?: string;
  style?: CSSProperties;
  children?: ReactNode;
}
export const Box: React.FC<BoxProps> = ({
  x,
  y,
  w,
  h,
  fill,
  border,
  opacity = 1,
  transform,
  style,
  children,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: h,
      boxSizing: "border-box",
      background: fill,
      border:
        border === undefined
          ? undefined
          : `${String(LAYOUT.hairline)}px solid ${border}`,
      opacity,
      transform,
      ...style,
    }}
  >
    {children}
  </div>
);

export interface TxtProps {
  x?: number;
  y: number;
  size: number;
  weight?: 400 | 500 | 700;
  color?: string;
  /** Centred across `w` (the whole frame when `w` is not given), from its left edge, instead of starting at `x`. */
  center?: boolean;
  w?: number;
  opacity?: number;
  /** Pixels it sits below its place, for a short arrival. */
  lift?: number;
  children: ReactNode;
}
export const Txt: React.FC<TxtProps> = ({
  x = 0,
  y,
  size,
  weight = 500,
  color = C.fg,
  center = false,
  w,
  opacity = 1,
  lift = 0,
  children,
}) => (
  <div
    style={{
      position: "absolute",
      left: center ? 0 : x,
      top: y,
      width: center ? (w ?? WIDTH) : w,
      textAlign: center ? "center" : "left",
      fontFamily: UI,
      fontWeight: weight,
      fontSize: size,
      lineHeight: LINE,
      textWrap: "balance",
      color,
      opacity,
      transform: lift === 0 ? undefined : `translateY(${String(lift)}px)`,
      whiteSpace: w === undefined && !center ? "nowrap" : undefined,
    }}
  >
    {children}
  </div>
);

/** The small Unbounded name of a section, top left; it appears once, early in its beat. */
export const SectionLabel: React.FC<{ frame: number; children: string }> = ({
  frame,
  children,
}) => (
  <Txt
    x={LAYOUT.labelAt.x}
    y={LAYOUT.labelAt.y}
    size={LAYOUT.text.label}
    weight={500}
    color={C.label}
    opacity={appear(frame, CUES.label)}
  >
    {children}
  </Txt>
);

/** DAGNAM and a red .AI, in Moonhouse, as the brand sets it. ASCII only: the font has no other glyphs. */
export const WordmarkText: React.FC<{
  base: string;
  tld: string;
  y: number;
  size: number;
  opacity?: number;
  lift?: number;
}> = ({ base, tld, y, size, opacity = 1, lift = 0 }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: y,
      width: WIDTH,
      textAlign: "center",
      fontFamily: DISPLAY,
      fontSize: size,
      lineHeight: 1,
      color: C.fg,
      opacity,
      transform: lift === 0 ? undefined : `translateY(${String(lift)}px)`,
    }}
  >
    {base}
    <span style={{ color: C.accent }}>{tld}</span>
  </div>
);

/** Children placed in world pixels, faded and moved together. */
export const Group: React.FC<{
  opacity?: number;
  transform?: string;
  children: ReactNode;
}> = ({ opacity = 1, transform, children }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      opacity,
      transform,
      // The camera maths measures from the frame's top left corner.
      transformOrigin: "0 0",
    }}
  >
    {children}
  </div>
);

/** A full-frame SVG layer for lines, in world pixels. */
export const Layer: React.FC<{ children: ReactNode }> = ({ children }) => (
  <svg
    width={WIDTH}
    height={HEIGHT}
    viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
    style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
  >
    {children}
  </svg>
);

/** A path drawn from its start to `p` (0..1) of its length, square ends. */
export const Stroke: React.FC<{
  d: string;
  p: number;
  color: string;
  width?: number;
  opacity?: number;
}> = ({ d, p, color, width = 4, opacity = 1 }) =>
  p <= 0 ? null : (
    <path
      d={d}
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - p}
      fill="none"
      stroke={color}
      strokeWidth={width}
      opacity={opacity}
    />
  );
