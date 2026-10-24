import { defineTiming } from "../../lib/timing.ts";

export const TIMING = defineTiming({
  fps: 30,
  width: 1920,
  height: 1080,
  duration: 6,
  beats: { swell1: 0, swell2: 1.5, swell3: 3, swell4: 4.5 },
  // Every `at` is a whole frame at 30 fps: the sheet renders exactly that frame.
  storyboard: [
    {
      at: 0,
      caption:
        "Ribbon at phase 0; first swell begins over the 55 + 110 Hz drone",
    },
    { at: 0.8, caption: "First swell in its release" },
    {
      at: 1.5,
      caption: "Quarter loop: second swell begins; drone AM at its peak",
    },
    { at: 2.5, caption: "Second swell in its release; it ends at 2.7 s" },
    { at: 3, caption: "Half loop: third swell begins; ribbon at phase pi" },
    {
      at: 4.5,
      caption:
        "Three-quarter loop: fourth swell begins; drone AM at its trough",
    },
    { at: 5.5, caption: "Fourth swell in its release; it ends at 5.7 s" },
    {
      at: 179 / 30,
      caption:
        "Frame 179, the last; only the drone sounds; frame 180 equals frame 0",
    },
  ],
});
