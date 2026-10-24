import { defineTiming } from "../../lib/timing.ts";

// Scaffold timing so the contact sheet has something real to render until the first video lands.
export const TIMING = defineTiming({
  fps: 30,
  width: 640,
  height: 360,
  duration: 1,
  beats: {},
  storyboard: [
    { at: 0, caption: "first frame" },
    { at: 0.2, caption: "0.2 s" },
    { at: 0.4, caption: "0.4 s" },
    { at: 0.6, caption: "0.6 s" },
    { at: 0.8, caption: "0.8 s" },
    { at: 29 / 30, caption: "last frame" },
  ],
});
