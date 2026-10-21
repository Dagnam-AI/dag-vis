# Changelog

All notable changes to `@dagnam/vis` are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/). A release is the tag
`vis/vX.Y.Z` on `main`; `package.json` is the single source of the version.

## [Unreleased]

### Added

- Core: `createRng` (mulberry32), `fmt`, `parseColor`/`toHex`/`toCss`/`mix`/`ramp`, SVG builder, `focalTransform`, `VisError`.
- Brand: `BRAND` tokens, `LOGO` path, `logoSvg`.
- Gradients: linear, radial, conic (with `repeat`/`reverse`/per-stop opacity), mesh, aurora, banded, layers (blend modes), freeform (+ palettes, seeded scatter), fluted glass, grain and image overlays, `animatedGradientCss`.
- Patterns: dots, grid, lines, stripes, dagMesh, contours, noise.
- Scenes: `brandBackground` (the og-default look), `ogCard`, `ribbon` (+ pure `ribbonCurves`).
- Node: `renderPng` (resvg, bundled Inter), `icoFromPngs`, `favicons`, the `dag-vis` CLI.
