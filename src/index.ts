// The package root is an explicit allow-list, not `export *`: a name added to a
// sub-barrel for internal or test use does not become public by accident, and
// names can be added after 0.1.0 but never removed. tests/index.test.ts pins
// the runtime names.

// core
export {
  VisError,
  createRng,
  fmt,
  mix,
  parseColor,
  ramp,
  toCss,
  toHex,
  toVec3,
  withAlpha,
} from "./core/index.js";
export type { Rgba, Rng, Size } from "./core/index.js";

// brand
export { BRAND, LOGO, PALETTES, logoSvg, palette } from "./brand/index.js";
export type { LogoSvgOptions, PaletteName } from "./brand/index.js";

// gradient
export {
  BLENDS,
  FREEFORM_PALETTES,
  animatedGradientCss,
  freeformPalette,
  freeformRandom,
  gradient,
  gradientSvg,
} from "./gradient/index.js";
export type {
  AnimatedOptions,
  AuroraSpec,
  BandedSpec,
  Blend,
  ConicSpec,
  FlutedSpec,
  FreeformPoint,
  FreeformSpec,
  GlowPoint,
  GlowsSpec,
  GradientBase,
  GradientResult,
  GradientSpec,
  LayersSpec,
  LinearSpec,
  MeshPoint,
  MeshSpec,
  Overlay,
  RadialSpec,
  Stop,
} from "./gradient/index.js";

// pattern
export { pattern } from "./pattern/index.js";
export type {
  ContoursSpec,
  DagMeshSpec,
  DotsSpec,
  GridSpec,
  LinesSpec,
  NoiseSpec,
  PatternBase,
  PatternResult,
  PatternSpec,
  StripesSpec,
} from "./pattern/index.js";

// scene
export {
  FONT_FAMILY,
  brandBackground,
  brandBackgroundLayers,
  coverLayers,
  coverSpec,
  measureText,
  ogCard,
  ribbon,
  ribbonCurves,
  wrapText,
} from "./scene/index.js";
export type {
  BrandBackgroundOptions,
  CoverGlow,
  CoverInput,
  CoverLayers,
  OgBackground,
  OgCardOptions,
  RibbonOptions,
  RibbonSvgOptions,
  Weight,
} from "./scene/index.js";

// animate (browser-only at call time; importing creates no context and
// touches no DOM global)
export {
  COMMON_DEFAULTS,
  DITHER_DEFAULTS,
  GLITCH_DEFAULTS,
  PIXEL_BLAST_DEFAULTS,
  RIBBON_DEFAULTS,
  TERMINAL_DEFAULTS,
  createDither,
  createGlitch,
  createPixelBlast,
  createRibbon,
  createTerminal,
  loopTime,
} from "./animate/index.js";
export type {
  DitherOptions,
  EffectHandle,
  EffectOptions,
  GlitchOptions,
  GlitchVignette,
  PixelBlastOptions,
  PixelShape,
  RibbonEffectOptions,
  TerminalOptions,
} from "./animate/index.js";
