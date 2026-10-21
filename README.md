# dag-vis — `@dagnam/vis`

Deterministic, parameterised [Dagnam.AI](https://dagnam.ai) visuals: brand tokens, gradients, patterns, social-preview (OG) cards, ribbons and favicon sets. Generators are pure functions that return SVG or CSS strings; a small Node layer turns them into PNGs.

| import                             | what                                                                            | runtime deps                 |
| ---------------------------------- | ------------------------------------------------------------------------------- | ---------------------------- |
| `@dagnam/vis`                      | brand tokens, gradients, patterns, scenes (SVG + CSS strings), browser-safe     | none                         |
| `@dagnam/vis/node` + `dag-vis` CLI | PNG rendering, favicon sets, the CLI (bundled Inter font)                       | `@resvg/resvg-js` (optional) |
| `@dagnam/vis/react`                | **planned, not in 0.1.0**: the export path is reserved and does not resolve yet | `react` (peer)               |

Seeded generators take `seed` (default `1`); all output is deterministic, so the same options and seed give byte-identical SVG and CSS (`logoSvg` and `animatedGradientCss` take no seed).

## Install

```sh
npm i @dagnam/vis            # browser-safe: no native code, no dependencies
npm i @resvg/resvg-js        # only to render PNGs: `@dagnam/vis/node`, the CLI, favicons (use -D if you only render at build time)
```

`@resvg/resvg-js` is an optional peer dependency (tested with `2.6.2`); install it as a regular dependency if you render at runtime, because production installs omit devDependencies. `renderPng` loads it lazily and throws a `VisError` naming the install command when it is absent, so `@dagnam/vis/node` itself still imports without it. The root entry never touches it and imports no `node:*` module, so it is safe in a browser bundle. Consumers need Node 20 or newer.

## Use

```ts
import {
  brandBackground,
  gradient,
  gradientSvg,
  freeformPalette,
  ogCard,
  pattern,
  ribbon,
} from "@dagnam/vis";

brandBackground({ width: 1200, height: 630 }); // the og-default look, any size (SVG string)
ogCard({ title: "Build AI Systems Visually", subtitle: "Dagnam.AI" }); // SVG with real Inter metrics
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
  - Kinds: `linear`, `radial`, `conic` (all three take `repeat`, `reverse` and per-stop `opacity`), `mesh`, `aurora`, `banded`, `layers` (with `blend`), `freeform` and `fluted` (reeded glass over any other spec). Any spec also takes `size`, `grain`, `overlay`, `seed` and `idPrefix`.
  - A stop is a colour string or `{ color, at?, opacity? }`.
- **Patterns**: `pattern(spec)` returns `{ svg, defs, fill, cssBackground, tile }`. Kinds: `dots`, `grid`, `lines`, `stripes`, `dagMesh`, `contours`, `noise`.
- **Scenes**: `brandBackground(opts)` (and `brandBackgroundLayers` for composition), `ogCard(opts)` (`title`, `subtitle`, `eyebrow`, `footer`, `theme`, `background`), `ribbon(opts)` (SVG) and `ribbonCurves(opts)` (the pure curve geometry).
- **Text and core helpers**: `measureText`, `wrapText`, `FONT_FAMILY`, `createRng`, `fmt`, colour helpers (`parseColor`, `toHex`, `toCss`, `mix`, `ramp`, `withAlpha`, `toVec3`), `VisError`. `measureText` and `wrapText` take at most 10,000 characters of text and `wrapText` returns at most 100 lines. The SVG builder, the validators, the stop pipeline, the geometry helpers and the font metrics are internal and not exported.

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

- `renderPng(svg, { width?, background?, fontFiles? })` resolves to a PNG `Buffer`. Text is drawn with the bundled Inter only (no system fonts), so output does not depend on the machine's fonts.
- `favicons({ outDir, background?, color?, name?, shortName? })` writes the files listed in `FAVICON_FILES` and resolves to their paths.
- `icoFromPngs(pngs)` packs PNG buffers into an `.ico`; `FONT_FILES` lists the bundled font paths; `run(argv, io)` is the CLI entry (it never calls `process.exit`).

### Security

`renderPng` is meant for SVG that this package's own generators produced from validated options; it is defence in depth, not a sandbox. It refuses file and network reads through `href` (`<image>` and `<feImage>` may only use `data:` URIs with a comma, every other element only `#id` references, so a `gradient` overlay image must be a `data:` URI to render to PNG), DTD entity declarations, SVG text over 5,000,000 characters, more than 5000 `<clipPath>`/`<mask>` elements (a `layers` spec of more than 19 fluted-256 layers reaches this), and any output over 16384 px a side or 64 megapixels. The href check is a text scan, not an XML parser: it can only err towards rejecting, but it can in principle disagree with resvg's parser. It cannot make `@resvg/resvg-js` safe against hostile input: deeply chained clipPaths or masks (a chain of 20,000 crashed resvg-js 2.6.2 on macOS arm64; 10,000 rendered), a huge `patternTransform` scale, raster bombs inside `data:` PNGs and expensive filters can crash the process, exhaust memory or run for a very long time, and rendering is synchronous native work that blocks the event loop. A gradient spec from an untrusted source is untrusted input to `renderPng` too, including `dag-vis gradient --spec <someone else's file> --out x.png`: `overlay.image` accepts any `data:` URI (a raster bomb), and a spec may have up to 64 nodes, which can stack heavy layers; render such specs in a separate process with limits. Never pass SVG you did not generate to `renderPng` in a server. If you must render untrusted SVG, do it in a separate process, container or worker with memory and CPU-time limits, and expect it to fail. The default fonts are the bundled Inter only; pass `fontFiles` for CJK or emoji.

## CLI

```sh
npx dag-vis og --title "Build AI Systems Visually" --out og.png
npx dag-vis background --w 1500 --h 500 --focus 0.8,0.5 --out banner.svg
npx dag-vis gradient --spec spec.json --w 1200 --h 630 --out g.png
npx dag-vis pattern --spec pattern.json --out tile.svg
npx dag-vis favicons --out public
```

A spec is a JSON object in a file of at most 1 MiB, for example `{ "kind": "linear", "angle": 90, "stops": ["#ef4444", "#10abba"] }` for `gradient` and `{ "kind": "dots", "spacing": 24 }` for `pattern`. Numbers are plain decimals (`600`, `0.5`). Options take `--name value` or `--name=value`. `dag-vis --help` (or `-h`, anywhere among the arguments) prints every option.

For `og`, `background`, `gradient` and `pattern`, `--out` must end in `.svg` or `.png` (any case). `.png` is rasterised with the bundled Inter (it needs `@resvg/resvg-js`) and `.svg` is written as is; anything else (`card.jpg`, `.webp`, no extension, a trailing dot, `-`) exits `1` with `dag-vis: --out must end in .svg or .png, got "card.jpg"` and writes nothing. `favicons --out` is a directory and has no extension rule. Files are written atomically (a temp file renamed over the target, so an existing file is replaced even if read-only and the new one gets the default mode) and missing parent directories are created. Exit status is `0` on success and `1` with a single `dag-vis: …` line on stderr for any invalid option or spec.

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
- Text is wrapped with Inter's advance widths and no kerning, so a line can render a few percent narrower or wider than measured.
- Gradient overlay images must be `data:` URIs to rasterise (see Security); a URL or path works in the CSS and SVG output only.
- `pattern(...).cssBackground` repeats seamlessly only for `dots`, `grid`, `stripes` and `lines` at multiples of 90 degrees, with the default sample size; see the `PatternResult` doc comment in [`src/pattern/types.ts`](https://github.com/Dagnam-AI/dag-vis/blob/main/src/pattern/types.ts) for the rest.
- Colours are parsed as hex, `rgb()`/`rgba()` and `oklch()` only: no CSS Color 4 `none`, no `turn`/`rad`/`grad` hue units, no `calc()`, no named colours.
- `brandBackground` reconstructs the production og-default look from parameters; it is not a pixel match, and its defaults may be retuned after design review.

## Layering

`core ← brand ← gradient, pattern ← scene ← node`. Enforced by eslint `no-restricted-imports` per layer and `tests/structure.test.ts`; `node:*` and `@resvg/resvg-js` are imported only under `src/node/`. No file is over 500 lines and every source file has a mirrored test.

## Develop

Contributors need **Node 22.12 or newer** (the test runner, vitest 5, requires it); the package itself runs on Node 20 or newer.

```sh
npm ci
npm run check      # eslint → prettier --check → tsc --noEmit → vitest at 100% coverage
npm run build      # dist/ (+ bundled Inter fonts)
UPDATE_GOLDENS=1 npx vitest run   # regenerate tests/goldens after an intended change
```

`npm run check` is the gate CI runs on every pull request, together with a packed-tarball smoke test (install the tarball in an empty directory, import both entries, check the types, run the CLI). Run `npm run format` before it.

## Release

Tag `vis/vX.Y.Z` on `main` (the version in `package.json` must match). `release.yml` rejects a tag that is not exactly `vis/v<digits>.<digits>.<digits>` or whose commit is not on `main` (a guard against accidental tags only; see below), re-runs CI (including the packed-tarball smoke test) on the tagged commit, holds the tarball it then publishes to the same file-list assertions, and publishes that exact tarball to npm with provenance through npm trusted publishing (OIDC), or an `NPM_TOKEN` repository secret as a documented fallback. A branch push never publishes. See [CHANGELOG.md](CHANGELOG.md).

Only plain `vis/vX.Y.Z` tags are supported: a prerelease suffix (`vis/v0.2.0-rc.1`) would publish to the `latest` dist-tag, so the workflow refuses it. The on-`main` check is part of the tagged commit's own workflow file, so anyone who can push a branch and a tag can edit it away: it stops accidents, not an attacker. **Required owner setup before the first tag:** (a) a GitHub tag ruleset restricting who can create `vis/v*` tags, and (b) a protected GitHub Environment (for example `npm`) limited to `vis/v*` tags and bound in npm's trusted-publisher configuration for `@dagnam/vis`; then add `environment: npm` to the publish job in `release.yml` (it is not there yet, because the environment must exist first and the `NPM_TOKEN` fallback has to keep working until it does).

## Licence

Apache-2.0, see [LICENSE](LICENSE). The bundled fonts are Inter 4.1 under the SIL Open Font License 1.1 (`src/node/fonts/OFL.txt`, shipped as `dist/node/fonts/OFL.txt`).
