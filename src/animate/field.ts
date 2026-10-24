import {
  planGpu,
  resolveField,
  timeCoords,
  type FieldSpec,
  type UniformValue,
} from "../field/index.js";
import {
  createGlRuntime,
  createProgram,
  drawFullscreen,
  FULLSCREEN_VERT,
} from "./gl.js";
import type { EffectHandle, EffectOptions } from "./runtime.js";

/** The common effect options; a field takes no others (see `createField`). */
export type FieldOptions = EffectOptions;

/** One uniform of the program: where it lives, what the plan holds for it, and what was last sent. */
interface Slot {
  u: UniformValue;
  /** Null when the compiler dropped the uniform (an unused one has no location). */
  loc: WebGLUniformLocation | null;
  sent: number | Float64Array | undefined;
}

function same(prev: Float64Array, v: ArrayLike<number>): boolean {
  for (let k = 0; k < prev.length; k++) if (prev[k] !== v[k]) return false;
  return true;
}

/** Send a uniform unless it already holds this value (a program keeps its uniforms between frames). */
function send(gl: WebGL2RenderingContext, s: Slot): void {
  const { u, loc } = s;
  if (loc === null) return;
  const v = u.v;
  if (typeof v === "number") {
    if (s.sent === v) return;
    s.sent = v;
    if (u.t === "1i") gl.uniform1i(loc, v);
    else if (u.t === "1ui") gl.uniform1ui(loc, v);
    else gl.uniform1f(loc, v);
    return;
  }
  if (s.sent instanceof Float64Array && same(s.sent, v)) return;
  // A float64 copy, so a value that float32 cannot hold still compares equal next frame.
  s.sent = Float64Array.from(v);
  switch (u.t) {
    case "2f":
      gl.uniform2f(loc, Number(v[0]), Number(v[1]));
      break;
    case "3f":
      gl.uniform3f(loc, Number(v[0]), Number(v[1]), Number(v[2]));
      break;
    case "4f":
      gl.uniform4f(loc, Number(v[0]), Number(v[1]), Number(v[2]), Number(v[3]));
      break;
    case "1fv":
      gl.uniform1fv(loc, v);
      break;
    case "2fv":
      gl.uniform2fv(loc, v);
      break;
    case "3fv":
      gl.uniform3fv(loc, v);
      break;
    default:
      gl.uniform4fv(loc, v);
  }
}

/**
 * Live WebGL2 renderer for any field kind: the picture `renderField` computes on the
 * CPU, drawn by one fullscreen shader and driven by the shared GL runtime (so
 * `start`, `stop`, `renderAt`, `loop`, `autoPause`, resize, reduced motion and context
 * loss behave as for every other effect). `spec` is validated by `resolveField` before
 * anything else (a VisError names the parameter) and copied: later edits to the object
 * change nothing.
 *
 * The drawing buffer is the canvas at the runtime's device pixel ratio, and the shader
 * works in whole drawing-buffer pixels, so a frame matches `renderField` at that size
 * and moment (to the tolerance the GLSL documents). The context has
 * `premultipliedAlpha: true` and no `preserveDrawingBuffer`: read pixels in the same
 * task as `renderAt`.
 *
 * Seeds: a field's seed (an unsigned 32 bit integer) is part of its spec, because the
 * picture must be a pure function of the spec for `renderField` and the exporters to
 * agree with it. The common `seed` option is therefore validated (a safe integer, as
 * for every effect) and otherwise ignored: put the seed in the spec.
 *
 * `opts` may carry extra keys (`<VisBackground>` passes `{ spec, ...options }`); they
 * are ignored. `update()` takes the common options only (`loop` is read on every frame,
 * so it takes effect at once; like every effect it cannot be cleared) and a rejected
 * patch changes nothing. To change the spec, `destroy()` and create a new field.
 * `colors` has no meaning for a field and is ignored. `destroy()` frees the program and
 * the palette texture but not the context, so the same canvas can host a new field.
 */
export function createField(
  canvas: HTMLCanvasElement,
  spec: FieldSpec,
  opts: FieldOptions = {},
): EffectHandle {
  const plan = planGpu(resolveField(spec));
  let program: WebGLProgram | null = null;
  let lut: WebGLTexture | null = null;
  let slots: Slot[] = [];

  const handle: EffectHandle = createGlRuntime(
    canvas,
    {
      // Runs on first use and again after a context restore; the old objects died with the old context.
      setup(gl) {
        program = null;
        lut = null;
        slots = [];
        const linked = createProgram(gl, FULLSCREEN_VERT, plan.fragment);
        program = linked;
        // A canvas may have hosted an effect that blends; this one writes opaque pixels.
        gl.disable(gl.BLEND);
        if (plan.lut) {
          lut = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, lut);
          // texelFetch reads level 0 only, but a float texture that is not NEAREST is incomplete and reads as zero.
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGB32F,
            256,
            1,
            0,
            gl.RGB,
            gl.FLOAT,
            plan.lut,
          );
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
        // The plan hands back the same record every frame, so its slots are bound once.
        const record = plan.uniforms(1, 1, timeCoords(0));
        slots = Object.entries(record).map(([name, u]) => ({
          u,
          loc: gl.getUniformLocation(linked, name),
          sent: undefined,
        }));
      },
      render(gl, t, canvasWidth, canvasHeight) {
        // The shader reads gl_FragCoord, which counts drawing-buffer pixels: that size, not the
        // canvas's (a browser may clamp the buffer), is the one the CPU frame is rendered at.
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        if (width < 1 || height < 1) return;
        if (width !== canvasWidth || height !== canvasHeight)
          gl.viewport(0, 0, width, height);
        gl.useProgram(program);
        // `handle.duration` is the live loop: update({ loop }) takes effect on the next frame.
        plan.uniforms(width, height, timeCoords(t, handle.duration));
        for (const slot of slots) send(gl, slot);
        if (lut) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, lut);
        }
        drawFullscreen(gl);
      },
      // Tolerates a setup that threw partway: only what exists is deleted.
      teardown(gl) {
        if (lut) gl.deleteTexture(lut);
        if (program) gl.deleteProgram(program);
        lut = null;
        program = null;
        slots = [];
      },
    },
    opts,
  );
  return handle;
}
