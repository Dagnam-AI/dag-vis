import type { Rng } from "../core/rng.js";
import type { Size } from "../core/geometry.js";

export type Blend = "normal" | "multiply" | "screen" | "overlay" | "soft-light";

/** A colour string (even spacing) or an explicit stop. All-or-none `at`. */
export type Stop = string | { color: string; at?: number; opacity?: number };

/** An image drawn over the gradient. CSS honours `blend`; only SVG honours `opacity`. */
export interface Overlay {
  image: string;
  opacity?: number;
  blend?: Blend;
}

export interface GradientBase {
  /** Canvas the SVG/CSS is sized for. Default 1200×630. */
  size?: Size;
  /** 0..1 film-grain overlay (SVG only). */
  grain?: number;
  overlay?: Overlay;
  seed?: number;
  /** `<defs>` id namespace. Default `"vis" + seed`. */
  idPrefix?: string;
}

interface Directional {
  stops: readonly Stop[];
  repeat?: boolean;
  reverse?: boolean;
}

export interface LinearSpec extends GradientBase, Directional {
  kind: "linear";
  /** CSS angle in degrees (0 = to top, 90 = to right). Default 180. */
  angle?: number;
}

export interface RadialSpec extends GradientBase, Directional {
  kind: "radial";
  shape?: "circle" | "ellipse";
  /** Centre in unit coords. Default [0.5, 0.5]. */
  at?: readonly [number, number];
  /** Circle: fraction of the short side. Ellipse: fraction of the box. Default 0.5. */
  radius?: number;
}

export interface ConicSpec extends GradientBase, Directional {
  kind: "conic";
  /** Start angle in degrees. Default 0. */
  from?: number;
  at?: readonly [number, number];
}

export interface MeshPoint {
  at: readonly [number, number];
  color: string;
  /** Fraction of the short side. Default 0.5. */
  radius?: number;
}

export interface MeshSpec extends GradientBase {
  kind: "mesh";
  base: string;
  points: readonly MeshPoint[];
}

export interface AuroraSpec extends GradientBase {
  kind: "aurora";
  palette: readonly string[];
  /** Default 5. */
  blobs?: number;
  /** Default #0a0a0a. */
  base?: string;
}

export interface BandedSpec extends GradientBase {
  kind: "banded";
  stops: readonly Stop[];
  bands: number;
  angle?: number;
}

export interface LayersSpec extends GradientBase {
  kind: "layers";
  /** Bottom first. Sub-spec size/grain/overlay are ignored; the top-level ones apply. */
  layers: readonly GradientSpec[];
  blend?: Blend;
}

export interface FreeformPoint {
  at: readonly [number, number];
  color: string;
  /** Radius as a fraction of the short side. Default 0.6. */
  spread?: number;
}

export interface FreeformSpec extends GradientBase {
  kind: "freeform";
  points: readonly FreeformPoint[];
  /** Blur as a fraction of the short side. Default 0.12. */
  softness?: number;
  /** Default: the first point's colour. */
  base?: string;
}

export interface GlowPoint {
  /** The ellipse's radii in percent of the box: [width, height], each 0.01..1000. */
  size: readonly [number, number];
  /** Centre in percent of the box, each 0..100. */
  at: readonly [number, number];
  /** Any colour the package parses (oklch included); its alpha is the glow's strength. */
  color: string;
}

export interface GlowsSpec extends GradientBase {
  kind: "glows";
  /** Strongest first: the first glow is drawn on top. Each fades to transparent at 70%. */
  glows: readonly GlowPoint[];
  /** The solid colour under the glows. */
  base: string;
}

export interface FlutedSpec extends GradientBase {
  kind: "fluted";
  source: GradientSpec;
  /**
   * 2..256, default 24. Render cost is capped: the product of the reeds down any nesting
   * (a fluted source, or one inside `layers`, multiplies; layers add) times the leaf
   * source's weight (1 for a linear, banded or circular radial source, 4 for any other)
   * must not exceed 256. So 256 reeds over a linear source, 64 over a conic, 16 over 16
   * over a linear one.
   */
  reeds?: number;
  direction?: "vertical" | "horizontal" | "angle";
  /** Only for direction "angle". Default 20. */
  angle?: number;
  /**
   * 0..1, how much each reed shrinks the source about its centre. Default 0.35.
   * SVG only: the `css` output ignores it (CSS cannot rescale a source per reed), so
   * CSS and SVG agree exactly only at 0. With a pattern-based source (conic, mesh,
   * aurora, freeform, layers, fluted) or an elliptical radial, the shrunken copy of an
   * end reed does not reach the canvas edge and, with angled reeds, its slanted edge
   * shows as a faint seam over the unrefracted source; linear and circular radial
   * sources (which continue past their box) have neither.
   */
  refraction?: number;
  /** 0..1 edge shading strength, drawn in both SVG and CSS. Default 0.5. */
  shade?: number;
}

export type GradientSpec =
  | LinearSpec
  | RadialSpec
  | ConicSpec
  | MeshSpec
  | AuroraSpec
  | BandedSpec
  | LayersSpec
  | FreeformSpec
  | GlowsSpec
  | FlutedSpec;

export interface GradientResult {
  /**
   * A CSS declaration list: `background: …;` (+ `background-blend-mode: …;`).
   * CSS cannot express `grain`, and ignores `overlay.opacity` and a fluted `refraction`
   * (SVG honours all three).
   */
  css: string;
  /** Body markup (rects) sized to `size`; needs `defs` in the same document. */
  svg: string;
  /** Contents for `<defs>`. */
  defs: string;
  /** Paint reference `url(#<id>-g)`. */
  fill: string;
}

/** What one kind renderer returns. `cssImages` are CSS background layers, TOP first. */
export interface KindOutput {
  defs: string;
  fill: string;
  cssImages: string[];
  cssBlend?: string;
}

export interface Ctx {
  id: string;
  size: Size;
  rng: Rng;
  /** Render a nested spec under a sub-id (layers, fluted). */
  render(spec: GradientSpec, id: string): KindOutput;
}
