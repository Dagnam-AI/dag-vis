# Video brief: quickstart

## The film

- **Purpose:** explainer for the Quickstart docs page (an embedded video under its introduction).
- **Product:** Dagnam.AI, dagnam.ai
- **What it is:** a walkthrough of the first model: create a project, add data, build a small model, generate code, train.
- **Who watches:** people who have just opened the Quickstart page and have not used the Studio yet.
- **What they should take away:** the five steps from a new project to a training run, in order.
- **Lines approved word for word** (nothing else may be written on screen; the words are in `timing.ts` as `TEXT`, and `tests/videos/quickstart.test.ts` pins the list):
  - Wordmark: `DAGNAM` with a red `.AI`
  - `Quickstart: your first model`
  - Section names, once each, small: `Create a project`, `Add data`, `Build a small model`, `Generate code`, `Train`
  - Create a project: `Title`, `Framework`, `PyTorch`, `Visibility`, `Public`, `Create Project`, `v1.0.0 Initial architecture`
  - Add data: `MNIST Handwritten Digits Dataset`, `Train`, `Validation`, `Test`
  - Build a small model: `Dataset`, `Flatten`, `Dense Layer`, `Output`, `Output Type: Classification`, `Number of Classes: 10`
  - Train: `Loss`, `Accuracy` (no digits: the accuracy is a rising arc)
  - End card: `Next: fine tune and deploy`, `dagnam.ai`
- **Last frame:** the wordmark, `Next: fine tune and deploy` and `dagnam.ai`, held for the last 2 s or more with nothing moving.
- **Length and format:** 60 s, 16:9, 1920x1080, 30 fps (1800 frames). Layout numbers are in `timing.ts`.
- **Where it will be posted:** the Quickstart docs page, with the English captions file (`npm run captions -- quickstart`).

## Source material

- **Read from:** the library, through `@dagnam/vis` (colours, field presets) and `@dagnam/vis/animate` (the field effect).
- **Off limits:** vendor, repository and module names; plan limits; prices; any claim the Studio does not do today.
- **Logo and images:** none. Nodes, dialog and windows are drawn abstractly in code with the real labels; they are not copies of the app's screens.
- **Fonts:** Moonhouse for the wordmark only (ASCII text only: it has no curly quotes, dashes or ellipsis); Unbounded 500 and 700 for every other word; Inter is the fallback face. The font files stay in gitignored `public/fonts`.
- **Colours:** the dark brand background; panels are the foreground mixed into it; brand red only on the thing a beat is about (the Create Project button, the dataset node's edge, each new link as it is drawn, the output settings' edge, the code caret, the loss curve, the `.AI`). Leave out: every other hue; red is never decoration.

## Words on screen

- Plain and descriptive: the labels the Studio and the docs page already use.
- No prices, discounts, user counts, ratings, testimonials or performance claims. No numeric accuracy: the figure has no digits.
- Readable on a phone: headlines 72 px or more, everything else 36 px or more. A few words at a time. No line ends on a single word.

## Look and motion

- **Mood:** calm and technical.
- One calm field behind everything, `lunar` from `fieldPresetNames`, at low opacity through the existing EffectCanvas bridge. It slows to a stop over the end card so the last frame stands still.
- Wide framing first, then a slow push-in on the detail in four beats (the dataset and its splits, the output settings, the code window, the training panels). Movement is short and eased; every picture settles before the next starts (a short dip to the dark between beats). Nothing spins or flashes.

## Sound

- No voice, no music. A quiet low pad (A1, E2, A2) made in code, one dark breath as each section begins, and soft ticks: one per link (three) and a two-note rising tick when a step completes (five). Normalised to about -16 LUFS, true peak at or below -1.5 dBTP. Nobody has listened to it yet.

## How it's built

- `timing.ts` (beats, cues, sound events, captions, layout), `audio.ts` (bed and ticks from the same timing), `props.ts` (seed, field preset), `Quickstart.tsx` (composition and beat shell), `beats-setup.tsx` and `beats-build.tsx` (one component per beat), `parts.tsx` (shared parts), `curve.ts` (seeded loss curve and code-line shapes).

## Before it's done

- Stills of every beat checked; the first second understood; nothing cut off or overlapping; the last frame stays put.

## Hand-over

- The storyboard sheet, the project, the MP4 from `npm run render -- quickstart`, the captions file, and the render ledger line. Assumptions: the Studio does what every beat shows today (the docs owner checks each beat against the page text).
