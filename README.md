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
- **Gradients**: `gradient(spec)` returns `{ css, svg, defs, fill }`: `css` is a declaration list (`background: …;`, plus `background-blend-mode` when needed), `svg` is body markup to pair with `defs`. `gradientSvg(spec, size?)` is a standalone `<svg>` document. `animatedGradientCss(spec, { kind: "rotate" | "shift" | "hue" })` returns `{ css, keyframes }` with a `prefers-reduced-motion` override; `freeformPalette(name)` (`dawn`, `aurora`, `ember`, `brand`) and `freeformRandom({ count, palette, seed })` build freeform points.
  - Kinds: `linear`, `radial`, `conic` (all three take `repeat`, `reverse` and per-stop `opacity`), `mesh`, `aurora`, `banded`, `layers` (with `blend`), `freeform` and `fluted` (reeded glass over any other spec). Any spec also takes `size`, `grain`, `overlay`, `seed` and `idPrefix`.
  - A stop is a colour string or `{ color, at?, opacity? }`.
- **Patterns**: `pattern(spec)` returns `{ svg, defs, fill, cssBackground, tile }`. Kinds: `dots`, `grid`, `lines`, `stripes`, `dagMesh`, `contours`, `noise`.
- **Scenes**: `brandBackground(opts)` (and `brandBackgroundLayers` for composition), `ogCard(opts)` (`title`, `subtitle`, `eyebrow`, `footer`, `theme`, `background`), `ribbon(opts)` (SVG) and `ribbonCurves(opts)` (the pure curve geometry).
- **Text and core helpers**: `measureText`, `wrapText`, `FONT_FAMILY`, `createRng`, `fmt`, colour helpers (`parseColor`, `toHex`, `toCss`, `mix`, `ramp`, `withAlpha`, `toVec3`), the SVG builder (`el`, `svgDoc`, `text`, `escapeAttr`), `focalTransform`, `VisError`.

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

`renderPng` is meant for SVG that this package's own generators produced from validated options; it is defence in depth, not a sandbox. It refuses file and network reads through `href` (`<image>` and `<feImage>` may only use `data:` URIs with a comma, every other element only `#id` references, so a `gradient` overlay image must be a `data:` URI to render to PNG), DTD entity declarations, SVG text over 5,000,000 characters, more than 5000 `<clipPath>`/`<mask>` elements (a `layers` spec of more than 19 fluted-256 layers reaches this), and any output over 16384 px a side or 64 megapixels. The href check is a text scan, not an XML parser: it can only err towards rejecting, but it can in principle disagree with resvg's parser. It cannot make `@resvg/resvg-js` safe against hostile input: deeply chained clipPaths or masks (a chain of 20,000 crashed resvg-js 2.6.2 on macOS arm64; 10,000 rendered), a huge `patternTransform` scale, raster bombs inside `data:` PNGs and expensive filters can crash the process, exhaust memory or run for a very long time, and rendering is synchronous native work that blocks the event loop. Never pass SVG you did not generate to `renderPng` in a server. If you must render untrusted SVG, do it in a separate process, container or worker with memory and CPU-time limits, and expect it to fail. The default fonts are the bundled Inter only; pass `fontFiles` for CJK or emoji.

## CLI

```sh
npx dag-vis og --title "Build AI Systems Visually" --out og.png
npx dag-vis background --w 1500 --h 500 --focus 0.8,0.5 --out banner.svg
npx dag-vis gradient --spec spec.json --w 1200 --h 630 --out g.png
npx dag-vis pattern --spec pattern.json --out tile.svg
npx dag-vis favicons --out public
```

A spec is a JSON object in a file of at most 1 MiB, for example `{ "kind": "linear", "angle": 90, "stops": ["#ef4444", "#10abba"] }` for `gradient` and `{ "kind": "dots", "spacing": 24 }` for `pattern`. Numbers are plain decimals (`600`, `0.5`). Options take `--name value` or `--name=value`. `dag-vis --help` prints every option.

An `--out` ending in `.png` is rasterised with the bundled Inter (it needs `@resvg/resvg-js`); **any other extension writes SVG text**, so `--out card.jpg` produces an SVG file named `card.jpg`. Files are written atomically and missing parent directories are created. Exit status is `0` on success and `1` with a single `dag-vis: …` line on stderr for any invalid option or spec.

## Determinism

SVG and CSS output is a pure function of the options: every random choice comes from a seeded generator (`createRng`, mulberry32, `seed` defaults to `1`), every number the generators compute is written with at most three decimals (the embedded logo path keeps the brand asset's original precision), and `<defs>` ids are namespaced with `idPrefix` (default `"vis" + seed`) so two results can share a page. Same options and seed give byte-identical strings. `tests/goldens/` pins the SVG output; regenerate it only with `UPDATE_GOLDENS=1 npx vitest run` after an intended change, and say so in the PR.

PNGs add the rasteriser: with the bundled fonts and no system fonts they are repeatable for a given `@resvg/resvg-js` build (checked here with `2.6.2` on one platform; pin the version if you need byte-identical PNGs across upgrades).

## Validation and limits

Typed options and gradient specs from untyped JavaScript or JSON are validated at the boundary: an invalid value throws a `VisError` (`name === "VisError"`) whose message names the offending parameter and value (a `null`, a wrong type or a missing required field included, never a plain `TypeError`), and an unparseable colour never falls back to black. Only an `undefined` field takes its default. Limits you can hit:

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
- `pattern(...).cssBackground` repeats seamlessly only for `dots`, `grid`, `stripes` and `lines` at multiples of 90 degrees, with the default sample size; see the `PatternResult` doc comment in `src/pattern/types.ts` for the rest.
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

Tag `vis/vX.Y.Z` on `main` (the version in `package.json` must match). `release.yml` rejects a tag that is not exactly `vis/v<digits>.<digits>.<digits>` or whose commit is not on `main`, re-runs CI (including the packed-tarball smoke test) on the tagged commit, holds the tarball it then publishes to the same file-list assertions, and publishes that exact tarball to npm with provenance through npm trusted publishing (OIDC), or an `NPM_TOKEN` repository secret as a documented fallback. A branch push never publishes. See [CHANGELOG.md](CHANGELOG.md).

Only plain `vis/vX.Y.Z` tags are supported: a prerelease suffix (`vis/v0.2.0-rc.1`) would publish to the `latest` dist-tag, so the workflow refuses it. Anyone who can push a `vis/v*` tag can start a release, so restrict who can create those tags with a GitHub tag ruleset (recommended).

## Licence

Apache-2.0, see [LICENSE](LICENSE). The bundled fonts are Inter 4.1 under the SIL Open Font License 1.1 (`src/node/fonts/OFL.txt`, shipped as `dist/node/fonts/OFL.txt`).
