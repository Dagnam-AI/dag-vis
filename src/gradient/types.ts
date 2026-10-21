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

export interface FlutedSpec extends GradientBase {
  kind: "fluted";
  source: GradientSpec;
  /** Default 24. */
  reeds?: number;
  direction?: "vertical" | "horizontal" | "angle";
  /** Only for direction "angle". Default 20. */
  angle?: number;
  /** 0..1. Default 0.35. */
  refraction?: number;
  /** 0..1 edge shading strength. Default 0.5. */
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
  | FlutedSpec;

export interface GradientResult {
  /**
   * A CSS declaration list: `background: …;` (+ `background-blend-mode: …;`).
   * CSS cannot express `grain`, and ignores `overlay.opacity` (SVG honours both).
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
