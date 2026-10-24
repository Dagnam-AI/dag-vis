import {
  deepFreeze,
  type FieldSpec,
  type FlowFieldSpec,
  type FluidFieldSpec,
  type FlutedFieldSpec,
} from "./spec.js";

/** The flow presets, in the order of the reference grid they were sampled from (reading order), then `brand`. */
export const FLOW_PRESET_NAMES = Object.freeze([
  "violet-dusk",
  "lunar",
  "lagoon",
  "bronze",
  "sunset-ring",
  "citrus-mist",
  "orchid",
  "lilac-wave",
  "forest-glow",
  "rose",
  "emerald",
  "glacier",
  "rainbow-band",
  "cobalt",
  "crimson",
  "pine",
  "brand",
] as const);
export type FlowPresetName = (typeof FLOW_PRESET_NAMES)[number];
/** Every preset name: the flow presets, `fluid-dawn` and `fluted-ember`; the keys of `fieldPresets`. */
export type FieldPresetName = FlowPresetName | "fluid-dawn" | "fluted-ember";

const flow = (p: Omit<FlowFieldSpec, "kind">): FlowFieldSpec => ({
  kind: "flow",
  ...p,
});

/**
 * Colours sampled from the reference tiles and ordered dark to light, so the noise ramp
 * (`0.5 + 0.8 * n`) reproduces each tile. Eight palettes (lagoon, citrus-mist, orchid,
 * lilac-wave, rose, glacier, rainbow-band, pine) are not strictly dark to light by OKLab
 * lightness: each dips at one or more stops (rainbow-band also in the middle, and it
 * ends on its first colour). Shape, warp and light values are a first tuning, subject to
 * visual review.
 */
const FLOWS: Record<FlowPresetName, FlowFieldSpec> = {
  "violet-dusk": flow({
    palette: ["#210d9f", "#3b267c", "#6553cb", "#8b42bb", "#ba41b3"],
    shape: "swirl",
    warp: { octaves: 3, strength: 1.2, scale: 1.1 },
    rotation: 0.4,
    light: { vignette: 0.25 },
    grain: 0.35,
    seed: 1,
  }),
  lunar: flow({
    palette: ["#0f1055", "#2c2d8c", "#453d81", "#857fa6", "#bfc5d0"],
    shape: "bloom",
    warp: { octaves: 3, strength: 0.8, scale: 0.9 },
    light: {
      vignette: 0.3,
      highlight: { at: [0.85, 0.3], strength: 0.45, radius: 0.6 },
    },
    grain: 0.4,
    seed: 2,
  }),
  lagoon: flow({
    palette: ["#0d4840", "#126e5c", "#256257", "#319583", "#45b9a9"],
    shape: "wave",
    warp: { octaves: 3, strength: 1.0, scale: 1.2 },
    rotation: -0.3,
    light: { vignette: 0.2 },
    grain: 0.35,
    seed: 3,
  }),
  bronze: flow({
    palette: ["#391c0b", "#67341a", "#844013", "#b0683a", "#c98648", "#b9944f"],
    shape: "swirl",
    warp: { octaves: 3, strength: 1.4, scale: 1.0 },
    light: { vignette: 0.35 },
    grain: 0.45,
    seed: 4,
  }),
  "sunset-ring": flow({
    palette: ["#4f4bc0", "#7c70cb", "#c76ec5", "#dd9f62", "#e9b12e"],
    shape: "swirl",
    warp: { octaves: 2, strength: 0.9, scale: 0.8 },
    scale: 0.9,
    grain: 0.35,
    seed: 5,
  }),
  "citrus-mist": flow({
    palette: ["#0b2319", "#3cadad", "#589fb8", "#7bbca6", "#acc75c", "#cde394"],
    shape: "aurora",
    warp: { octaves: 3, strength: 1.1, scale: 1.0 },
    rotation: 0.5,
    grain: 0.4,
    seed: 6,
  }),
  orchid: flow({
    palette: ["#1b184b", "#28123b", "#4a235c", "#6848a8", "#af33b3", "#df31db"],
    shape: "bloom",
    warp: { octaves: 3, strength: 1.3, scale: 1.3 },
    light: {
      highlight: {
        at: [0.15, 0.75],
        strength: 0.3,
        radius: 0.5,
        color: "#f04af0",
      },
    },
    grain: 0.4,
    seed: 7,
  }),
  "lilac-wave": flow({
    palette: ["#673ca8", "#8140bd", "#aa66d1", "#b594cb", "#98aac8", "#c483cc"],
    shape: "wave",
    warp: { octaves: 3, strength: 1.0, scale: 1.1 },
    rotation: 0.3,
    grain: 0.4,
    seed: 8,
  }),
  "forest-glow": flow({
    palette: ["#0a443f", "#0b4d47", "#124e41", "#317d53", "#58ac69", "#7ec36c"],
    shape: "bloom",
    warp: { octaves: 3, strength: 1.0, scale: 1.0 },
    light: {
      vignette: 0.3,
      highlight: {
        at: [0.3, 0.3],
        strength: 0.35,
        radius: 0.55,
        color: "#9fe07a",
      },
    },
    grain: 0.4,
    seed: 9,
  }),
  rose: flow({
    palette: ["#371476", "#6c2da5", "#951c64", "#c33279", "#d55461", "#c83a4e"],
    shape: "wave",
    warp: { octaves: 2, strength: 0.7, scale: 0.9 },
    rotation: -0.2,
    grain: 0.4,
    seed: 10,
  }),
  emerald: flow({
    palette: ["#1a3d24", "#255030", "#166a2f", "#2fa844", "#45b060", "#57bd6b"],
    shape: "swirl",
    warp: { octaves: 4, strength: 1.5, scale: 1.3 },
    scale: 1.1,
    light: { vignette: 0.3 },
    grain: 0.35,
    seed: 11,
  }),
  glacier: flow({
    palette: ["#121f26", "#1c3f44", "#2a7174", "#594db7", "#7581d5", "#94c4dd"],
    shape: "aurora",
    warp: { octaves: 3, strength: 1.1, scale: 1.0 },
    rotation: -0.6,
    light: { vignette: 0.3 },
    grain: 0.45,
    seed: 12,
  }),
  "rainbow-band": flow({
    palette: ["#554fd7", "#4264c7", "#2d8a98", "#3d8f49", "#609036", "#554fd7"],
    shape: "band",
    warp: { octaves: 2, strength: 0.6, scale: 0.8 },
    rotation: 0.35,
    grain: 0.4,
    seed: 13,
  }),
  cobalt: flow({
    palette: ["#4146b9", "#5659dc", "#5f66e8", "#7271d5", "#a69eb9", "#c5bd90"],
    shape: "bloom",
    warp: { octaves: 2, strength: 0.5, scale: 0.7 },
    light: {
      highlight: {
        at: [0.1, 0.9],
        strength: 0.5,
        radius: 0.45,
        color: "#e8dca0",
      },
    },
    grain: 0.35,
    seed: 14,
  }),
  crimson: flow({
    palette: ["#3a1a2e", "#631c3a", "#7d1f3e", "#ae2e56", "#c64b6e", "#d15f7c"],
    shape: "noise",
    warp: { octaves: 3, strength: 0.9, scale: 1.0 },
    light: { vignette: 0.4 },
    grain: 0.5,
    seed: 15,
  }),
  pine: flow({
    palette: ["#0f3425", "#114733", "#145f46", "#2f8d54", "#4daf6c", "#65967e"],
    shape: "swirl",
    warp: { octaves: 3, strength: 1.3, scale: 1.2 },
    rotation: 0.8,
    light: { vignette: 0.3 },
    grain: 0.4,
    seed: 16,
  }),
  brand: flow({
    palette: ["#0a0a0a", "#1a0a0c", "#4a1016", "#9b1c1c", "#ef4444"],
    shape: "bloom",
    warp: { octaves: 3, strength: 1.0, scale: 1.0 },
    light: {
      vignette: 0.35,
      highlight: {
        at: [0.82, 0.5],
        strength: 0.25,
        radius: 0.5,
        color: "#ef4444",
      },
    },
    grain: 0.35,
    seed: 17,
  }),
};

