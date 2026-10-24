# Motion

Videos for Dagnam, made in code with [Remotion](https://www.remotion.dev) on top of the deterministic effects in `@dagnam/vis`. This folder is not part of the published npm package.

## Verified toolchain facts

Everything below was checked on 2026-10-24 (UTC) on macOS (Apple M4 Pro), Node v24.22.1, npm 11.19.1, in a scratch Remotion project that aliased `@dagnam/vis` to this repository's `src/`. Each fact names the command or page that produced it.

### Remotion version

Pin: **Remotion 4.0.534** (published 2026-10-07T09:16:48Z), the newest release at least 14 days old on 2026-10-24. 4.0.535 to 4.0.538 are 2 to 12 days old.

```sh
node -e 'const t=JSON.parse(process.argv[1]);const cut=Date.now()-14*864e5;const ok=Object.entries(t).filter(([v,d])=>/^\d+\.\d+\.\d+$/.test(v)&&Date.parse(d)<cut).sort((a,b)=>Date.parse(a[1])-Date.parse(b[1])).at(-1);console.log(ok[0],ok[1])' "$(npm view remotion time --json)"
for p in @remotion/cli @remotion/renderer @remotion/bundler @remotion/fonts; do npm view "$p@4.0.534" version license; done
```

`@remotion/cli`, `@remotion/renderer` and `@remotion/bundler` at 4.0.534 declare `SEE LICENSE IN LICENSE.md`; `@remotion/fonts` declares `MIT`. The scratch project used `remotion`, `@remotion/cli`, `@remotion/bundler` and `@remotion/renderer`, all exact `4.0.534`, with `react` / `react-dom` 19.3.1 and `@types/react` 19.3.0 (the same pins as the root `package.json`).

### Licence

Read on 2026-10-24 at <https://www.remotion.dev/docs/license> (now an index page that links to the pages below), <https://www.remotion.dev/docs/license/faq>, <https://www.remotion.dev/docs/license/terms> and <https://github.com/remotion-dev/remotion/blob/main/LICENSE.md>. The `LICENSE.md` shipped inside the pinned `remotion@4.0.534` npm package is byte-identical to the one on GitHub `main` (`diff node_modules/remotion/LICENSE.md <(curl -sL https://raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md)`).

`LICENSE.md`, "Free License", "Eligibility", verbatim:

> You are eligible to use Remotion for free if you are:
>
> - an individual
> - a for-profit organization with up to 3 employees
> - a non-profit or not-for-profit organization
> - evaluating whether Remotion is a good fit, and are not yet using it in a commercial way

`LICENSE.md`, "Company License", verbatim:

> You are required to obtain a Company License to use Remotion if you are not within the group of entities eligible for a Free License.

The website's License FAQ and Terms and Conditions word the eligibility list slightly differently ("an individual, whether for personal or commercial use", "an organization or team of individuals with up to 3 people") and add that headcount means all personnel, including freelancers and contractors who work on the same Remotion project, and that a Company License is required once the combined headcount of the involved parties is 4 or more.

Licence decision: the Free License applies. The owner is the sole person (decision 2026-10-23: "Dagnam has no employees just me"). There is no revenue threshold in the licence. Re-confirm before the 4th person joins or works on this project (headcount counts all personnel, contractors and freelancers included, per the Terms above) and before any Remotion 5.0 bump (`LICENSE.md`: "In Remotion 5.0, the license will slightly change").

Telemetry (<https://www.remotion.dev/docs/license/telemetry>): server-side `renderMedia()` / `renderStill()` send a render event only when a `licenseKey` option is set. This project never sets one.

### Alias into `src/`

**Works**, with these conditions found by running it:

- `@dagnam/vis$` to `<repo>/src/index.ts` and `@dagnam/vis/animate$` to `<repo>/src/animate/index.ts` (exact-match aliases, so one does not capture the other), plus `resolve.extensionAlias: { ".js": [".ts", ".tsx", ".js"] }` because the library's relative imports end in `.js`. `remotion still` and the Node API (`bundle()` with the same `webpackOverride`, then `selectComposition()` / `renderStill()`; the config file is not read there) both rendered, and the root alias returned `BRAND.red`, `LOGO.viewBox` and `logoSvg()` correctly.
- The alias target must stay inside this repository. `src/animate/index.ts` re-exports `exportCanvas`, whose module imports `gifenc` and dynamically imports `mp4-muxer` and `webm-muxer`. Webpack resolves those bare names upward from the importing file, so they are found in the repository's own `node_modules`. Aliasing to a **copy** of `src/` outside the repository fails at bundle time with `Can't resolve 'gifenc'`. Consequence: the repository's root `npm ci` must have run before any motion command (and before a motion CI job).
- Remotion refuses to start without a `tsconfig.json` in the project root.
- Type checking `motion/` against the library sources passes under the root's strict flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`, `verbatimModuleSyntax`, NodeNext, `allowImportingTsExtensions`, `lib: ES2023 + DOM`) only if the program also includes `../types/**/*.d.ts`; without it `tsc` fails with `TS7016` on `gifenc`.
- A TypeScript file run by plain `node` (type stripping) can import `webpack-override.ts` and call `bundle()` with it.

### Determinism

Same composition, same props, same frame, same machine and same renderer flag: byte-identical PNGs.

- `npx remotion still ... --frame=10` rendered twice (separate processes): identical SHA-256. Frames 10 and 11 differ.
- The ribbon loops exactly: with `loop: { duration: 2 }` at 30 fps, frame 60 is byte-identical to frame 0 (the composition needs `durationInFrames` of at least 61 to address frame 60).
- Full 61-frame PNG sequences (`remotion render --sequence --image-format=png --frames=0-60`) rendered at `--concurrency=4` twice and at `--concurrency=1` are identical frame for frame, for both the ribbon (Canvas2D) and the dither (WebGL2).
- The effects use `maxDpr: 16` in the spike so the canvas backing store matches the composition size (`deviceScaleFactor` 1).

### WebGL renderer flag (`--gl`)

`createDither` needs WebGL2. Which `--gl` values give it, checked by reading `WEBGL_debug_renderer_info` inside a composition:

| `--gl`                                      | WebGL2                                                                                    | renderer reported                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `angle`                                     | yes                                                                                       | ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro) |
| `swangle`                                   | yes                                                                                       | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device)) |
| `swiftshader`, `egl`, `vulkan`, `angle-egl` | **no** (`getContext("webgl2")` returns null; the effect throws "WebGL2 is not available") |                                                   |

