export { FLOW_SHAPES, resolveField } from "./spec.js";
export type {
  FieldHighlight,
  FieldSpec,
  FlowFieldSpec,
  FlowShape,
  FluidFieldPoint,
  FluidFieldSpec,
  FlutedFieldDirection,
  FlutedFieldSpec,
  ResolvedField,
  ResolvedFlow,
  ResolvedFluid,
  ResolvedFluted,
} from "./spec.js";
export { GRAIN_FPS, TIME_RATE, timeCoords } from "./time.js";
export type { TimeCoords } from "./time.js";
export { fbm, hash01, hash4, simplex4 } from "./noise.js";
export {
  MAX_FRAME_PIXELS,
  MAX_T,
  makeSampler,
  renderField,
  renderResolved,
} from "./render.js";
export type { FieldFrame, RenderFieldOptions } from "./render.js";
export type { Sampler } from "./cpu/types.js";
export { FLOW_PRESET_NAMES, fieldPresets, flowPresets } from "./presets.js";
export type { FieldPresetName, FlowPresetName } from "./presets.js";
export { fieldPresetNames, parseFieldPreset } from "./preset-parse.js";
export { randomFlow } from "./random.js";
export type { FlowMood, RandomFlowOptions } from "./random.js";
// Internal GPU assembly for the live effect: not a root name, its output is not a stable contract.
export { planGpu } from "./glsl/program.js";
export type { GpuPlan, UniformValue, Uniforms } from "./glsl/program.js";
