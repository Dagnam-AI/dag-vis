# Changelog

All notable changes to `@dagnam/vis` are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/). A release is the tag
`vis/vX.Y.Z` on `main`; `package.json` is the single source of the version.

## [Unreleased]

## [0.1.0] - 2026-10-21

### Added

- Core: `createRng` (mulberry32), `fmt`, `parseColor`/`toHex`/`toCss`/`mix`/`ramp`, SVG builder, `focalTransform`, `VisError`.
- Brand: `BRAND` tokens, `LOGO` path, `logoSvg`.
- Gradients: linear, radial, conic (with `repeat`/`reverse`/per-stop opacity), mesh, aurora, banded, layers (blend modes), freeform (+ palettes, seeded scatter), fluted glass, grain and image overlays, `animatedGradientCss`.
- Patterns: dots, grid, lines, stripes, dagMesh, contours, noise.
- Scenes: `brandBackground` (the og-default look), `ogCard`, `ribbon` (+ pure `ribbonCurves`).
- Node: `renderPng` (resvg, bundled Inter), `icoFromPngs`, `favicons`, the `dag-vis` CLI.
- Tooling: CI (lint, format, types, tests at 100% coverage, and a packed-tarball smoke test that installs the package in an empty directory, checks both entries and the types, and runs the CLI) and a tag-triggered npm release with provenance.

### Notes

- First release. `./react` is declared in `exports` but its entry point is not built yet; it lands with the animation engine.
- `@resvg/resvg-js` is an optional peer dependency, needed only for PNG output (`@dagnam/vis/node`, the CLI).
- Contributing needs Node 22.12 or newer; the package itself supports Node 20 or newer.
- Releases support plain `vis/vX.Y.Z` tags only: a prerelease suffix would publish to the `latest` dist-tag, so the release workflow rejects any other tag format. It also requires the tagged commit to be on `main`.
- Known limitation: `gradient()` does not yet type-check every field of a spec that comes from untyped JavaScript or JSON (it can throw a `TypeError` instead of a `VisError`), and `gradient`, `gradientSvg` and `logoSvg` accept any positive finite size. See the README.