- CI has no GPU: use `swangle`, which is software and needs none. A flag on the command line overrides `Config.setChromiumOpenGlRenderer`. Remotion 4's own default is Chromium's choice (`null`); it only becomes `angle` in 5.0.
- Output is deterministic **within** one renderer but not byte-identical **across** them. `angle` against `swangle` on the same machine: the Canvas2D ribbon differs in all 61 frames (frame 10: 11749 of 230400 pixels, 5.1 %, mean channel difference 0.29 of 255, antialiased edges); the WebGL2 dither differs in 9 of 61 frames by a handful of pixels (frame 1: 4 pixels, frame 52: 8 pixels, one channel difference of 156). So the renderer flag is part of a render's identity: pin one value for renders that are compared or reproduced, and record it.
- Not measured: whether `swangle` output is byte-identical between different machines.

### Audio component name

`remotion@4.0.534` exports both `Html5Audio` and `Audio` (`node -e 'import("remotion").then(m=>console.log("Html5Audio" in m,"Audio" in m))'` prints `true true`; `Audio` is the older name re-exported from the same module). Use **`Html5Audio`**. The `startFrom` / `endAt` props are deprecated in favour of `trimBefore` / `trimAfter` (<https://www.remotion.dev/docs/html5-audio>).

### ffmpeg and ffprobe

Remotion's bundled binaries (`npx remotion ffmpeg|ffprobe`, shipped in `@remotion/compositor-darwin-arm64`): **ffmpeg n7.1**, **ffprobe n7.1**. It is a size-reduced build (`--enable-small --disable-filters`, 50 filters). `loudnorm` **is present**, so no external ffmpeg is needed for loudness work. Present audio filters: `aformat atrim acopy adelay anullsrc atempo apad amerge amix asetrate asetpts aresample pan volume sine silencedetect loudnorm`. **Absent**: `ebur128`, `astats`, `volumedetect`, `alimiter`, `psnr`, `ssim`, `signalstats`.

```sh
npx remotion ffmpeg -version | head -1
npx remotion ffmpeg -hide_banner -filters | grep -E "loudnorm|ebur128"   # loudnorm only
npx remotion ffmpeg -hide_banner -i in.wav -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -
```

- The `loudnorm` first pass with `print_format=json` prints `input_i`, `input_tp`, `input_lra` and `input_thresh`, which is enough to measure integrated loudness and true peak. A second pass with `measured_*` and `linear=true` brought a 3 s test tone from -35.75 LUFS to -16.05 LUFS (re-measured -16.05). Loudness and true-peak checks must be built on `loudnorm` JSON, not `ebur128` or `astats`.
- `ffprobe -count_frames -show_entries stream=...` works on Remotion's own output: a 60-frame render came back as h264, 640x360, yuv420p, 30/1, `nb_frames` 60, `nb_read_frames` 60, duration 2.000000.
- Every `npx remotion` command prints a version-mismatch banner when the dependency overrides below are used.

### Dependency audit

`npm audit` on a project with `remotion`, `@remotion/cli`, `@remotion/bundler` and `@remotion/renderer` at 4.0.534 reports **10 high-severity** findings, all from one cause: `zod` below 4.6.6 ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), "Zod can exhaust memory while validating oversized constrained collections", published 2026-10-01). `@remotion/studio` pins `zod` to exactly 4.5.4 in every release from 4.0.534 to 4.0.538, so no newer Remotion avoids it, and `npm audit`'s suggested fix is a downgrade to 4.0.277.

