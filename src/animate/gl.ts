import { VisError } from "../core/index.js";
import {
  COMMON_DEFAULTS,
  createRuntime,
  merge,
  validateCommon,
  type EffectHandle,
  type EffectOptions,
  type FrameRenderer,
  type ResolvedOptions,
} from "./runtime.js";

/**
 * Attributeless fullscreen triangle: three vertices from gl_VertexID cover
 * clip space, so no buffer or VAO is needed. Fragments get their position from
 * gl_FragCoord; effects that want a 0..1 uv divide by the resolution.
 */
export const FULLSCREEN_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * A canvas keeps the context it first created, so a second effect on the same
 * canvas must use the same `premultipliedAlpha` (dither and pixel blast: true,
 * terminal: false); the other mode throws a VisError, and needs a fresh canvas.
 *
 * Lifecycle: `destroy()` releases the effect's GPU objects (programs, and
 * whatever a hook's `teardown` deletes); the canvas keeps its context, so the
 * same canvas can host a new effect afterwards (React StrictMode mounts twice
 * on one node; switching effects reuses it). Nothing here calls
 * `WEBGL_lose_context.loseContext()`: a lost context stays lost for that
 * canvas and the next effect would fail. A caller that is done with a canvas
 * loses its context itself (`canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext()`):
 * the React wrapper gives each mount its own canvas and does so on unmount,
 * since a removed canvas otherwise holds its context until garbage collection.
 */
export function getGl(
  canvas: HTMLCanvasElement,
  premultipliedAlpha: boolean,
): WebGL2RenderingContext {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) throw new VisError("WebGL2 is not available on this canvas");
  // A canvas keeps the context it first created; compositing with the wrong alpha mode would
  // silently give a too bright or fringed picture. A lost context has no attributes to compare.
  const existing = gl.getContextAttributes()?.premultipliedAlpha;
  if (existing !== undefined && existing !== premultipliedAlpha)
    throw new VisError(
      `premultipliedAlpha: this canvas already has a context created with premultipliedAlpha ${String(existing)}; use a fresh canvas`,
    );
  return gl;
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
  label: string,
): WebGLShader {
  // null means the context is lost (or out of resources); say so instead of crashing in shaderSource.
  const shader = gl.createShader(type);
  if (!shader)
    throw new VisError(
      `could not create the ${label} shader (is the WebGL context lost?)`,
    );
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new VisError(`${label} shader failed to compile: ${log}`);
  }
  return shader;
}

/** Compile both stages and link; a failure is a VisError carrying the driver's info log. */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex, "vertex");
  let fs: WebGLShader;
  try {
    fs = compile(gl, gl.FRAGMENT_SHADER, fragment, "fragment");
  } catch (error) {
    gl.deleteShader(vs);
    throw error;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "";
    gl.deleteProgram(program);
    throw new VisError(`program failed to link: ${log}`);
  }
  return program;
}

