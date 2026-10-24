// Public animate surface. The runtime/GL/colour internals (createRuntime,
// glRenderer, canvas2dRenderer, getGl, the *_FRAG strings, changedAt,
// lastChange, cellState, colour.ts) stay out on purpose.
export { createDither, DITHER_DEFAULTS } from "./dither.js";
export type { DitherOptions } from "./dither.js";
export { createField } from "./field.js";
export type { FieldOptions } from "./field.js";
export { createGlitch, GLITCH_DEFAULTS } from "./glitch.js";
export type { GlitchOptions, GlitchVignette } from "./glitch.js";
export { createPixelBlast, PIXEL_BLAST_DEFAULTS } from "./pixel-blast.js";
export type { PixelBlastOptions, PixelShape } from "./pixel-blast.js";
export { createRibbon, RIBBON_DEFAULTS } from "./ribbon.js";
export type { RibbonEffectOptions } from "./ribbon.js";
export { COMMON_DEFAULTS, loopTime } from "./runtime.js";
export type { EffectHandle, EffectOptions } from "./runtime.js";
export { createTerminal, TERMINAL_DEFAULTS } from "./terminal.js";
export type { TerminalOptions } from "./terminal.js";
