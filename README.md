# dag-vis — `@dagnam/vis`

Deterministic, parameterised [Dagnam.AI](https://dagnam.ai) visuals: brand tokens, gradients, patterns, social-preview (OG) cards, ribbons and favicon sets. Generators are pure functions that return SVG or CSS strings; a small Node layer turns them into PNGs.

| import                             | what                                                                                        | runtime deps                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| `@dagnam/vis`                      | brand tokens, gradients, patterns, scenes (SVG + CSS strings), browser-safe                 | none                         |
| `@dagnam/vis/node` + `dag-vis` CLI | PNG rendering, favicon sets, the CLI (bundled Inter, Unbounded and Moonhouse fonts)         | `@resvg/resvg-js` (optional) |
| `@dagnam/vis/animate`              | the animated effects (`createDither`, `createGlitch`, ...): WebGL2 / Canvas2D, browser only | none                         |
| `@dagnam/vis/react`                | `<VisBackground>` (the animated effects) and `<Gradient>` for React 18 and 19               | `react` (optional peer)      |

Seeded generators take `seed` (default `1`); all output is deterministic, so the same options and seed give byte-identical SVG and CSS (`logoSvg` and `animatedGradientCss` take no seed).

## Install

```sh
npm i @dagnam/vis            # browser-safe: no native code, no dependencies
npm i @resvg/resvg-js        # only to render PNGs: `@dagnam/vis/node`, the CLI, favicons (use -D if you only render at build time)
```

`@resvg/resvg-js` is an optional peer dependency (tested with `2.6.2`); install it as a regular dependency if you render at runtime, because production installs omit devDependencies. `renderPng` loads it lazily and throws a `VisError` naming the install command when it is absent, so `@dagnam/vis/node` itself still imports without it. The root entry never touches it and imports no `node:*` module, so it is safe in a browser bundle. Consumers need Node 22 or newer (Node 20 is end-of-life and receives no security fixes).

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
ogCard({ title: "Build AI Systems Visually", subtitle: "Dagnam.AI" }); // SVG with real Inter metrics
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
- **Scenes**: `brandBackground(opts)` (and `brandBackgroundLayers` for composition), `ogCard(opts)` (`title`, `subtitle`, `eyebrow`, `footer`, `theme`, `background`; or `title`, `excerpt` and `cover` for the social card), `ribbon(opts)` (SVG) and `ribbonCurves(opts)` (the pure curve geometry).
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
import { favicons, renderPng } from "@dagnam/vis/node";
import { ogCard } from "@dagnam/vis";

const png = await renderPng(ogCard({ title: "Hi" }), { width: 1200 }); // Buffer
await favicons({ outDir: "public" }); // favicon.ico/svg, apple-touch-icon, PWA icons, site.webmanifest
```

- `renderPng(svg, { width?, background?, fontFiles? })` resolves to a PNG `Buffer`. Text is drawn with the bundled fonts only (Inter, Unbounded, Moonhouse; no system fonts), so output does not depend on the machine's fonts.
- `favicons({ outDir, background?, color?, name?, shortName? })` writes the files listed in `FAVICON_FILES` and resolves to their paths. The icon `src` values in `site.webmanifest` are relative (`icon-192.png`, not `/icon-192.png`), so they resolve against the manifest's own URL and work at the site root and under any sub-path; serve the icons next to the manifest and link it with `<link rel="manifest" href="site.webmanifest">` (a path relative to the page, or an absolute one for a root deployment).
- `icoFromPngs(pngs)` packs PNG buffers into an `.ico`; `FONT_FILES` lists the bundled font paths; `run(argv, io)` is the CLI entry (it never calls `process.exit`).

### Security

`renderPng` is meant for SVG that this package's own generators produced from validated options; it is defence in depth, not a sandbox. It refuses file and network reads through `href` (`<image>` and `<feImage>` may only use raster `data:` URIs, that is `data:image/png`, `jpeg`, `jpg`, `gif` or `webp` with a comma, never `image/svg+xml`, `text/*`, an empty type or a bare `data:,`; every other element only `#id` references; so a `gradient` overlay image must be a raster `data:` URI to render to PNG), DTD entity declarations, a DOCTYPE with an internal subset, markup it cannot classify (an unterminated comment or tag, a stray `<`), SVG text over 5,000,000 characters, more than 5000 `<clipPath>`/`<mask>` elements (a `layers` spec of more than 19 fluted-256 layers reaches this), and any output over 16384 px a side or 64 megapixels. The href check is a single linear pass over the text (it skips comments, CDATA sections and processing instructions as units and still checks tag-like text inside them), not an XML parser: it is meant to err towards rejecting, but it can in principle disagree with resvg's parser. An independent differential fuzz of about 139,000 generated documents against bare resvg-js 2.6.2 found it accepting file reads (a quote opened in a comment hiding a real `<image>`, and an SVG nested in a `data:` URL whose `<feImage>` read a file), a `data:` URL that aborted the process, and a quadratic scan; all four are fixed, a small seeded version of that differential runs in the test suite, and the fuzz was re-run. That is evidence, not a proof. It cannot make `@resvg/resvg-js` safe against hostile input: deeply chained clipPaths or masks (a chain of 20,000 crashed resvg-js 2.6.2 on macOS arm64; 10,000 rendered), a huge `patternTransform` scale, raster bombs inside `data:` PNGs and expensive filters can crash the process, exhaust memory or run for a very long time, and rendering is synchronous native work that blocks the event loop. A gradient spec from an untrusted source is untrusted input to `renderPng` too, including `dag-vis gradient --spec <someone else's file> --out x.png`: `overlay.image` accepts any `data:` URI (a raster bomb), and a spec may have up to 64 nodes, which can stack heavy layers; render such specs in a separate process with limits. Never pass SVG you did not generate to `renderPng` in a server. If you must render untrusted SVG, do it in a separate process, container or worker with memory and CPU-time limits, and expect it to fail. The default fonts are the bundled Inter only; pass `fontFiles` for CJK or emoji.

## Animated effects

Framework-free WebGL2 and Canvas2D ports of the landing-page card backgrounds, plus an animated ribbon. They are
exported from `@dagnam/vis/animate`, not from the root (their types name `HTMLCanvasElement`, and the root
type-checks without the DOM lib) (`createDither`, `createPixelBlast`, `createTerminal`, `createGlitch`,
`createRibbon`, their `*_DEFAULTS`, `COMMON_DEFAULTS`, `loopTime` and the option types). Importing the entry touches
no DOM global and creates no context: nothing happens until you call a factory and `start()` or `renderAt()`.

Fidelity vs. the current landing cards: `npm run fidelity` (needs a sibling `mvp-frontend` with a current `yarn install`, else it stops at once with a message; starting Vite there rewrites one tracked generated file, byte-identical on a clean `main`, so set `FIDELITY_FRONTEND_DIR` to an archive copy to leave that checkout untouched). The landing Dither starts its own clock a load-dependent few frames after mount, so the run fits that lag per pass (7 captures of that one card) and prints it on the page; `FIDELITY_DITHER_LAG_FRAMES=<frames>` skips the fit and uses that value (a non-negative integer, anything else is an error).

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
  `VisError`, use a fresh canvas; a 2D effect cannot share a canvas with a WebGL one). To release the context itself,
  remove the canvas and drop every reference to it, including `handle.canvas`; give each mount its own canvas
  (`VisBackground` does).
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

## React

```tsx
import { Gradient, VisBackground } from "@dagnam/vis/react";

<div className="relative h-64">
  <VisBackground
    effect="dither" // "dither" | "pixel" (createPixelBlast) | "terminal" | "glitch" | "ribbon"
    options={{ waveSpeed: 0.15, colors: ["#e64040"] }} // that effect's options, typed per effect
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
  in an effect and removes it on cleanup, so StrictMode and switching `effect` are safe. The server renders an empty
  wrapper and every DOM access happens in effects.
- **Options.** A changed value is applied with `update()` on the running effect (`seed` re-phases, `colors`
  recolours); equal re-renders do nothing. Adding or removing an option key (turning `loop` on or off, dropping
  `colors`) recreates the effect, because `update()` cannot clear a value.
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
- `react` (>= 18) is an optional peer; neither the root nor `./animate` imports it.

## CLI

```sh
npx dag-vis og --title "Build AI Systems Visually" --out og.png
npx dag-vis background --w 1500 --h 500 --focus 0.8,0.5 --out banner.svg
npx dag-vis gradient --spec spec.json --w 1200 --h 630 --out g.png
npx dag-vis pattern --spec pattern.json --out tile.svg
npx dag-vis favicons --out public
```

A spec is a JSON object in a file of at most 1 MiB, for example `{ "kind": "linear", "angle": 90, "stops": ["#ef4444", "#10abba"] }` for `gradient` and `{ "kind": "dots", "spacing": 24 }` for `pattern`. Numbers are plain decimals (`600`, `0.5`). Options take `--name value` or `--name=value`. `dag-vis --help` (or `-h`, anywhere among the arguments) prints every option.

For `og`, `background`, `gradient` and `pattern`, `--out` must end in `.svg` or `.png` (any case). `.png` is rasterised with the bundled fonts (it needs `@resvg/resvg-js`) and `.svg` is written as is; anything else (`card.jpg`, `.webp`, no extension, a trailing dot, `-`) exits `1` with `dag-vis: --out must end in .svg or .png, got "card.jpg"` and writes nothing. `favicons --out` is a directory and has no extension rule. Files are written atomically (a temp file renamed over the target, so an existing file is replaced even if read-only and the new one gets the default mode) and missing parent directories are created. Exit status is `0` on success and `1` with a single `dag-vis: …` line on stderr for any invalid option or spec.

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
- `brandBackground` reconstructs the production og-default look from parameters; it is not a pixel match, and its defaults may be retuned after design review.

## Layering

`core ← brand ← gradient, pattern ← scene ← node`. Enforced by eslint `no-restricted-imports` per layer and `tests/structure.test.ts`; `node:*` and `@resvg/resvg-js` are imported only under `src/node/`. No file is over 500 lines and every source file has a mirrored test.

## Develop

Contributors need **Node 22.12 or newer** (the test runner, vitest 5, requires it); the package itself needs Node 22 or newer, the only line CI tests.

```sh
npm ci
npm run check      # eslint → prettier --check → tsc --noEmit → vitest at 100% coverage
npm run build      # dist/ (+ the bundled fonts)
UPDATE_GOLDENS=1 npx vitest run   # regenerate tests/goldens after an intended change
npm run demo       # animated-effects gallery on http://localhost:5173/ (dev only, never published)
npm run test:e2e   # Playwright smoke of the gallery in headless Chromium; screenshots land in screenshots/ (needs: npx playwright install chromium)
```

`npm run check` is the gate CI runs on every pull request, together with a packed-tarball smoke test (install the tarball in an empty directory, import both entries, check the types, run the CLI). Run `npm run format` before it.

The demo gallery takes `?effect=<dither|pixel|terminal|glitch|ribbon>&t=<seconds>&seed=<int>&w=<16..4096>&h=<16..4096>`: `t` freezes one frame instead of animating, and an invalid parameter shows an error instead of the cards.

## Release

Tag `vis/vX.Y.Z` on `main` (the version in `package.json` must match). `release.yml` rejects a tag that is not exactly `vis/v<digits>.<digits>.<digits>` or whose commit is not on `main` (a guard against accidental tags only; see below), re-runs CI (including the packed-tarball smoke test) on the tagged commit, holds the tarball it then publishes to the same file-list assertions, and publishes that exact tarball to npm with provenance through npm trusted publishing (OIDC), or an `NPM_TOKEN` secret as a documented fallback. A branch push never publishes. See [CHANGELOG.md](CHANGELOG.md).

Only plain `vis/vX.Y.Z` tags are supported: a prerelease suffix (`vis/v0.2.0-rc.1`) would publish to the `latest` dist-tag, so the workflow refuses it. The on-`main` check is part of the tagged commit's own workflow file, so anyone who can push a branch and a tag can edit it away: it stops accidents, not an attacker. The release is gated outside the file too: a GitHub tag ruleset on `vis/v*` restricts who can create such a tag, and the `publish` job runs in the `npm` GitHub Environment (`environment: npm`), which is limited to `vis/v*` tags. **Owner setup still required on npmjs.com:** the trusted-publisher configuration for `@dagnam/vis` must name workflow `release.yml` and environment `npm`, and the very first publish of the package (which cannot use trusted publishing, since the package must exist before a publisher can be attached) needs the `NPM_TOKEN` fallback, which may be stored as an Environment secret on `npm`.

## Fonts

`dist/node/fonts/` ships the fonts `renderPng` draws with ([`NOTICE`](NOTICE) lists them):

- **Inter 4.1** (`Inter-Regular.ttf`, `Inter-Bold.ttf`): SIL Open Font License 1.1, [`OFL.txt`](src/node/fonts/OFL.txt).
- **Unbounded** (`Unbounded-Regular.ttf`, a static wght 400 instance of the variable font): SIL Open Font License 1.1, [`OFL-Unbounded.txt`](src/node/fonts/OFL-Unbounded.txt).
- **Moonhouse** (`moonhouse/moonhouse.ttf`, Copyright (c) 2013 by NimaVisual, licensor Andres Moreno W. / NimaVisual), byte for byte as received. **Its embedded licence forbids modification and redistribution without written permission. It is bundled at the package owner's instruction; confirm the permission with NimaVisual or replace the font before relying on it.** Removing it is one directory (`src/node/fonts/moonhouse/`) and one entry in `FONT_FILES` (`src/node/render-png.ts`); the licence text is in [`LICENSE-NOTE.txt`](src/node/fonts/moonhouse/LICENSE-NOTE.txt).

The advance tables behind the social card's wrapping (`src/brand/moonhouse-metrics.ts`, `src/brand/unbounded-metrics.ts`) are generated from these files by `node scripts/gen-font-metrics.mjs` (`--check` fails when they are stale; a test runs it).

## Licence

Apache-2.0, see [LICENSE](LICENSE). The bundled fonts have their own licences, see Fonts above and [NOTICE](NOTICE): Inter 4.1 and Unbounded under the SIL Open Font License 1.1, Moonhouse under its own terms (permission to redistribute still to be confirmed).
