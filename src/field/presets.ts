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
 * rose, glacier, pine, and the reworked sunset-ring and rainbow-band) are not strictly
 * dark to light by OKLab lightness: each dips at one or more stops (sunset-ring on
 * purpose, its last stop is the dark core inside the ring). Shape, warp and light values
 * are a first tuning, subject to visual review; rainbow-band, sunset-ring, lilac-wave
 * and cobalt were retuned by eye against contact-sheet renders.
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
  // A ring, not a blob: `bloom` is brightest at the centre, so the palette peaks (orange)
  // at the middle of the noise range and falls to dark plum at the top, which leaves a
  // dark core inside a luminous ring that fades through magenta and violet to indigo.
  "sunset-ring": flow({
    palette: ["#0c0830", "#2a1272", "#a8307e", "#ff8030", "#3a0f48", "#1a0a3a"],
    shape: "bloom",
    warp: { octaves: 2, strength: 0.35, scale: 0.5 },
    scale: 0.9,
    light: { vignette: 0.35 },
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
  // Broad diagonal waves: `band` repeats dark plum troughs and lilac crests across the frame.
  "lilac-wave": flow({
    palette: ["#1f0a3a", "#4a1f80", "#7e48c0", "#a070d8", "#c49aec"],
    shape: "band",
    warp: { octaves: 2, strength: 0.5, scale: 0.4 },
    scale: 2.8,
    rotation: 0.35,
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
  // Red, amber, green, cyan, blue, violet at near-equal OKLab chroma, so every neighbouring
  // pair blends through a clean in-between hue (orange, teal, azure, indigo) and never grey.
  "rainbow-band": flow({
    palette: ["#c51d28", "#c18a04", "#039039", "#068b96", "#0e4ec8", "#6f049f"],
    shape: "band",
    warp: { octaves: 2, strength: 0.4, scale: 0.55 },
    rotation: -0.75,
    light: { vignette: 0.3 },
    grain: 0.4,
    seed: 13,
  }),
  // Folded silk: `aurora` stretches the noise into long folds, so the deep cobalt base
  // carries navy creases and only a few cyan-white highlights.
  cobalt: flow({
    palette: ["#020618", "#061258", "#0f2a9a", "#1f4fd6", "#5cb0ff", "#e8fbff"],
    shape: "aurora",
    warp: { octaves: 3, strength: 1.0, scale: 1.0 },
    rotation: 0.9,
    light: { vignette: 0.3 },
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
 * The flow presets by name, deeply frozen: a spec to pass to `renderField` or `createField`
 * as it is, or to copy (`{ ...flowPresets.lunar, seed: 9 }`) and change.
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