/** One fullscreen triangle; pair with FULLSCREEN_VERT. */
export function drawFullscreen(gl: WebGL2RenderingContext): void {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export interface GlProgram {
  readonly gl: WebGL2RenderingContext;
  readonly program: WebGLProgram;
  f1(name: string, x: number): void;
  f2(name: string, x: number, y: number): void;
  f3(name: string, x: number, y: number, z: number): void;
  i1(name: string, x: number): void;
}

/**
 * Uniform setters by name with cached locations. WebGL writes uniforms to the
 * currently bound program, so call `gl.useProgram(program)` before using them.
 */
export function uniformSetters(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
): GlProgram {
  const locations = new Map<string, WebGLUniformLocation | null>();
  const loc = (name: string): WebGLUniformLocation | null => {
    let l = locations.get(name);
    if (l === undefined) {
      l = gl.getUniformLocation(program, name);
      locations.set(name, l);
    }
    return l;
  };
  return {
    gl,
    program,
    f1: (n, x) => {
      gl.uniform1f(loc(n), x);
    },
    f2: (n, x, y) => {
      gl.uniform2f(loc(n), x, y);
    },
    f3: (n, x, y, z) => {
      gl.uniform3f(loc(n), x, y, z);
    },
    i1: (n, x) => {
      gl.uniform1i(loc(n), x);
    },
  };
}

export interface GlEffectSpec {
  fragment: string;
  /** Context attribute. true = write (premultiplied) rgb; false = the compositor multiplies by alpha. */
  premultipliedAlpha: boolean;
  /** true = SRC_ALPHA / ONE_MINUS_SRC_ALPHA (separate alpha ONE / ONE_MINUS_SRC_ALPHA); false = raw write. */
  blend: boolean;
  uniforms(
    p: GlProgram,
    t: number,
    width: number,
    height: number,
    dpr: number,
  ): void;
}

/** One fullscreen program per effect; rebuilds itself after a context restore. */
export function glRenderer(spec: GlEffectSpec): FrameRenderer {
  // gl and canvas are assigned by init(); every other entry point checks `program` or `live` first.
  let gl: WebGL2RenderingContext;
  let canvas: HTMLCanvasElement;
  let live = false;
  let program: GlProgram | undefined;
  let dpr = 1;
  // The latest requested frame, remembered even when it was skipped, so a restore can repaint it.
  let lastT = 0;

  const build = (): GlProgram =>
    uniformSetters(gl, createProgram(gl, FULLSCREEN_VERT, spec.fragment));
  const onLost = (e: Event): void => {
    e.preventDefault();
    program = undefined;
  };

  const renderer: FrameRenderer = {
    init(c) {
      canvas = c;
      gl = getGl(c, spec.premultipliedAlpha);
      live = true;
      program = build();
      c.addEventListener("webglcontextlost", onLost);
      c.addEventListener("webglcontextrestored", onRestored);
    },
    resize(d) {
      dpr = d;
    },
    draw(t) {
      lastT = t;
      if (!program || gl.isContextLost()) return;
      const { width, height } = canvas;
      gl.useProgram(program.program);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (spec.blend) {
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(
          gl.SRC_ALPHA,
          gl.ONE_MINUS_SRC_ALPHA,
          gl.ONE,
          gl.ONE_MINUS_SRC_ALPHA,
        );
      } else {
        gl.disable(gl.BLEND);
      }
      spec.uniforms(program, t, width, height, dpr);
      drawFullscreen(gl);
    },
    dispose() {
      if (!live) return;
      live = false;
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      // The program is the only GL object this renderer owns; the canvas keeps its context (see getGl).
      if (program) gl.deleteProgram(program.program);
      program = undefined;
    },
  };
  // A loss clears the drawing buffer and a non-looping handle never redraws on its own.
  const onRestored = (): void => {
    program = build();
    renderer.draw(lastT);
  };
  return renderer;
}

/** Hook form for an effect that brings its own draw callback: the runtime owns the context. */
export interface GlHooks {
  /** Compile programs, upload textures. Runs on first use and again after a context restore. */
  setup(gl: WebGL2RenderingContext): void;
  render(
    gl: WebGL2RenderingContext,
    t: number,
    width: number,
    height: number,
  ): void;
  /**
   * Delete everything setup created. Runs on destroy even when setup threw
   * partway (first use or after a restore), so it must tolerate partial setup.
   * Do not lose the context: the canvas outlives the effect.
   */
  teardown?(gl: WebGL2RenderingContext): void;
}

export function createGlRuntime(
  canvas: HTMLCanvasElement,
  hooks: GlHooks,
  opts: EffectOptions = {},
): EffectHandle {
  const o = merge<ResolvedOptions<EffectOptions>>({ ...COMMON_DEFAULTS }, opts);
  validateCommon(o);
  // Assigned by init(); createRuntime never draws or disposes before it.
  let gl: WebGL2RenderingContext;
  let live = false;
  let ready = false;
  // The latest requested frame, remembered even when it was skipped, so a restore can repaint it.
  let lastT = 0;
  const onLost = (e: Event): void => {
    e.preventDefault();
    ready = false;
  };
  const renderer: FrameRenderer = {
    init(c) {
      gl = getGl(c, true);
      live = true;
      hooks.setup(gl);
      ready = true;
      c.addEventListener("webglcontextlost", onLost);
      c.addEventListener("webglcontextrestored", onRestored);
    },
    resize() {
      // Device size is read from the canvas on every frame.
    },
    draw(t) {
      lastT = t;
      if (!ready || gl.isContextLost()) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      hooks.render(gl, t, canvas.width, canvas.height);
    },
    dispose() {
      // init() can throw (no WebGL2, failing setup); destroy() still calls dispose then.
      if (!live) return;
      live = false;
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      hooks.teardown?.(gl);
      ready = false;
    },
  };
  // A loss clears the drawing buffer and a non-looping handle never redraws on its own.
  const onRestored = (): void => {
    hooks.setup(gl);
    ready = true;
    renderer.draw(lastT);
  };
  return createRuntime<EffectOptions>(canvas, o, validateCommon, renderer);
}