/** A reference tile: white top-left, violet along the top, coral bottom-left, pink right, blue bottom-right. */
const FLUID_DAWN: FluidFieldSpec = {
  kind: "fluid",
  points: [
    { at: [0.05, 0.05], color: "#f5edfa", spread: 1.2 },
    { at: [0.6, 0.1], color: "#a99ef3" },
    { at: [0.25, 0.75], color: "#f6747b" },
    { at: [0.92, 0.5], color: "#f6a6fe" },
    { at: [0.9, 0.95], color: "#87a0fc" },
  ],
  softness: 0.35,
  drift: 0.08,
  base: "#dcd0f0",
  grain: 0.08,
  seed: 18,
};

/** A reference tile: navy and black with blue, magenta and orange seen through fluted glass. */
const FLUTED_EMBER: FlutedFieldSpec = {
  kind: "fluted",
  source: {
    kind: "fluid",
    points: [
      { at: [0.1, 0.05], color: "#f8c08a" },
      { at: [0.05, 0.35], color: "#1f8fd6" },
      { at: [0.1, 0.85], color: "#050510", spread: 1.4 },
      { at: [0.85, 0.1], color: "#0b1a3a", spread: 1.3 },
      { at: [0.5, 0.55], color: "#d81b60" },
      { at: [0.9, 0.85], color: "#f4894f" },
    ],
    softness: 0.3,
    drift: 0.04,
    base: "#101030",
  },
  reeds: 28,
  refraction: 0.7,
  shade: 0.55,
  jitter: 0.3,
  grain: 0.25,
  seed: 19,
};

/**
 * A frozen record with no prototype: `presets[name]` for a name a user typed can never
 * reach `Object.prototype` (`"toString"`, `"__proto__"`), and nothing can add or change an entry.
 */
function frozenRecord<K extends string, V>(
  entries: Record<K, V>,
): Readonly<Record<K, V>> {
  return deepFreeze(
    Object.assign(Object.create(null) as Record<K, V>, entries),
  );
}

/**
 * The flow presets by name, deeply frozen: a spec to pass to `renderField`, `createField`
 * or `resolveField` as it is, or to copy (`{ ...flowPresets.lunar, seed: 9 }`) and change.
 * Key order is the contract: `FLOW_PRESET_NAMES`. The record has no prototype, so a
 * lookup by user input never reaches `Object.prototype`; for the same reason it has no
 * `hasOwnProperty` and does not convert to a string: test a name with `name in flowPresets`
 * or `Object.hasOwn(flowPresets, name)`.
 */
export const flowPresets: Readonly<Record<FlowPresetName, FlowFieldSpec>> =
  frozenRecord(FLOWS);

/**
 * Every preset by name, deeply frozen: the flow presets in `FLOW_PRESET_NAMES` order, then
 * `fluid-dawn` and `fluted-ember`. Prototype-free like `flowPresets`: test a name with
 * `name in fieldPresets` or `Object.hasOwn(fieldPresets, name)`.
 */
export const fieldPresets: Readonly<Record<FieldPresetName, FieldSpec>> =
  frozenRecord<FieldPresetName, FieldSpec>({
    ...flowPresets,
    "fluid-dawn": FLUID_DAWN,
    "fluted-ember": FLUTED_EMBER,
  });