With `"overrides": { "zod": "4.6.6" }` in `package.json`: `npm audit` reports 0 vulnerabilities, and renders (`still`, `render`, the Node API) work and give byte-identical output. Remotion then prints a version-mismatch warning on every command (`zod: installed 4.6.6, required 4.5.4`); it does not fail anything. `zod@4.6.6` was published 2026-10-11T16:18Z, so it passes a 14-day age rule from 2026-10-25T16:18Z; `4.6.5` and below are vulnerable.

`npm` 11.19.1 also prints an `allowScripts` notice for the `esbuild` postinstall script; bundling and rendering work regardless.

### Library interfaces

Checked against `src/` with `grep`: `EffectOptions.loop?: { duration: number }`, `EffectOptions.maxDpr`, `EffectHandle.renderAt(t: number): void`, `createRibbon`, `createDither`, `createField(canvas, spec, opts)` (throws on a different spec; recreate instead of `update`), `exportCanvas`, all exported from `@dagnam/vis/animate`; `BRAND` (`red #ef4444`, `background.dark #0a0a0a`, `foreground.dark #fafafa`, `stripes` of four colours), `LOGO` and `logoSvg` from the root `@dagnam/vis`. Fonts in `src/node/fonts/`: `Inter-Regular.ttf`, `Inter-Bold.ttf`, `Unbounded-Regular.ttf`, `moonhouse/moonhouse.ttf` (with `OFL.txt`, `OFL-Unbounded.txt` and `moonhouse/LICENSE-NOTE.txt`). The library's `FONT_FILES` list lives in the `./node` subpath, which `motion/` may not import, so `motion/` keeps its own list.
