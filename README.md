# dag-vis — `@dagnam/vis`

Deterministic, parameterised [Dagnam.AI](https://dagnam.ai) visuals: brand tokens, gradients, patterns, social-preview (OG) cards, ribbons and favicon sets. Generators are pure functions that return SVG or CSS strings; a small Node layer turns them into PNGs.

| import                             | what                                                                                                                                   | runtime deps                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `@dagnam/vis`                      | brand tokens, gradients, patterns, scenes (SVG + CSS strings), the CPU field renderer and presets, browser-safe                        | none                                   |
| `@dagnam/vis/node` + `dag-vis` CLI | PNG rendering, favicon sets, `exportStatic` / `exportAnimation`, `renderSheet`, the CLI (bundled Inter, Unbounded and Moonhouse fonts) | `@resvg/resvg-js` (optional), `gifenc` |
| `@dagnam/vis/animate`              | the animated effects (`createDither`, `createGlitch`, ..., `createField`) and `exportCanvas`: WebGL2 / Canvas2D, browser only          | `gifenc`                               |
| `@dagnam/vis/react`                | `<VisBackground>` (the animated effects), `<Gradient>` and `<FieldPresetPicker>` for React 18 and 19                                   | `react` (optional peer)                |

Seeded generators take `seed` (default `1`); all output is deterministic, so the same options and seed give byte-identical SVG and CSS (`logoSvg` and `animatedGradientCss` take no seed).

## Install

```sh
npm i @dagnam/vis            # browser-safe root entry: no native code, no third-party code at runtime
npm i @resvg/resvg-js        # only to render PNGs: `@dagnam/vis/node`, the CLI, favicons (use -D if you only render at build time)
```

The package has one small regular dependency, `gifenc` (GIF encoding, MIT licensed, used only by export code). The container writers `mp4-muxer` and `webm-muxer` (also MIT) are bundled into `dist/export/vendor/` rather than depended on, because their `@types/dom-webcodecs` dependency would otherwise be installed into every consumer's `node_modules/@types` and break DOM-free TypeScript projects; `NOTICE` carries their licence. The root entry never loads any of them; `./animate` and `./node` load `gifenc` with the entry, and the two muxers only when a browser mp4 or webm export runs. The muxers are deprecated upstream in favour of Mediabunny but frozen; swapping them later is an internal change. ffmpeg is not a dependency and is not bundled: see [Exports](#exports). `@resvg/resvg-js` is an optional peer dependency (tested with `2.6.2`); install it as a regular dependency if you render at runtime, because production installs omit devDependencies. `renderPng` loads it lazily and throws a `VisError` naming the install command when it is absent, so `@dagnam/vis/node` itself still imports without it. The root entry never touches it and imports no `node:*` module, so it is safe in a browser bundle. Consumers need Node 22 or newer (Node 20 is end-of-life and receives no security fixes).

## Use

```ts
import {
  brandBackground,
  gradient,
  gradientSvg,
  freeformPalette,
  coverSpec,
  ogCard,
  pattern,
  ribbon,
} from "@dagnam/vis";

brandBackground({ width: 1200, height: 630 }); // the og-default look, any size (SVG string)
ogCard({ title: "Build AI Systems Visually", subtitle: "Dagnam.AI" }); // SVG in the site's fonts (Unbounded text, Moonhouse wordmark), wrapped with their metrics
ogCard({
  title: "Building a reasoning model",
  excerpt: "Data, architecture and training on one GPU.",
  cover: coverSpec({
    family: "tag:ai",
    item: "my-post",
    theme: "dark",
    variant: "banner",
  }),
}); // the 1200x630 social card (see below)
gradient({ kind: "freeform", points: freeformPalette("dawn") }).css; // "background: …;"
gradientSvg({
  kind: "fluted",
  source: { kind: "linear", stops: ["#ef4444", "#10abba"] },
  reeds: 24,
});
pattern({ kind: "dagMesh", density: 12 }).cssBackground; // url("data:image/svg+xml,…")
ribbon({ width: 1600, height: 900, lines: 120, mesh: true }); // the wave-mesh ribbon (SVG string)
```

### Root API (browser-safe)

- **Brand**: `BRAND` (colours), `PALETTES` / `palette(name)` (`red`, `mono`, `stripes`, `ocean`, `ember`), `LOGO` (path data), `logoSvg`.
- **Gradients**: `gradient(spec)` returns `{ css, svg, defs, fill }`: `css` is a declaration list (`background: …;`, plus `background-blend-mode` when needed), `svg` is body markup to pair with `defs`. `gradientSvg(spec, size?)` is a standalone `<svg>` document. `animatedGradientCss(spec, { kind: "rotate" | "shift" | "hue" })` returns `{ css, keyframes }` with a `prefers-reduced-motion` override; `FREEFORM_PALETTES` (a frozen object of the same four presets, `dawn`, `aurora`, `ember` and `brand`, each an array of `{ at, color, spread }` points), `freeformPalette(name)` (looks one up by name) and `freeformRandom({ count, palette, seed })` build freeform points; `BLENDS` lists the blend modes.
  - Kinds: `linear`, `radial`, `conic` (all three take `repeat`, `reverse` and per-stop `opacity`), `mesh`, `aurora`, `banded`, `layers` (with `blend`), `freeform`, `glows` (elliptical glows sized and placed in percent of the box, fading to transparent at 70%, over a `base` colour; later glows paint over earlier ones, at most 64 of them; a radius is at least half a pixel in both outputs; in the CSS that is exact only when the box it is applied to has the spec's `size`) and `fluted` (reeded glass over any other spec). Any spec also takes `size`, `grain`, `overlay`, `seed` and `idPrefix`.
  - A stop is a colour string or `{ color, at?, opacity? }`.
- **Patterns**: `pattern(spec)` returns `{ svg, defs, fill, cssBackground, tile }`. Kinds: `dots`, `grid`, `lines`, `stripes`, `dagMesh`, `contours`, `noise`.
- **Covers**: `coverSpec(input)` returns a `glows` gradient spec and `coverLayers(input)` the same cover as `{ base, glows }`: one deterministic look per `family` (a topic; omit it and the `item` is its own family), nudged per `item`, with optional `index`/`count` for an ordered family and the editor choices `seed`, `hue`, `region` and `intensity` (`null` or omitted means derive as usual). `family: ""` and a `null` `index` or `count` throw a `VisError`, as does any non-finite number; an empty `seed` means no seed. `coverSpec` lists the echo first so the main glow paints on top. `gradient(coverSpec({ family, item, theme, variant })).css` is the background.
- **Strict parsers**: `coverSpec` clamps; to reject typos in stored or authored data, parse first. `parseCoverInput(value)` checks the whole cover input (`item`, `theme`, `variant` required; `family`, `index`, `count`, `seed`, `hue` -15..15, `region` integer 0..4, `intensity` 0.6..1.4 optional, `null` allowed for `family`, `seed`, `hue`, `region` and `intensity`; `count` is at most 10000 and `index` is below `count`, which defaults to 1); `parseCoverChoices(value)` checks just the editor's choices (`family`, `seed`, `hue`, `region`, `intensity`); `parseFieldPreset(value)` returns a `FieldPresetName` (`fieldPresetNames` lists them in `fieldPresets` order). The two cover parsers throw a `VisError` naming the field (`cover.hue: expected a number in -15..15, got 20`) on an unknown key, a wrong type, a non-plain object, `NaN`/`Infinity`, an out-of-range number (never clamped) or a string over 200 characters, and return a new object with only the keys given; `parseFieldPreset` throws, listing the known names, for anything but an exact preset name. So `coverSpec(parseCoverInput(x))` never throws. Omit `family` or use `null` for no family; `family: ""` is rejected (`coverSpec` throws on it). The `CoverChoices` type is the choices subset of `CoverInput`.

  ```ts
  import { coverSpec, parseCoverChoices, parseFieldPreset } from "@dagnam/vis";

  const stored = JSON.parse(json) as Record<string, unknown>;
  const { kind, field_preset, ...rest } = stored; // neither is a cover choice
  const choices = parseCoverChoices(rest); // throws on a typo or an out-of-range value
  const spec = coverSpec({ ...choices, item, theme: "dark", variant: "card" });
  const preset =
    field_preset === undefined ? undefined : parseFieldPreset(field_preset);
  ```

- **Scenes**: `brandBackground(opts)` (and `brandBackgroundLayers` for composition), `ogCard(opts)` (`title`, `subtitle`, `eyebrow`, `footer`, `theme`, `background`; or `title`, `excerpt` and `cover` for the social card), `ribbon(opts)` (SVG) and `ribbonCurves(opts)` (the pure curve geometry). The light theme of the brand card is white with near-black text and the deep mark red (`BRAND.mark`) for the logo, eyebrow, rule and `.AI`: crisp hairline curves and a tight glow at the right edge, no pink wash and no vignette; any `background` option overrides these defaults.
- **Text and core helpers**: `measureText`, `wrapText`, `FONT_FAMILY`, `createRng`, `fmt`, colour helpers (`parseColor`, `toHex`, `toCss`, `mix`, `ramp`, `withAlpha`, `toVec3`), `VisError`. `measureText` and `wrapText` take at most 10,000 characters of text and `wrapText` returns at most 100 lines. The SVG builder, the validators, the stop pipeline, the geometry helpers and the font metrics are internal and not exported.

### Social card

`ogCard({ title, excerpt?, cover })` draws the per-post `og:image`: 1200×630, the cover's art as the background, the title large, the excerpt under it and a Dagnam.AI bar at the bottom. Pass `coverSpec({ theme: "dark", variant: "banner", ... })` as `cover` (any gradient spec works; it is drawn at the card's size, and the card's `seed` and `idPrefix` replace the spec's, see below).

- Title: uppercase, Moonhouse, the largest of 92, 84, 76, 68, 60 and 52 px that fits three lines in 1040 px; at 52 px a longer title ends its third line in `...`. Typographic punctuation (curly quotes, dashes, `…`) becomes its ASCII stand-in, because Moonhouse has no such glyphs and the renderer would draw the whole line in another face.
- Excerpt (optional, omitted when blank): Unbounded 400, 30 px, at most two lines, ending in `…`; white at 72% opacity.
- Bar: a 1 px rule 104 px from the bottom, the `DAGNAM.AI` wordmark (the `.AI` in `#ef4444`) and `dagnam.ai/blog` right-aligned.
- Passing `cover` selects this layout: `subtitle`, `eyebrow`, `footer` and `background` throw a `VisError` naming the option, as does a `theme` other than `"dark"`, a `width` other than 1200 or a `height` other than 630. `excerpt` without `cover` throws too. Without `cover`, `ogCard` is the brand card, unchanged.
- Lines are wrapped by the fonts' advance widths (generated tables in `src/brand/`, no canvas, no font parsing at run time), so the same title wraps the same way in a browser and in Node. `renderPng` draws the card in the bundled fonts.
- **The SVG names its fonts (`moonhouse` and `Unbounded`) but does not embed them.** Rasterise it with `renderPng`, or, to draw it in a browser, make both faces available under exactly those family names (an SVG shown through `<img>` or drawn onto a canvas cannot use the page's fonts: register them inside the SVG, for instance as `data:` URIs in an `@font-face`). A face under another name (the app's `Unbounded Variable`, say) is not used.
- `seed` and `idPrefix` are the card's own: the card's `seed` (default 1) overrides a `seed` inside the `cover` spec, and its `idPrefix` any `idPrefix` there. This changes nothing for `coverSpec` (the `glows` kind uses no random numbers), but a seeded kind or `grain` in a hand-written `cover` takes the card's seed, so pass the seed you want to `ogCard`.

### API conventions

A few differences between the generators are deliberate; check them before wiring two together:

- `gradient().css` is a declaration list (`background: …;`), while `pattern().cssBackground` is a bare value (`url("data:…")`) you put after `background:` yourself.
- `gradient()` returns `{ css, svg, defs, fill }` but `brandBackgroundLayers()` returns `{ defs, body }`.
- `logoSvg({ size })` is a number (a square), while gradient and pattern specs take `size: { width, height }`.
- The scenes name their colour lists differently: `brandBackground({ palette })`, `ribbon({ colors })`.

### Node API

```ts
import { appIcon, favicons, renderPng } from "@dagnam/vis/node";
import { ogCard } from "@dagnam/vis";

const png = await renderPng(ogCard({ title: "Hi" }), { width: 1200 }); // Buffer
await favicons({ outDir: "public" }); // favicon.ico/svg, apple-touch-icon, PWA icons, site.webmanifest
await appIcon({ outDir: "build/icons" }); // macOS app icon: app-icon.svg, app-icon-<16..1024>.png, app-icon.icns
```

- `renderPng(svg, { width?, background?, fontFiles? })` resolves to a PNG `Buffer`. Text is drawn with the bundled fonts only (Inter, Unbounded 400/500/700, Moonhouse; no system fonts), so output does not depend on the machine's fonts.
- `favicons({ outDir, background?, color?, name?, shortName? })` writes the files listed in `FAVICON_FILES` and resolves to their paths. Every icon draws the mark in `BRAND.mark` (the dark theme's deep red, `oklch(52.768% 0.21534 29.097)`) at `LOGO_ICON_WEIGHT` (an extra 48-unit round stroke, so the strands survive at 16 px); the plain `LOGO` and `logoSvg()` are unchanged. `site.webmanifest` has `id`, `start_url` and `scope` `"/"` and root-absolute icon `src` values (`/icon-192.png`), so serve the set from the site root and link it with `<link rel="manifest" href="/site.webmanifest">`.
- `appIcon({ outDir, background?, color? })` writes `APP_ICON_FILES`: the SVG master (`app-icon.svg`, `appIconSvg()` in the root entry: an 824 px superellipse plate on a transparent 1024 canvas, Apple's icon grid), its PNGs at 16, 32, 64, 128, 256, 512 and 1024 px and `app-icon.icns`. `icnsFromPngs(pngs)` packs square PNGs into an `.icns` with no dependency (chunk types `icp4 icp5 ic07 ic08 ic09 ic10 ic11 ic12 ic13 ic14`: `iconutil` writes ic07 to ic14 and reads icp4 and icp5).
- `icoFromPngs(pngs)` packs PNG buffers into an `.ico`; `FONT_FILES` lists the bundled font paths; `run(argv, io)` is the CLI entry (it never calls `process.exit`).

### Security

`renderPng` is meant for SVG that this package's own generators produced from validated options; it is defence in depth, not a sandbox. It refuses file and network reads through `href` (`<image>` and `<feImage>` may only use raster `data:` URIs, that is `data:image/png`, `jpeg`, `jpg`, `gif` or `webp` with a comma, never `image/svg+xml`, `text/*`, an empty type or a bare `data:,`; every other element only `#id` references; so a `gradient` overlay image must be a raster `data:` URI to render to PNG), DTD entity declarations, a DOCTYPE with an internal subset, markup it cannot classify (an unterminated comment or tag, a stray `<`), SVG text over 5,000,000 characters, more than 5000 `<clipPath>`/`<mask>` elements (a `layers` spec of more than 19 fluted-256 layers reaches this), and any output over 16384 px a side or 64 megapixels. The href check is a single linear pass over the text (it skips comments, CDATA sections and processing instructions as units and still checks tag-like text inside them), not an XML parser: it is meant to err towards rejecting, but it can in principle disagree with resvg's parser. An independent differential fuzz of about 139,000 generated documents against bare resvg-js 2.6.2 found it accepting file reads (a quote opened in a comment hiding a real `<image>`, and an SVG nested in a `data:` URL whose `<feImage>` read a file), a `data:` URL that aborted the process, and a quadratic scan; all four are fixed, a small seeded version of that differential runs in the test suite, and the fuzz was re-run. That is evidence, not a proof. It cannot make `@resvg/resvg-js` safe against hostile input: deeply chained clipPaths or masks (a chain of 20,000 crashed resvg-js 2.6.2 on macOS arm64; 10,000 rendered), a huge `patternTransform` scale, raster bombs inside `data:` PNGs and expensive filters can crash the process, exhaust memory or run for a very long time, and rendering is synchronous native work that blocks the event loop. A gradient spec from an untrusted source is untrusted input to `renderPng` too, including `dag-vis gradient --spec <someone else's file> --out x.png`: `overlay.image` accepts any `data:` URI (a raster bomb), and a spec may have up to 64 nodes, which can stack heavy layers; render such specs in a separate process with limits. Never pass SVG you did not generate to `renderPng` in a server. If you must render untrusted SVG, do it in a separate process, container or worker with memory and CPU-time limits, and expect it to fail. The default fonts are the bundled Inter only; pass `fontFiles` for CJK or emoji.

## Animated effects

Framework-free WebGL2 and Canvas2D ports of the landing-page card backgrounds, plus an animated ribbon. They are
exported from `@dagnam/vis/animate`, not from the root (their types name `HTMLCanvasElement`, and the root
type-checks without the DOM lib) (`createDither`, `createPixelBlast`, `createTerminal`, `createGlitch`,
`createRibbon`, their `*_DEFAULTS`, `COMMON_DEFAULTS`, `loopTime` and the option types). Importing the entry touches
no DOM global and creates no context: nothing happens until you call a factory and `start()` or `renderAt()`.

Fidelity vs. the current landing cards: `FIDELITY_FRONTEND_DIR=<path> npm run fidelity`. The variable is required: it must point at a checkout or an archive copy of the app whose landing page uses these effects, with a current `yarn install`; without it (or when the directory has no `node_modules`) the tool stops at once with one message. Starting that app's dev server writes into the directory (a tracked generated file and `node_modules/.vite`), so use an archive copy and never point it at a checkout other people are using; the tool never defaults to writing in another repository. The landing Dither starts its own clock a load-dependent few frames after mount, so the run fits that lag per pass (7 captures of that one card) and prints it on the page; `FIDELITY_DITHER_LAG_FRAMES=<frames>` skips the fit and uses that value (a non-negative integer, anything else is an error).

Every factory takes a `<canvas>` whose **parent** sets the size and returns an `EffectHandle`:

```ts
import { createDither } from "@dagnam/vis/animate";

const h = createDither(canvas, {
  waveSpeed: 0.15,
  waveAmplitude: 0.1,
  pixelSize: 1,
  color: "#e64040",
});
h.start(); // creates the GL context, sizes to the parent, runs renderAt(elapsed x speed)
h.update({ speed: 0.5 });
h.renderAt(2); // deterministic frame at t = 2 s (reads no clock); works without start()
h.destroy(); // releases the effect's GPU objects and observers
```

- **Common options**: `speed` (1 = today's motion), `seed` (a safe integer; the random choices of every effect but
  `createDither`, which has none; default 1), `fps` cap (60), `maxDpr` (2; read at the next resize, not by
  `update`), `autoPause` (IntersectionObserver plus `document.hidden`, default true), `loop: { duration }`
  (periodic `renderAt`: exact for `createRibbon` and `createGlitch`, which are seamless across the wrap; for
  `createDither`, `createPixelBlast` and `createTerminal`, `t` simply wraps, so they jump at the seam) and `colors`
  (a palette array: `createDither` and `createPixelBlast` read `colors[0]` as `color`, `createTerminal` as `tint`,
  `createGlitch` and `createRibbon` use all of it). Invalid values throw a `VisError`, and so does a non-finite `t`
  passed to `renderAt`. Array options (`colors`, `gridMul`) and `loop` are copied when given, so mutating them
  afterwards changes nothing.
- **The handle**: `start()`, `stop()`, `update(patch)`, `renderAt(t)` and `destroy()`, plus the read-only `canvas`,
  `running` and `duration` (the loop duration, `undefined` without a loop). `loopTime(t, loop)` is the wrap the
  runtime applies to `t` before drawing: `t` modulo `loop.duration` into `[0, duration)`, and `t` unchanged without
  a loop.
- **Reduced motion**: with `prefers-reduced-motion: reduce`, `start()` draws one static frame.
- **`update(patch)`** merges the defined keys (an `undefined` keeps the current value) and validates before applying.
  `update({ colors })` and `update({ seed })` take effect on a running effect (seed-derived values are resolved on
  every frame). `update()` cannot clear `loop` or `colors`; recreate the handle to turn either off.
- **`destroy()`** deletes the effect's GPU objects and removes its listeners but does not call `WEBGL_lose_context`:
  the canvas keeps its context, so recreating an effect on the same canvas works as long as it needs the same alpha
  mode (`createDither` and `createPixelBlast` are premultiplied, `createTerminal` is not; the other mode throws a
  `VisError`, use a fresh canvas; a 2D effect cannot share a canvas with a WebGL one). When you are done with a canvas,
  lose its context yourself after `destroy()`
  (`canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext()`): a removed canvas otherwise
  keeps its context until garbage collection, and browsers cap live contexts (16 in Chrome, which then force-loses
  the oldest). `VisBackground` gives each mount its own canvas and does this on cleanup.
- **`fps`** is a cap on the display rate: `fps: 60` on a 120 Hz display draws every second frame (60 fps). Raise it to
  follow such a display.

| factory            | source today                      | notes                                                                                             |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `createDither`     | `Dither` (three + postprocessing) | one pass; `pixelSize` in CSS px                                                                   |
| `createPixelBlast` | `PixelBlast` non-liquid           | `shape`, `patternDensity`, `edgeFade`                                                             |
| `createTerminal`   | `FaultyTerminal` (ogl)            | no mouse / page-load; only validated ranges are accepted (no negative `curvature`, `dither` 0..1) |
| `createGlitch`     | `LetterGlitch` (Canvas2D)         | deterministic in `t`; vignette drawn on the canvas                                                |
| `createRibbon`     | `scene.ribbon`                    | same `ribbonCurves`; phase 2pi per loop                                                           |

Per-effect notes:

- **`createGlitch`**: the cost grows with the canvas area (about 6 ms a frame at 1080p and 24 to 34 ms at 4K on
  software Canvas2D), so set `fps: 30` for a full-screen canvas; that helps, but a 4K frame can still exceed the
  33 ms that 30 fps allows. The tick is a fixed 50 ms by default (`glitchSpeed`); with `loop` it is stretched to
  divide the loop evenly (in a loop well under a second it can differ a lot from `glitchSpeed`), and each cell
  changes at least twice per loop so a short loop visibly moves (a one-tick loop changes once). With `smooth`, the
  colour change between palette colours really is a tween over a third of a second (the landing page's own tween
  moves one 5% step and then stalls, so its colour never reaches the new one).
- **`createRibbon`**: draws one stroke, with the opacity applied to the whole ribbon like the static SVG, not per
  line.

## Fields

Grainy, flowing colour fields: `flow` (a warped noise through a 2 to 6 colour OKLab palette; shapes `swirl`, `wave`, `aurora`, `bloom`, `band` and `noise`, with a vignette and an optional highlight), `fluid` (1 to 8 soft blobs that drift on closed paths) and `fluted` (a flow or fluid field seen through 2 to 256 reeds). Every kind takes `grain` (0 to 1), `animatedGrain` (re-seeded 24 times a second) and an integer `seed` (0 to 4294967295). One definition of the maths runs twice: on the CPU (`renderField`, the reference, DOM-free, from the root entry) and on the GPU (`createField`, a live canvas, from `./animate`).

```ts
import { fieldPresets, renderField } from "@dagnam/vis"; // DOM-free
import { createField, exportCanvas } from "@dagnam/vis/animate"; // browser only

const frame = renderField(fieldPresets["violet-dusk"], {
  width: 1200,
  height: 630,
  t: 0,
  loop: 6,
}); // { data: Uint8ClampedArray (RGBA, row 0 on top), width, height }

const handle = createField(canvas, fieldPresets.lunar, {
  loop: { duration: 6 },
});
handle.start(); // an EffectHandle like every effect above
handle.stop(); // pause a running effect before exporting from it
const mp4 = await exportCanvas(handle, { format: "mp4", fps: 30, duration: 6 }); // a Blob
```

- **Root** (`@dagnam/vis`, no DOM types): `renderField(spec, { width, height, t?, loop? })`, `fieldPresets`, `flowPresets`, `FLOW_PRESET_NAMES`, `FLOW_SHAPES`, `fieldPresetCatalog` (every preset as `{ name, label, kind }`, deep-frozen, in `fieldPresets` order; type `FieldPresetInfo`), `randomFlow({ seed?, mood? })`, the `*FieldSpec` types and `FieldPresetName` (the keys of `fieldPresets`, so `fieldPresets[name]` needs no `undefined` check). A frame is at most 16384 px a side and 2^25 pixels, and `|t|` is at most 1,000,000 s. A bad spec or option throws a `VisError` naming the parameter.
- **`./animate`**: `createField(canvas, spec, options?)` returns an `EffectHandle` (`start`, `stop`, `update`, `renderAt`, `destroy`) on the shared WebGL2 runtime. The options are the common ones; there is no `seed` or `colors` option because both live in the spec. A field never changes its spec live: `update({ spec })` throws unless the spec is equal, so `destroy()` and create a new one.
- **Presets**, in `fieldPresets` order: `violet-dusk`, `lunar`, `lagoon`, `bronze`, `sunset-ring`, `citrus-mist`, `orchid`, `lilac-wave`, `forest-glow`, `rose`, `emerald`, `glacier`, `rainbow-band`, `cobalt`, `crimson`, `pine`, `brand` (these 17 are `flowPresets`), then `fluid-dawn` and `fluted-ember`. They are frozen. `randomFlow({ seed, mood })` makes a new flow spec; `mood` is `dark` (the default), `light` or `vivid`, a tendency in the colours it picks rather than a guarantee about what the screen shows.
- **Loops**: `loop: T` samples the noise on a circle, so on the CPU the frame at `t` and at `t + T` are byte-identical. On the GPU the frames agree to the tolerance below. A loop above about 40,000 s leaves the range where that tolerance holds.
- **CPU and GPU agree to within a few 1/255, not exactly.** A shader works in float32 where the reference uses float64, so the pictures differ in the last bits. A Playwright test (`npm run test:e2e`) draws every preset in headless Chromium on SwiftShader (a software rasteriser) and compares 64 sample points per preset with `renderField`: every channel is within 2/255 (the broader replay behind it measured at most 1/255 over 1270 frames). By kind, `fluid` agreed to 0.0078/255 and `fluted` to 0.56/255 at the extremes tried. Extreme settings (nested warps at scale 10 and strength 3) can reach about 4/255. The shaders avoid the built-in `sin` and `cos`, but `pow`, `exp` and the other built-ins are the driver's. **Nothing has been verified on a real GPU, in Safari or in Firefox**; the 2/255 figure is a result for that one browser and rasteriser, not a guarantee.

### Field-preset browser

An editor that stores a `field_preset` needs a list to choose from. `fieldPresetCatalog` (root, DOM-free) is every preset as `{ name, label, kind }` in `fieldPresets` order (`"violet-dusk"` is `"Violet dusk"`, `kind` is `"flow"`, `"fluid"` or `"fluted"`), and `<FieldPresetPicker>` (`@dagnam/vis/react`) is that list as a controlled `radiogroup`, each name under a thumbnail:

```tsx
import { FieldPresetPicker } from "@dagnam/vis/react";
import { parseFieldPreset, type FieldPresetName } from "@dagnam/vis";

// A stored name that a later version removed makes the picker throw while rendering: parse it first.
function initialPreset(stored: unknown): FieldPresetName | null {
  try {
    return parseFieldPreset(stored);
  } catch {
    return null;
  }
}
const [preset, setPreset] = useState(initialPreset(stored));

<FieldPresetPicker
  value={preset}
  onChange={setPreset} // the name to store
  thumbSize={{ width: 160, height: 90 }} // the default; whole pixels, each side 1..512
  t={0} // the second of the animation the thumbnails show
  className="presets" // style `.presets [aria-checked="true"]`; the layout is a minimal grid
  aria-label="Cover look"
/>;
```

- Keyboard: the checked radio (the first when none is) is the one tab stop; the arrow keys move focus and selection together and wrap, Home and End jump to the ends, Space and Enter select. A key with Alt, Ctrl or Cmd held (Alt+Left is Back) is left to the browser. The focus ring is the browser's.
- **Cost.** The thumbnails are the CPU `renderField` frames, so the 19 of them use no WebGL context. They are drawn after mount, each in a task of its own, cancelled on unmount and when `thumbSize` or `t` change. Measured on a loaded laptop: roughly 5 to 30 ms per thumbnail and a few hundred ms for all 19 at the default 160 x 90, so the page stays responsive. **Each task blocks the page while it runs**: at the 512 px cap one thumbnail takes 250 to 380 ms, so keep thumbnails small.
- **Cache.** The newest 128 thumbnails are kept by name, size and `t`, so a picker that opens again is instant. The cache lives for the life of the page and is never released: about 7 MB at the default size, up to about 128 MB at 512 x 512. Server rendering emits the list with empty canvases.
- **Errors.** A bad `thumbSize` (a side that is not an integer in 1..512), `t` or `value` throws a `VisError` while rendering. `value` is the prop most likely to come from stored data, so run it through `parseFieldPreset` (and catch, as above) rather than passing it raw.

## Exports

Three entry points, one job each. `./animate` has `exportCanvas(handle, options)`: it drives `handle.renderAt` frame by frame (so no frame is dropped, whatever the machine's speed) and resolves to a `Blob`. `./node` has `exportStatic(spec, options)` and `exportAnimation(spec, options)`, which render a field, ribbon or gradient spec on the CPU and write a file, plus `renderSheet` (every preset in one contact sheet, as an RGBA frame), `renderRgba`, `encodePng` and `ffmpegPath`. The `dag-vis` CLI wraps the Node functions. The root has none of them.

| format    | Node (`exportStatic` / `exportAnimation`, `dag-vis export`)                     | Browser (`exportCanvas`)                       |
| --------- | ------------------------------------------------------------------------------- | ---------------------------------------------- |
| `png`     | built in (a small stdlib PNG encoder)                                           | built in (`convertToBlob`)                     |
| `svg`     | built in; a field is a raster inside the SVG, a gradient or ribbon stays vector | no                                             |
| `jpeg`    | ffmpeg                                                                          | `convertToBlob`, where the browser supports it |
| `webp`    | ffmpeg                                                                          | `convertToBlob`, where the browser supports it |
| `avif`    | ffmpeg 6 or later, built with libaom                                            | no                                             |
| `gif`     | built in (`gifenc`)                                                             | built in (`gifenc`)                            |
| `apng`    | ffmpeg                                                                          | no                                             |
| `png-seq` | built in: a folder of `frame-00000.png`, ...                                    | a zip `Blob` of the same files                 |
| `mp4`     | ffmpeg (H.264, `yuv420p`)                                                       | WebCodecs and `mp4-muxer`                      |
| `webm`    | ffmpeg (VP9, alpha optional)                                                    | WebCodecs and `webm-muxer` (alpha optional)    |

- **ffmpeg is not bundled.** The formats marked ffmpeg need it on `PATH`, or its path in the `DAG_VIS_FFMPEG` environment variable; without it they throw one `VisError` and every other format still works. The `avif` arguments are written for libaom and have not been run against a real libaom build here.
- **Guards**, checked before any frame is rendered: `fps` is an integer from 1 to 60 (default 30) and `duration` is above 0 and at most 60 s (default 6, or the handle's loop). `mp4` and `webm` need an even width and height. A GIF wider than 800 px warns (it grows fast). GIF delays are whole centiseconds and browsers show anything under 2 centiseconds as 10, so above 50 fps a GIF plays at 50 fps; it warns. `alpha: true` is rejected for `mp4`, `gif` and, in the browser, `jpeg`; `png`, `webp` and `png-seq` keep whatever transparency a frame has. In Node, `jpeg` and `avif` stills and `gif` or `mp4` frames are flattened onto `background` (black by default). `png-seq` into a folder that already holds `frame-NNNNN.png` files is refused, so two sequences never mix.
- **Cost**: Node exports render every frame on the CPU. A `flow` frame at 1920x1080 took about 2 s on a loaded laptop here (`fluid` and `fluted` about 0.25 s), so a long full-HD clip takes minutes; the browser path uses the GPU. A gradient or ribbon spec is rasterised with `@resvg/resvg-js`, a field is not.
- A Node export writes through a temporary file and a rename, so the file appears whole or not at all; the folder of `out` must exist (`png-seq` creates its own).

## React

```tsx
import { Gradient, VisBackground } from "@dagnam/vis/react";

<div className="relative h-64">
  <VisBackground
    effect="dither" // "dither" | "pixel" (createPixelBlast) | "terminal" | "glitch" | "ribbon" | "field"
    options={{ waveSpeed: 0.15, colors: ["#e64040"] }} // that effect's options, typed per effect (a field needs `spec`)
    className="absolute inset-0" // layout is yours: the wrapper only sets overflow: hidden
    onError={(e) => report(e)} // optional: no WebGL2, invalid options
  />
  <Gradient
    spec={{
      kind: "linear",
      angle: 135,
      stops: ["#0f172a", "#1d4ed8", "#e64040"],
    }}
    width={1200} // intrinsic size (default spec.size, else 1200 x 630)
    height={630}
    fit="slice" // "slice" (default, covers) | "meet" | "none"
    title="Brand gradient" // omit for a decorative gradient (aria-hidden)
  />
</div>;
```

- **One canvas per mount.** Each effect instance creates its own `<canvas>` (`aria-hidden`, `pointer-events: none`)
  in an effect, and on cleanup removes it and loses its WebGL context, so StrictMode and switching `effect` are
  safe and mounting and unmounting many backgrounds stays under the browser's cap on live contexts. The server
  renders an empty wrapper and every DOM access happens in effects.
- **Options.** A changed value is applied with `update()` on the running effect (`seed` re-phases, `colors`
  recolours); equal re-renders do nothing. Adding or removing an option key (turning `loop` on or off, dropping
  `colors`) recreates the effect, because `update()` cannot clear a value.
- **`effect="field"`** takes `options.spec`, a `FieldSpec` (required; for example `fieldPresets["fluid-dawn"]`), and
  the common options except `seed` and `colors`, which belong to the spec. A field's spec is fixed for the life of a
  handle, so a spec that changes by value recreates the effect (the canvas is replaced, and one frame of flash is
  possible); an equal spec in a fresh object does nothing, and the other options still go through `update()`. An
  invalid new spec is contained like any creation failure.
- **Failures stay local.** Invalid options (or a missing WebGL2) when the effect is created leave no canvas, call
  `onError` once (`console.error` without it) and keep the rest of the page rendering; changing the options retries.
  An invalid update keeps the canvas and the last valid options and calls `onError` once. An `onError` that itself
  throws is not contained. An unknown `effect` name (or `fit`) is a programmer error and throws a `VisError` while
  rendering.
- **Reduced motion.** The wrapper follows the runtime: under `prefers-reduced-motion: reduce` it draws one static
  frame. To draw nothing at all (what the landing page does today), do not mount it:
  `reduced ? null : <VisBackground ... />`.
- **`<Gradient>`** gets its `<defs>` ids from `useId()` unless the spec sets an `idPrefix`, so several gradients on one
  page do not collide.
- **`<FieldPresetPicker>`** is the browsable list of field presets (see Field-preset browser above).
- `react` (>= 18) is an optional peer; neither the root nor `./animate` imports it.

## CLI

```sh
npx dag-vis og --title "Build AI Systems Visually" --out og.png
npx dag-vis background --w 1500 --h 500 --focus 0.8,0.5 --out banner.svg
npx dag-vis gradient --spec spec.json --w 1200 --h 630 --out g.png
npx dag-vis pattern --spec pattern.json --out tile.svg
npx dag-vis favicons --out public
npx dag-vis app-icon --out build/icons
npx dag-vis presets                                   # every preset, one "name<TAB>kind" line each
npx dag-vis export lunar --out lunar.png --size og
npx dag-vis export fluted-ember --out ember.mp4 --w 1920 --h 1080 --fps 30 --duration 6 --loop
npx dag-vis export ./my-field.json --out seq --format png-seq
npx dag-vis sheet --out sheet.png                     # every preset in one contact sheet
```

A spec is a JSON object in a file of at most 1 MiB, for example `{ "kind": "linear", "angle": 90, "stops": ["#ef4444", "#10abba"] }` for `gradient` and `{ "kind": "dots", "spacing": 24 }` for `pattern`. Numbers are plain decimals (`600`, `0.5`). Options take `--name value` or `--name=value`. `dag-vis --help` (or `-h`, anywhere among the arguments) prints every option.

For `og`, `background`, `gradient` and `pattern`, `--out` must end in `.svg` or `.png` (any case). `.png` is rasterised with the bundled fonts (it needs `@resvg/resvg-js`) and `.svg` is written as is; anything else (`card.jpg`, `.webp`, no extension, a trailing dot, `-`) exits `1` with `dag-vis: --out must end in .svg or .png, got "card.jpg"` and writes nothing. `favicons --out` and `app-icon --out` are directories and have no extension rule. Those commands and `sheet` write files atomically (a temp file renamed over the target, so an existing file is replaced even if read-only and the new one gets the default mode) and create missing parent directories. Exit status is `0` on success and `1` with a single `dag-vis: …` line on stderr for any invalid option or spec.

`export <preset|spec.json>` takes a preset name (see `presets`) or a `.json` spec file (a field, gradient or ribbon spec). The format is the `--out` extension (`png`, `jpg`, `jpeg`, `webp`, `avif`, `svg`, `gif`, `apng`, `mp4`, `webm`) or `--format`, which also takes `png-seq` (then `--out` is the folder). The size is `--size og|square|story|wallpaper|4k|header` (1200x630, 1080x1080, 1080x1920, 2560x1440, 3840x2160, 1500x500) or `--w` and `--h` in whole pixels; the default is `og`. Animations take `--fps` (1 to 60, default 30), `--duration` (seconds, default 6), `--loop` (a seamless loop), `--alpha` (webm and apng) and `--poster FILE` (frame 0 as a PNG); stills take `--t`, the second to draw. `--quality` (0 to 1, default 0.8) applies to jpeg, webp, avif, mp4 and webm. An option that does not apply to the chosen format is an error, not ignored. Formats that need ffmpeg, its limits and the other guards are in [Exports](#exports); `export` does not create the folder of `--out`, `sheet --out` must end in `.png` and does. `sheet` takes `--tile 300x170`, `--gap` and `--columns`. `--alpha` is stricter here than in the library: the CLI accepts it only for webm and apng, while `exportAnimation` and `exportCanvas` also take `alpha: true` for `png-seq` (which always keeps transparency, so it changes nothing) and refuse it for mp4, gif and, in the browser, jpeg. A warning (a GIF over 800 px wide or over 50 fps) goes to stderr and the exit status stays `0`.

## Determinism

SVG and CSS output is a pure function of the options: every random choice comes from a seeded generator (`createRng`, mulberry32, `seed` defaults to `1`), every number the generators compute is written with at most three decimals (the embedded logo path keeps the brand asset's original precision), and `<defs>` ids are namespaced with `idPrefix` (default `"vis" + seed`). Results made with the same seed therefore share ids: two default `gradientSvg` results both define `vis1-g`, and `brandBackground` and `ogCard` both define `vis1-band`, so inlined on one page the second picks up the first's `<defs>`. Give every inline result on one page its own `seed` or `idPrefix`:

```ts
import { gradientSvg } from "@dagnam/vis";

const hero = gradientSvg({
  kind: "linear",
  stops: ["#ef4444", "#10abba"],
  idPrefix: "hero",
});
const card = gradientSvg({
  kind: "radial",
  stops: ["#ef4444", "#10abba"],
  idPrefix: "card",
});
// hero uses id="hero-g", card uses id="card-g": safe to inline together
```

Same options and seed give byte-identical strings. `tests/goldens/` pins the SVG output; regenerate it only with `UPDATE_GOLDENS=1 npx vitest run` after an intended change, and say so in the PR.

PNGs add the rasteriser: with the bundled fonts and no system fonts they are repeatable for a given `@resvg/resvg-js` build (checked here with `2.6.2` on one platform; pin the version if you need byte-identical PNGs across upgrades).

## Validation and limits

Options and gradient specs are validated at the boundary, including ones that come from untyped JavaScript or JSON: an invalid value (a wrong type, `null`, `NaN`, out of range, an unparseable colour) throws a `VisError` (`name === "VisError"`) whose message names the offending parameter and, where it is short, the value, and an unparseable colour never falls back to black. Only an `undefined` option takes its default; `null` is an error. This holds for every function the root exports that takes options or a spec, and for the colour helpers, `palette`, `fmt`, `ramp` and `createRng` (checked by feeding `null`, `NaN`, a number, a string, `{}`, `[]` and `true` to every argument and every top-level option of each, and the gradient specs by a table test over every kind and field). Two exceptions: `mix`'s `t` and `withAlpha`'s alpha must be numbers but are clamped to 0..1 (`NaN` counts as 0) instead of rejected, and the methods of the object `createRng` returns (`range`, `int`) are plain arithmetic and do not validate their arguments. Limits you can hit:

- Canvas sizes of 1 to 16384 px per side are enforced everywhere: by `gradient`, `gradientSvg` and `logoSvg`, by the scenes (`brandBackground`, `ogCard` which needs at least 16, `ribbon`), by `pattern` (`size`, `spacing`), by `renderPng` (integer `width`, and the output is also capped at 64 megapixels) and therefore by the CLI.
- `ogCard` text is at most 10,000 characters per field; titles wrap to 3 lines (2 with a subtitle), then end in `…`.
- `ribbon` has at most 400 `lines`, 1000 `samples` and 100,000 drawn points.
- `fluted` render cost is capped (`reeds` x the source's weight must not exceed 256).
- A gradient spec nests at most 16 levels (`layers` entries and fluted `source` count as a level each) and has at most 64 nodes in all (a sub-spec used twice counts twice); a cyclic spec is rejected.
- `renderPng` accepts at most 5,000,000 characters of SVG and 16 `fontFiles`.

## Known ceilings

- A `layers` gradient with `blend` on layers that are themselves multi-image (mesh, aurora, nested layers) blends differently in CSS than in SVG: the CSS output is approximate there. It is exact when each blended layer is a single CSS image (linear, radial, conic, banded) or no blend is set.
- `aurora`'s CSS and SVG forms agree to within a few percent (worst channel error about 4% measured), not exactly.
- `fluted` refraction is SVG-only: the CSS form ignores `refraction`, so the two agree exactly only at `refraction: 0`. `grain` is SVG-only too, and CSS ignores `overlay.opacity`.
- `ribbon` with a custom `path` joins its points with straight segments and does not mitre: at a sharp corner the family of lines fans out on the outside and overlaps on the inside.
- Inter has no CJK or emoji glyphs. They draw as missing-glyph boxes in PNGs unless you pass `fontFiles` that cover them and name that family in the SVG; `measureText` only estimates their width.
- Text is wrapped with Inter's advance widths and no kerning, so a line can render a few percent narrower or wider than measured. The social card does the same with Moonhouse's and Unbounded's widths (both fonts carry kerning, which resvg and browsers apply): a title or excerpt line can render about 1% narrower or wider than measured. A single word wider than 1040 px stays on its own line and overflows the card even at 52 px, as the app's canvas card did.
- Moonhouse lacks 22 Latin-1 symbols (`§ © ® ± ² ³ ¶ · ¼ ½ ¾ Ð Þ` and a few more) and, besides the punctuation the social card replaces, all non-Latin scripts and emoji. A title line containing one is drawn entirely in the fallback face (Inter), and measured with Moonhouse's `.notdef` width, so it can wrap a little early. Unbounded (the excerpt) lacks only `µ` in the measured range.
- Gradient overlay images must be raster `data:` URIs (`data:image/png`, `jpeg`, `gif` or `webp`) to rasterise (see Security); a URL, a path or an `image/svg+xml` data URI works in the CSS and SVG output only.
- `pattern(...).cssBackground` repeats seamlessly only for `dots`, `grid`, `stripes` and `lines` at multiples of 90 degrees, with the default sample size; see the `PatternResult` doc comment in [`src/pattern/types.ts`](https://github.com/Dagnam-AI/dag-vis/blob/main/src/pattern/types.ts) for the rest.
- Colours are parsed as hex, `rgb()`/`rgba()` and `oklch()` only: no CSS Color 4 `none`, no `turn`/`rad`/`grad` hue units, no `calc()`, no named colours.
- `brandBackground` reconstructs the production og-default look from parameters (deep red `BRAND.accent.dark`, a crisp outline with a faint glow, the glow pooled at the right edge); it is not a pixel match, and its defaults may be retuned after design review.

## Layering

`core ← brand ← gradient, pattern ← scene ← node`, with `field` and `export` beside that chain: each imports `core` only, and `animate` and `node` import them (the root imports `field` but never `export`; `react` imports `field` for the `FieldSpec` type and for the CPU frames of `<FieldPresetPicker>`). Enforced by eslint `no-restricted-imports` per layer and `tests/structure.test.ts`; `node:*` and `@resvg/resvg-js` are imported only under `src/node/`. No file is over 500 lines and every source file has a mirrored test.

## Develop

Contributors need **Node 22.12 or newer** (the test runner, vitest 5, requires it); the package itself needs Node 22 or newer, the only line CI tests.

```sh
npm ci
npm run check      # eslint → prettier --check → tsc --noEmit → vitest at 100% coverage
npm run build      # dist/ (+ the bundled fonts)
UPDATE_GOLDENS=1 npx vitest run   # regenerate tests/goldens after an intended change
npm run demo       # animated-effects gallery on http://localhost:5173/ (dev only, never published)
npm run test:e2e   # Playwright in headless Chromium: the gallery, the Flow page and the CPU/GPU field parity; screenshots land in screenshots/ (needs: npx playwright install chromium)
```

`npm run check` is the gate CI runs on every pull request, together with a packed-tarball smoke test (install the tarball in an empty directory, import both entries, check the types, run the CLI). Run `npm run format` before it.

The demo gallery takes `?effect=<dither|pixel|terminal|glitch|ribbon>&t=<seconds>&seed=<int>&w=<16..4096>&h=<16..4096>`: `t` freezes one frame instead of animating, and an invalid parameter shows an error instead of the cards.

The Flow page (`/flow.html` on the demo server) shows every field preset live, with buttons that export each one through `exportCanvas`; it takes `?t=<seconds>` (freeze every card), `&w=`, `&h=` (even export size), `&fps=` and `&duration=`, and at most 12 cards run at once. `tests/goldens/field-sheet.sha256` pins the contact sheet's pixels by hash. The CPU path uses `Math.sin`, `exp`, `pow` and friends, which V8 implements itself, so the hash is stable within one Node major version: it was generated on Node 24, and CI runs Node 22. If it fails there, the message prints the actual hash and the Node version; when the per-preset checks in `tests/node/sheet.test.ts` still pass, only a last bit of a maths function differs, and the fix is `UPDATE_GOLDENS=1` on the Node major CI uses, said so in the commit message.

## Motion graphics

`motion/` is where Dagnam's videos are made with [Remotion](https://www.remotion.dev) from this library's effects. It has its own dependencies, is not part of the npm package, and is not published. See [motion/README.md](motion/README.md).

## Release

Tag `vis/vX.Y.Z` on `main` (the version in `package.json` must match). `release.yml` rejects a tag that is not exactly `vis/v<digits>.<digits>.<digits>` or whose commit is not on `main` (a guard against accidental tags only; see below), re-runs CI (including the packed-tarball smoke test) on the tagged commit, holds the tarball it then publishes to the same file-list assertions, and publishes that exact tarball to npm with provenance through npm trusted publishing (OIDC), or an `NPM_TOKEN` secret as a documented fallback. A branch push never publishes. See [CHANGELOG.md](CHANGELOG.md).

Only plain `vis/vX.Y.Z` tags are supported: a prerelease suffix (`vis/v0.2.0-rc.1`) would publish to the `latest` dist-tag, so the workflow refuses it. The on-`main` check is part of the tagged commit's own workflow file, so anyone who can push a branch and a tag can edit it away: it stops accidents, not an attacker. The release is gated outside the file too: a GitHub tag ruleset on `vis/v*` restricts who can create such a tag, and the `publish` job runs in the `npm` GitHub Environment (`environment: npm`), which is limited to `vis/v*` tags. **Owner setup still required on npmjs.com:** the trusted-publisher configuration for `@dagnam/vis` must name workflow `release.yml` and environment `npm`, and the very first publish of the package (which cannot use trusted publishing, since the package must exist before a publisher can be attached) needs the `NPM_TOKEN` fallback, which may be stored as an Environment secret on `npm`.

## Fonts

`dist/node/fonts/` ships the fonts `renderPng` draws with ([`NOTICE`](NOTICE) lists them):

- **Inter 4.1** (`Inter-Regular.ttf`, `Inter-Bold.ttf`): SIL Open Font License 1.1, [`OFL.txt`](src/node/fonts/OFL.txt).
- **Unbounded** (`Unbounded-Regular.ttf`, `Unbounded-Medium.ttf`, `Unbounded-Bold.ttf`: static wght 400, 500 and 700 instances of the variable font, upstream commit and recipe in [`UNBOUNDED-SOURCE.txt`](src/node/fonts/UNBOUNDED-SOURCE.txt), so SVG text can use `font-family="Unbounded"` with `font-weight` 400, 500 or 700): SIL Open Font License 1.1, [`OFL-Unbounded.txt`](src/node/fonts/OFL-Unbounded.txt).
- **Moonhouse** (`moonhouse/moonhouse.ttf`, Copyright (c) 2013 by NimaVisual, licensor Andres Moreno W. / NimaVisual), byte for byte as received. Its embedded licence forbids modification and redistribution without written permission. It is bundled unmodified, on the package owner's confirmation (recorded 2026-10-25) that Dagnam has NimaVisual's permission; the grant itself is not kept in this repository. Removing it is one directory (`src/node/fonts/moonhouse/`) and one entry in `FONT_FILES` (`src/node/render-png.ts`); the licence text is in [`LICENSE-NOTE.txt`](src/node/fonts/moonhouse/LICENSE-NOTE.txt).

The advance tables behind the social card's wrapping (`src/brand/moonhouse-metrics.ts`, `src/brand/unbounded-metrics.ts`) are generated from these files by `node scripts/gen-font-metrics.mjs` (`--check` fails when they are stale; a test runs it).

Tables for the 500 and 700 faces (`src/brand/unbounded-500-metrics.ts`, `src/brand/unbounded-700-metrics.ts`) are generated the same way, for wrapping text set in those weights. No built-in layout uses them yet (the social card is set in Unbounded 400), and they are not exported from the package.

## Licence

Apache-2.0, see [LICENSE](LICENSE). The bundled fonts have their own licences, see Fonts above and [NOTICE](NOTICE): Inter 4.1 and Unbounded under the SIL Open Font License 1.1, Moonhouse under its own terms (permission to redistribute still to be confirmed).
