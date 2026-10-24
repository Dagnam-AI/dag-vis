# Changelog

All notable changes to `@dagnam/vis` are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/). A release is the tag
`vis/vX.Y.Z` on `main`; `package.json` is the single source of the version.

## [Unreleased]

### Added

- Gradients: the `glows` kind (`GlowsSpec`, `GlowPoint`): elliptical glows sized and placed in percent of the box, fading to transparent at 70%, over a base colour; later glows paint over earlier ones, at most 64; CSS and SVG agree (a radius is at least half a pixel in both; in the CSS that is exact only when the box it is applied to has the spec's `size`, because the clamp is computed in px).
- Covers: `coverSpec` and `coverLayers` (plus the `CoverInput`, `CoverLayers` and `CoverGlow` types): deterministic generated covers, one look per family, nudged per item.
- Scenes: the social card. `ogCard({ title, excerpt?, cover })` (new `cover` and `excerpt` options) draws the 1200×630 per-post `og:image`: the `cover` gradient spec as background, the title uppercase in Moonhouse (92 px stepping down to 52 to fit three lines, then `...`), the excerpt in Unbounded (30 px, two lines) and a Dagnam.AI bar. `subtitle`, `eyebrow`, `footer`, `background`, a light theme and any other size throw a `VisError` with `cover`; `excerpt` without `cover` throws; the brand card is unchanged.
- Node: `renderPng` and `FONT_FILES` now bundle Unbounded (static wght 400, SIL OFL 1.1) and Moonhouse (NimaVisual; bundled unmodified at the package owner's instruction, its terms require written permission for redistribution: confirm or replace it before relying on it). New `NOTICE` lists the bundled fonts; `scripts/gen-font-metrics.mjs` generates their advance tables.
- Animate: framework-free WebGL2 / Canvas2D effects, exported from the `@dagnam/vis/animate` entry (not the root: their types name `HTMLCanvasElement`, and the root stays DOM-free so a Node-only project type-checks without the DOM lib): `createDither`, `createPixelBlast`, `createTerminal` and `createGlitch` (ports of the landing-page card backgrounds) and `createRibbon` (the animated `scene.ribbon`). Each returns an `EffectHandle`: `start`, `stop`, `update(patch)`, `renderAt(t)` and `destroy()`, plus the read-only `canvas`, `running` and `duration` (the loop duration). The package also exports `COMMON_DEFAULTS`, a `*_DEFAULTS` per effect, `loopTime(t, loop)` (the wrap applied to `t`: modulo `loop.duration`, unchanged without a loop) and the option types. Importing the entry creates no context and touches no DOM global. `renderAt(t)` is deterministic and rejects a non-finite `t`, `loop: { duration }` makes the motion periodic (exact for the ribbon and the glitch, which are seamless across the wrap), `prefers-reduced-motion` renders one static frame, and an invalid option throws a `VisError` naming it.
- React: the `@dagnam/vis/react` entry (now built; `react` >= 18 is an optional peer) with `<VisBackground effect options onError>`, which owns one canvas per mount, applies option changes with `update()` and contains failures (invalid options, no WebGL2) instead of unmounting the page, and `<Gradient spec>`, an inline SVG gradient with its own `<defs>` ids and a `fit` of `slice`, `meet` or `none`. The server renders an empty wrapper.
- Dependencies: the package now has three exact-pinned regular dependencies, used only by animation export code, which the root entry never loads: `gifenc` 1.0.3 (GIF encoding), `mp4-muxer` 5.2.2 and `webm-muxer` 5.1.4 (video containers; both are deprecated upstream in favour of Mediabunny but frozen, and replacing them is an internal change). The root entry still loads no third-party code. All three are MIT licensed and listed in `NOTICE`. The CI package job checks this by walking the built import graphs and by encoding one GIF from the packed tarball in plain Node.
- Tooling: `npm run demo`, a gallery of the five effects (`?effect=`, `?t=`, `?seed=`, `?w=`, `?h=`; an invalid parameter shows an error); `npm run test:e2e`, a Playwright smoke test of the gallery in headless Chromium that also runs in CI; and `npm run fidelity`, which captures each effect beside the landing-page card it was ported from and writes a pixel-difference report. None of the three is published.

### Fixed

- `mesh` and `freeform` now throw a `VisError` naming the entry for a sparse point list (a hole), where they used to skip it silently. A stricter input check, so a caller that passed holes must now pass dense lists.

## [0.1.0] - 2026-10-21

### Added

- Core: `createRng` (mulberry32), `fmt`, the colour helpers `parseColor`/`toHex`/`toCss`/`mix`/`ramp`/`withAlpha`/`toVec3`, `VisError`.
- Brand: `BRAND` tokens, `PALETTES`/`palette`, `LOGO` path, `logoSvg`.
- Gradients: linear, radial, conic (with `repeat`/`reverse`/per-stop opacity), mesh, aurora, banded, layers (blend modes), freeform (+ palettes, seeded scatter), fluted glass, grain and image overlays, `animatedGradientCss`, `BLENDS`.
- Patterns: dots, grid, lines, stripes, dagMesh, contours, noise.
- Scenes: `brandBackground` (the og-default look) and `brandBackgroundLayers`, `ogCard`, `ribbon` (+ pure `ribbonCurves`), `measureText`/`wrapText`/`FONT_FAMILY`.
- Node: `renderPng` (resvg, bundled Inter), `icoFromPngs`, `favicons` (the icon `src` values in `site.webmanifest` are relative to the manifest, so they resolve at the site root and under any sub-path), the `dag-vis` CLI (`--out` of `og`, `background`, `gradient` and `pattern` must end in `.svg` or `.png`, any case; any other value exits 1 with one line naming it and writes nothing).
- `renderPng` href guard: `<image>` and `<feImage>` accept raster `data:` URIs only (`data:image/png`, `jpeg`, `jpg`, `gif`, `webp`, with a comma), so a `gradient` overlay image must be one to render to PNG. The guard cuts the markup in one linear pass (comments, CDATA and processing instructions are skipped as units but still searched for tag-like text) and refuses markup it cannot classify. An independent differential fuzz (about 139,000 documents against bare resvg-js) found, and this release fixes: a quote opened in a comment, CDATA section or processing instruction hiding a following `<image href>` from the guard; an SVG inside a `data:` URL whose nested `<feImage>` read a file; `<feImage href="data:,">` (any comma-bearing non-image data URL) aborting the process; and a quadratic scan (80 KB of `<a xxxx` took 3 s). A small seeded differential test now runs in the suite. This is defence in depth, not a sandbox.
- Tooling: CI (lint, format, types, tests at 100% coverage, and a packed-tarball smoke test that installs the package in an empty directory, checks both entries and the types, and runs the CLI) and a tag-triggered npm release with provenance, published from the protected `npm` GitHub Environment (limited to `vis/v*` tags).

### Notes

- The root entry exports an explicit list of 33 names (pinned by `tests/index.test.ts`). The SVG builder, validators, stop pipeline, geometry helpers (`fitAspect`, `focalScale`, `focalTransform`), text caps and Inter metrics are internal; names can be added after 0.1.0 but never removed.
- First release.
- `@resvg/resvg-js` is an optional peer dependency, needed only for PNG output (`@dagnam/vis/node`, the CLI).
- Contributing needs Node 22.12 or newer; the package itself needs Node 22 or newer (Node 20 is end-of-life, and CI only tests 22).
- Releases support plain `vis/vX.Y.Z` tags only: a prerelease suffix would publish to the `latest` dist-tag, so the release workflow rejects any other tag format. It also refuses (as a guard against accidental tags, not an attacker) a tagged commit that is not on `main`; a tag ruleset on `vis/v*` and the protected `npm` Environment (the publish job runs in it) provide the actual protection, and npm's trusted publisher must name workflow `release.yml` and environment `npm`, see the README.
