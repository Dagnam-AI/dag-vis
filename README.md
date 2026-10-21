# dag-vis — `@dagnam/vis`

Deterministic, parameterised Dagnam.AI visuals. One package, three entry points:

| import                             | what                                                          | runtime deps      |
| ---------------------------------- | ------------------------------------------------------------- | ----------------- |
| `@dagnam/vis`                      | brand tokens, gradients, patterns, scenes (SVG + CSS strings) | none              |
| `@dagnam/vis/react`                | `<VisBackground>` animated canvases, `<Gradient>`             | `react` (peer)    |
| `@dagnam/vis/node` + `dag-vis` CLI | PNG rendering, favicon sets, OG cards                         | `@resvg/resvg-js` |

Every generator takes `seed` (default `1`); same options + seed → byte-identical output.

## Develop

    npm ci
    npm run check      # eslint → prettier → tsc → vitest at 100% coverage
    npm run build      # dist/ (+ bundled Inter fonts)
    UPDATE_GOLDENS=1 npx vitest run   # regenerate tests/goldens after an intended change

## Release

Tag `vis/vX.Y.Z` on `main` (version in `package.json` must match); `release.yml`
re-runs CI on the tag and publishes to npm with provenance.

## Licence

Apache-2.0. Bundled fonts: Inter 4.1 (SIL OFL 1.1, `src/node/fonts/OFL.txt`).
