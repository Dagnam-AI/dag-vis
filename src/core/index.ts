export { VisError } from "./errors.js";
export { createRng } from "./rng.js";
export type { Rng } from "./rng.js";
export { fmt } from "./format.js";
export { el, escapeAttr, svgDoc, text } from "./svg.js";
export type { Attrs } from "./svg.js";
export {
  assertSize,
  fitAspect,
  focalScale,
  focalTransform,
} from "./geometry.js";
export type { Size } from "./geometry.js";
export {
  mix,
  parseColor,
  ramp,
  toCss,
  toHex,
  toVec3,
  withAlpha,
} from "./color.js";
export type { Rgba } from "./color.js";
export {
  MAX_DIMENSION,
  bounded,
  describeValue,
  finite,
  integerIn,
  orDefault,
  parseId,
  parsePaint,
  parseSeed,
  within,
} from "./validate.js";
export type { Paint } from "./validate.js";
