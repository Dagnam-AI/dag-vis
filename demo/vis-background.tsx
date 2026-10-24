import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { fieldPresets, type FieldSpec } from "../src/index.js";
import { VisBackground } from "../src/react/index.js";

const spec = (seed: number): FieldSpec => ({
  ...fieldPresets["fluid-dawn"],
  seed,
});

// The stage has a size so the effect draws at a real resolution; the wrapper fills it.
// The runtime skips a frame that comes sooner than 1000 / fps ms after the last draw; a skipped frame would leave the
// drawing buffer cleared for sample(). At 1000 the gate (now - last >= 0) never skips, whatever the display rate.
const FPS = 1000;

const FILL = { width: "100%", height: "100%" } as const;

function Demo() {
  const [seed, setSeed] = useState(1);
  const [shown, setShown] = useState(true);
  return (
    <>
      <button
        id="flip"
        onClick={() => {
          setSeed((s) => s + 1);
        }}
      >
        flip seed
      </button>
      <button
        id="toggle"
        onClick={() => {
          setShown((s) => !s);
        }}
      >
        {shown ? "unmount" : "mount"}
      </button>
      <div id="stage">
        {shown && (
          <VisBackground
            effect="field"
            style={FILL}
            options={{ spec: spec(seed), fps: FPS }}
          />
        )}
      </div>
    </>
  );
}

const app = document.getElementById("app");
const cycle = document.getElementById("cycle");
if (!app || !cycle) throw new Error("vis-background page is not ready");
createRoot(app).render(<Demo />);

window.__visBg = {
  // Mount and unmount `n` separate backgrounds back to back (flushSync runs the effects before it returns),
  // leaving the last one mounted in #cycle. The canvases are kept so a test can ask each context.
  cycle(n) {
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 0; i < n; i++) {
      const root = createRoot(cycle);
      flushSync(() => {
        root.render(
          <VisBackground
            effect="field"
            style={FILL}
            options={{ spec: spec(i), fps: FPS }}
          />,
        );
      });
      const canvas = cycle.querySelector("canvas");
      if (!canvas) throw new Error(`cycle ${String(i)}: no canvas mounted`);
      canvases.push(canvas);
      if (i < n - 1)
        flushSync(() => {
          root.unmount();
        });
    }
    window.__visBg.cycled = canvases;
  },
  cycled: [],
  // Reads a grid of pixels after the effect's own frame callback of the same frame, before the buffer is composited and cleared.
  sample(canvas) {
    return new Promise((resolve) => {
      // The runtime's callback was queued first; the second frame is certainly after a draw.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const gl = canvas.getContext("webgl2");
          if (!gl || gl.isContextLost()) {
            resolve({ lost: true, distinct: 0 });
            return;
          }
          const colours = new Set<string>();
          const px = new Uint8Array(4);
          for (let gy = 0; gy < 8; gy++) {
            for (let gx = 0; gx < 8; gx++) {
              gl.readPixels(
                Math.floor(((gx + 0.5) * gl.drawingBufferWidth) / 8),
                Math.floor(((gy + 0.5) * gl.drawingBufferHeight) / 8),
                1,
                1,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                px,
              );
              colours.add(px.join(","));
            }
          }
          resolve({ lost: false, distinct: colours.size });
        });
      });
    });
  },
};
window.__visBgReady = true;
