import { createField } from "../src/animate/index.js";
import { fieldPresets, type FieldPresetName } from "../src/index.js";

// Renders one preset on the GPU and reads back RGB at the given pixels (top-left origin, as the CPU frame
// is indexed), then the drawing-buffer size (gl.drawingBufferWidth/Height, the size the shader and
// readPixels use), so the spec can fail on a sizing mismatch instead of comparing misaligned pixels. The handle is never start()ed: renderAt initialises lazily.
window.__parity = (name, t, loop, points) => {
  if (!Object.hasOwn(fieldPresets, name))
    throw new Error(`unknown preset ${name}`);
  const spec = fieldPresets[name as FieldPresetName];
  const stage = document.getElementById("stage");
  if (!stage) throw new Error("parity page is not ready");
  const canvas = document.createElement("canvas");
  stage.replaceChildren(canvas);
  const handle = createField(
    canvas,
    spec,
    loop === undefined
      ? { maxDpr: 1, autoPause: false }
      : { maxDpr: 1, autoPause: false, loop: { duration: loop } },
  );
  try {
    handle.renderAt(t);
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("webgl2 context unavailable");
    // The shader works in drawing-buffer pixels (a browser may clamp the buffer below the canvas size).
    const bufferWidth = gl.drawingBufferWidth;
    const bufferHeight = gl.drawingBufferHeight;
    const px = new Uint8Array(4);
    const out: number[] = [];
    for (const [x, y] of points) {
      gl.readPixels(
        x,
        bufferHeight - 1 - y,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        px,
      );
      out.push(px[0] ?? 0, px[1] ?? 0, px[2] ?? 0);
    }
    out.push(bufferWidth, bufferHeight);
    return out;
  } finally {
    handle.destroy();
  }
};
window.__parityReady = true;
