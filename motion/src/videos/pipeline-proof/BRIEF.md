# Video brief — pipeline-proof

Not a product video: a 6-second seamless loop that proves the motion pipeline (render, sound, checks) end to end. It is never published, and the caption says so in the frame. The two owner approvals that a real video needs do not apply to this proof; every real video gets its own folder beside this one and goes through both.

## The film

- Purpose: pipeline proof (internal). It claims nothing; one library effect (the ribbon) loops.
- Line approved word for word: "@dagnam/vis motion pipeline proof · not for publication".
- Last frame: frame 179; frame 180 equals frame 0 (seamless).
- Length and format: 6 s, 1920×1080, 30 fps, H.264. Layout numbers live in timing.ts.

## Source material

- Read from: the library source, through `@dagnam/vis` and `@dagnam/vis/animate`. Fonts: Moonhouse for the caption (the font file stays in gitignored `public/fonts`; only rendered frames leave the machine), Inter as the fallback face.
- Colours: THEME (the dark background, the brand red, two of the brand stripes).
- Storage: copied to the local videos folder by the render (`../info/videos/pipeline-proof/`); never uploaded, because a proof is not a deliverable.

## Sound

- Made in code (audio.ts): a 55 Hz + 110 Hz drone with a 1-cycle-per-loop AM and four low-passed noise swells on the beats. No voice, no music. −16 LUFS, true peak below −1 dBTP (`scripts/audio.ts` normalises and checks).

## Before it's done

- 180 frames, 1920×1080, audio as long as the picture (`scripts/check-render.ts`).
- Loop seam: frame 180 rendered separately equals frame 0; the bed looped shows no step at the join. The bed itself is click-free, but the MP4 file is not a sample-exact audio loop: AAC priming makes its track 6.016 s (768 samples, 16 ms longer than the picture), so looping the MP4 file itself leaves a 16 ms audio gap at the join. Loop the bed, not the file.
- Nobody has listened to the sound unless the hand-over says someone did.
