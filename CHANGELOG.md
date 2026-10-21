# Changelog

All notable changes to `@dagnam/vis` are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/). A release is the tag
`vis/vX.Y.Z` on `main`; `package.json` is the single source of the version.

## [Unreleased]

### Changed

- CLI: `--out` of `og`, `background`, `gradient` and `pattern` must now end in `.svg` or `.png` (any case). Any other value (`card.jpg`, `.webp`, no extension, a trailing dot, `-`) exits 1 with one line naming the value and the accepted extensions, and writes nothing; before, it wrote SVG text into the file whatever its name. `favicons --out` (a directory) is unaffected.
- Release workflow: the `publish` job now runs in the protected `npm` GitHub Environment (limited to `vis/v*` tags). No other workflow logic changed.
- `favicons`: the icon `src` values in `site.webmanifest` are now relative to the manifest (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`) instead of root-absolute (`/icon-192.png`), so they resolve at the site root and under any sub-path. Nothing else in the manifest changed.

## [0.1.0] - 2026-10-21

### Added

- Core: `createRng` (mulberry32), `fmt`, the colour helpers `parseColor`/`toHex`/`toCss`/`mix`/`ramp`/`withAlpha`/`toVec3`, `VisError`.
- Brand: `BRAND` tokens, `PALETTES`/`palette`, `LOGO` path, `logoSvg`.
- Gradients: linear, radial, conic (with `repeat`/`reverse`/per-stop opacity), mesh, aurora, banded, layers (blend modes), freeform (+ palettes, seeded scatter), fluted glass, grain and image overlays, `animatedGradientCss`, `BLENDS`.
- Patterns: dots, grid, lines, stripes, dagMesh, contours, noise.
- Scenes: `brandBackground` (the og-default look) and `brandBackgroundLayers`, `ogCard`, `ribbon` (+ pure `ribbonCurves`), `measureText`/`wrapText`/`FONT_FAMILY`.
- Node: `renderPng` (resvg, bundled Inter), `icoFromPngs`, `favicons`, the `dag-vis` CLI.
- Tooling: CI (lint, format, types, tests at 100% coverage, and a packed-tarball smoke test that installs the package in an empty directory, checks both entries and the types, and runs the CLI) and a tag-triggered npm release with provenance.

### Notes

- The root entry exports an explicit list of 31 names (pinned by `tests/index.test.ts`). The SVG builder, validators, stop pipeline, geometry helpers (`fitAspect`, `focalScale`, `focalTransform`), text caps and Inter metrics are internal; names can be added after 0.1.0 but never removed.
- First release. `./react` is declared in `exports` but its entry point is not built yet; it lands with the animation engine.
- `@resvg/resvg-js` is an optional peer dependency, needed only for PNG output (`@dagnam/vis/node`, the CLI).
- Contributing needs Node 22.12 or newer; the package itself supports Node 20 or newer.
- Releases support plain `vis/vX.Y.Z` tags only: a prerelease suffix would publish to the `latest` dist-tag, so the release workflow rejects any other tag format. It also refuses (as a guard against accidental tags, not an attacker) a tagged commit that is not on `main`; a tag ruleset on `vis/v*` and the protected `npm` Environment (the publish job runs in it) provide the actual protection, and npm's trusted publisher must name workflow `release.yml` and environment `npm`, see the README.
