# Motion

## What this is

Videos for Dagnam, made in code with [Remotion](https://www.remotion.dev) on top of the deterministic effects in `@dagnam/vis`. `motion/` is a consumer of `@dagnam/vis` and `@dagnam/vis/animate`: it aliases both to the repository's own `../src` and `../src/animate` (see "Alias into `src/`" below), has its own dependencies and lockfile, and is not part of the published npm package (it is outside `files` and outside the public API allow-list).

## Setup

```sh
npm ci                                     # at the repository root first: motion bundles the library's source, which imports gifenc
cd motion && npm ci && npm run assets      # assets copies the fonts into gitignored public/fonts/
npm run studio                             # the Remotion Studio
```

- Run every command from `motion/`; the scripts check the working directory because the library alias and the relative paths are `motion/`'s. The scripts are TypeScript run by Node's type stripping (Node 22.18 or newer).
- `swangle` (software) is the default renderer and the only one a deliverable may use; `MOTION_GL=angle` (the GPU) is for previews only (see "Rendering and storing a video").
- The local videos folder is `../info/videos/` beside this checkout, or wherever `DAG_VIDEOS_DIR` points.
- macOS and Linux only for now; Windows does not work. `sheet.ts` refuses to run there (it links `public/` into its bundle, which needs symlinks), and `render`, `audio` and `check:render` spawn `node_modules/.bin/remotion` directly, which fails on Windows. Only macOS has been used by hand; Linux is exercised by the CI job.

## Commands

| command                                                                             | what it does                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run assets`                                                                    | Copies Inter, Unbounded and Moonhouse from the library into `public/fonts/`; refuses unless git says that folder is ignored.                    |
| `npm run audio -- <video>`                                                          | Synthesises the video's bed (`src/videos/<video>/audio.ts`), normalises it to -16 LUFS and writes `public/generated/<video>.wav`; fails closed. |
| `npm run check:render -- <file.mp4> <video> [--json]`                               | Frame count, size, frame rate, audio length against the picture, loudness and true peak of a finished render; exit 1 with named problems.       |
| `npm run sheet -- <video> [--props <json>]`                                         | Renders the storyboard (the frames in `timing.ts`, captioned) to `out/<video>/<video>-sheet-<yyyymmdd>-v<N>.png`.                               |
| `npm run render -- <video> [--props <json>] [--crf 18] [--allow-dirty]`             | One deliverable: bed, versioned MP4, checks, local copy, ledger line. `--preview-not-a-deliverable` is the quick-look variant.                  |
| `npm run store -- out/<video>/<name>.mp4 [--upload]` and `npm run store -- --check` | Local copy (and, only on the owner's own command, the R2 copy) of a finished render; `--check` verifies the local folder.                       |

## Starting a real video with the `remotion-video` skill

The skill runs inside `dag-vis/motion/`. It has two gates, and nothing is created before the first.

1. **Proposal.** The skill fills `brief.md` and ends with "Go?". Nothing is created before the go.
2. **Storyboard.** On the go: `mkdir src/videos/<slug>`; save the filled brief as `src/videos/<slug>/BRIEF.md`; write `timing.ts` (one file for picture and sound), `audio.ts`, `props.ts` (`export const DEFAULT_PROPS`, the composition's `defaultProps`) and `<Slug>.tsx`; register the composition with `id = <slug>` in `Root.tsx`. `npm run sheet -- <slug>` renders the 6 to 8 captioned frames to `out/<slug>/<slug>-sheet-<yyyymmdd>-v<N>.png`. Send it and end with "Go?".
3. **Film.** On the second go: build it, then `npm run render -- <slug>`. Deliver what `BRIEF.md`'s hand-over lists plus the `RENDERS.jsonl` line, and always say that nobody has listened to the sound.

A revision starts from the existing `BRIEF.md` and renders the next `v<N>`. `src/videos/pipeline-proof/` is the worked example of the layout.

## Rules

- Never overwrite an earlier render: names are versioned (`<video>-<yyyymmdd>-v<N>.mp4`) and `Config.setOverwriteOutput(false)` is set. Renders live in `out/` (gitignored), are stored locally and, when the owner decides, in R2, and are recorded in `RENDERS.jsonl` under `stored: { local, r2 }`.
- A video's name (the `<video>` / `<slug>` argument of every script) is lower-case letters and digits joined by single hyphens, e.g. `pipeline-proof`; one rule, checked the same way by `audio`, `sheet`, `check:render`, `render` and `store`.
- No synthetic voice and no music unless the owner asks for them or provides them. The sound is made in code.
- Sound targets: about -16 LUFS integrated, true peak below -1 dBTP, audio as long as the picture. They are measured with `loudnorm` in JSON mode and `ffprobe`, because Remotion's bundled ffmpeg has no `ebur128` (see "ffmpeg and ffprobe"). `npm run check:render -- <file> <slug>` checks them.
- Compositions are pure functions of the frame: draw with `EffectCanvas` (it calls `renderAt(frame / fps)` and never `start()`), put `seed` in the props, read no clock, and make the loop `loopFrames(duration, fps)` long.
- Colours and fonts come from `src/bridge/brand.ts`.

## Fonts

Moonhouse (headlines and the wordmark; the family name is lowercase `moonhouse`, as the library's social card sets it), Inter (text) and Unbounded (UI) are copied from the library's `src/node/fonts/` into the gitignored `public/fonts/` by `npm run assets`.

**Standing caution.** Moonhouse's embedded licence (NimaVisual free font) allows "personal and commercial work" but forbids modifying the font file and redistributing it (website, CD-ROM, archive) without written permission, and the package owner has confirmed Dagnam has that permission (2026-10-25, see the root README "Fonts"). Even so, the font files themselves are never committed under `motion/` (the structure test fails any tracked font, image, video or audio file), never uploaded to R2 or a website, and never put in a release asset or a shared Remotion bundle (`sheet.ts` links `public/` instead of copying it for that reason); only rendered pixels (video frames) leave the machine. Moonhouse has no curly quotes, dashes or "…": set text as `${THEME.display}, ${THEME.text}` so a missing glyph falls back to Inter.

## Remotion licence

The Free License applies while the team is within Remotion's eligibility list; the quoted text, the links and the headcount rule are under "Licence" below. Re-confirm before a 4th person joins and before any Remotion 5.0 bump.

## Rendering and storing a video

Run everything from `motion/` (the commands check it): the library alias and the relative paths are `motion/`'s.

```sh
npm run render -- <video> [--props '<json>'] [--crf 18] [--allow-dirty]
```

One command makes one deliverable: it synthesises and normalises the video's sound bed (`src/videos/<video>/audio.ts`), renders `out/<video>/<video>-<yyyymmdd>-v<N>.mp4` with H.264 (the next free `N`: a number already used in `out/`, the ledger or the videos folder is never reused, and an earlier render is never overwritten), writes the props used beside it (`…-v<N>.props.json`: the video's `src/videos/<video>/props.ts` defaults, which `Root.tsx` registers too, under any `--props`, so a default such as the seed is on the record), checks frame count, size, frame rate, audio length and loudness (`…-v<N>.check.json`), copies the three files into the local videos folder, and appends one line to `RENDERS.jsonl`: file, SHA-256, bytes, frames, width, height, frame rate, loudness and true peak, props, library commit (`git`) and whether the tree had uncommitted changes (`dirty`), Remotion version, renderer, time, and `stored: { local, r2 }`. A render that fails its checks is kept in `out/` for inspection but is stored nowhere and gets no ledger line.

- **Renderer.** A deliverable is rendered with `swangle` (software; the same machine renders the same bytes, equality across machines has not been measured) and says so in its ledger line and check output; `store` refuses a check output that names another renderer. `MOTION_GL=angle` (the GPU) is refused for a deliverable. For a quick look on the GPU, `npm run render -- <video> --preview-not-a-deliverable` renders into `out/<video>/preview/`, runs the checks and stops: no version number, no stored copy, no ledger line.
- **Clean tree.** The recorded commit only describes the video if nothing was uncommitted when it was made, so a deliverable is refused while `git status` lists changes (appending to `RENDERS.jsonl` does not count). `--allow-dirty` renders anyway and records `dirty: true` in the ledger line and the check output. A preview is never stored, so it is not held to this.
- **Local copy.** `$DAG_VIDEOS_DIR/<video>/`, by default `../info/videos/<video>/` beside this checkout. The render stops early, naming `DAG_VIDEOS_DIR`, if the parent folder is missing, and refuses a folder that sits inside a git work tree without being ignored there (`git check-ignore`), so a render can never be one `git add` from history. A file that is already there with different content is an error; nothing is overwritten.
- **R2 copy.** `npm run store -- out/<video>/<name>.mp4 --upload` puts the three files in the owner's bucket under `videos/<video>/` with a signed request (no SDK) and records the key in `stored.r2`. **This is a remote write and is run only by the owner, by hand: never by `render`, a test, CI or an agent that was not told to.** Make the first one a throwaway render, not a real video. It reads `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_VIDEOS_BUCKET` from the environment and nowhere else; `--upload` with any of them missing exits 1 and names the missing ones (nothing is sent), and no message it prints contains a credential. It uploads only a render whose SHA-256 matches its ledger line, and each object is sent with its own SHA-256 as `x-amz-meta-sha256`.
  - The upload starts by asking whether each key exists (HEAD), so the token needs **Object Read & Write** on the videos bucket. A 403 on that request fails the upload (it is never read as "absent"): grant the token read as well as write.
  - An object that already exists is never overwritten. It counts as uploaded only if it is this file. An object that carries `x-amz-meta-sha256` is this file only if that equals the local SHA-256; any other value fails, even if its size and `ETag` happen to match. Only an object with no such metadata is judged by its size and a plain 32-hex MD5 `ETag` (a multipart `ETag`, which has a dash, proves nothing). Anything else fails with a named error and records nothing.
  - `npm run store -- --check` verifies the local folder only.
- **What leaves the machine.** Rendered pixels (the MP4, its props and its check output). The Moonhouse font file is never committed, uploaded or released.

## Gates

- `npm run check` at the repository root ends with `check:motion` (`scripts/check-motion.mjs`): eslint, `tsc --noEmit` and `vitest --coverage` in `motion/`, then `npm audit`. When `motion/node_modules` is missing it prints one "skipped" line and passes; CI's `Motion` workflow (`.github/workflows/motion.yml`, separate from `ci.yml` so a motion audit cannot block a library release) installs first and sets `MOTION_REQUIRED=1`, where a skip is a failure. It also renders the sound bed and one still under swangle.
- Coverage is 100% on statements, branches, functions and lines for `src/lib` and `src/bridge`. `src/videos`, `src/sheet`, `Root.tsx` and `index.ts` are visual and outside the floor by `include`; they are judged on the storyboard and the rendered frames. No suppression comments.
- Structure rules (`tests/structure.test.ts`): `motion/` reaches the library only as `@dagnam/vis` or `@dagnam/vis/animate`; the library's `src/` never imports `motion/`; `src/lib` imports only its siblings; every `lib` and `bridge` file has a mirrored test; no file over 500 lines; the shared toolchain pins equal the root's; no tracked font, image, video or audio file; no implicit upload.
- **Audit note.** `zod` is overridden to 4.6.6 in `motion/package.json` (GHSA-mrhx-c7xc-m3w5) until Remotion bumps its own pin of 4.5.4; remove the override when it does.

## The pipeline proof

`src/videos/pipeline-proof/` is a 6-second seamless loop that exercises the whole pipeline (bed, sheet, render, checks). It was rendered once as a verification run into a throwaway videos folder, and its ledger lines were intentionally not committed: they would point at files that are not in the real videos folder and would use up that day's version numbers. The first real video appends the first committed line to `RENDERS.jsonl`.

## Verified toolchain facts

Everything below was checked on 2026-10-24 (UTC) on macOS (Apple M4 Pro), Node v24.22.1, npm 11.19.1, in a scratch Remotion project that aliased `@dagnam/vis` to this repository's `src/`. Each fact names the command or page that produced it.

### Remotion version

Pin: **Remotion 4.0.534** (published 2026-10-07T09:16:48Z), the newest release at least 14 days old on 2026-10-24. 4.0.535 to 4.0.538 are 2 to 12 days old.

```sh
node -e 'const t=JSON.parse(process.argv[1]);const cut=Date.parse(process.argv[2])-14*864e5;const ok=Object.entries(t).filter(([v,d])=>/^\d+\.\d+\.\d+$/.test(v)&&Date.parse(d)<cut).sort((a,b)=>Date.parse(a[1])-Date.parse(b[1])).at(-1);console.log(ok[0],ok[1])' "$(npm view remotion time --json)" 2026-10-24T00:00:00Z   # the date is an argument, so the answer does not drift
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

The Free License applies: as of 2026-10-24 Dagnam has no employees or contractors. There is no revenue threshold in the licence. Re-confirm before a 4th person (employee, contractor or freelancer, per the Terms above) joins or works on this project, and before any Remotion 5.0 bump (`LICENSE.md`: "In Remotion 5.0, the license will slightly change").

Telemetry (<https://www.remotion.dev/docs/license/telemetry>): server-side `renderMedia()` / `renderStill()` send a render event only when a `licenseKey` option is set. No `licenseKey` is configured at the time of writing.

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

- GitHub-hosted runners have no GPU, so `swangle` (software) is the expected value there. It has been run on the machine above only; how it behaves in CI is verified by the CI job when it runs. A flag on the command line overrides `Config.setChromiumOpenGlRenderer`. Remotion 4's own default is Chromium's choice (`null`); it only becomes `angle` in 5.0.
- On this machine, output was deterministic within one renderer (checked for the ribbon and the dither only) but not byte-identical across the two. `angle` against `swangle`: the Canvas2D ribbon differs in all 61 frames (frame 10: 11749 of 230400 pixels, 5.1 %, mean channel difference 0.29 of 255, antialiased edges); the WebGL2 dither differs in 9 of 61 frames by a handful of pixels (frame 1: 4 pixels, frame 52: 8 pixels, one channel difference of 156). So the renderer flag is part of a render's identity: pin one value for renders that are compared or reproduced, and record it.
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

With `"overrides": { "zod": "4.6.6" }` in `package.json` (adopted on the owner's explicit instruction, one day short of the 14-day age rule; `zod@4.6.6` was published 2026-10-11T16:18Z): `npm audit` reports 0 vulnerabilities, and renders (`still`, `render`, the Node API) work and give byte-identical output. Remotion then prints a version-mismatch warning on every command (`zod: installed 4.6.6, required 4.5.4`); it does not fail anything. `4.6.5` and below are vulnerable.

`npm` 11.19.1 also prints an `allowScripts` notice for the `esbuild` postinstall script; bundling and rendering work regardless.

### Library interfaces

Checked against `src/` with `grep`: `EffectOptions.loop?: { duration: number }`, `EffectOptions.maxDpr`, `EffectHandle.renderAt(t: number): void`, `createRibbon`, `createDither`, `createField(canvas, spec, opts)` (throws on a different spec; recreate instead of `update`), `exportCanvas`, all exported from `@dagnam/vis/animate`; `BRAND` (`red #ef4444`, `background.dark #0a0a0a`, `foreground.dark #fafafa`, `stripes` of four colours), `LOGO` and `logoSvg` from the root `@dagnam/vis`. Fonts in `src/node/fonts/`: `Inter-Regular.ttf`, `Inter-Bold.ttf`, `Unbounded-Regular.ttf`, `moonhouse/moonhouse.ttf` (with `OFL.txt`, `OFL-Unbounded.txt` and `moonhouse/LICENSE-NOTE.txt`). The library's `FONT_FILES` list lives in the `./node` subpath, which `motion/` may not import, so `motion/` keeps its own list.
