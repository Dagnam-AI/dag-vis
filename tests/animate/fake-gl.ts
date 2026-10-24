/**
 * Recording fakes for the WebGL2 and Canvas2D contexts the animate layer uses.
 * Every call is appended to `calls` as a readable line so tests can assert
 * program setup, uniform uploads, blending, draws and context release without
 * a GPU. `installFakeGl` patches `HTMLCanvasElement.prototype.getContext`
 * (jsdom returns null) and hands the same FakeGl back for repeated calls on
 * one canvas — exactly what browsers do after a context restore.
 */
interface Loc {
  name: string;
}
interface Shader {
  type: number;
  src: string;
}

export class FakeGl {
  readonly VERTEX_SHADER = 0x8b31;
  readonly FRAGMENT_SHADER = 0x8b30;
  readonly COMPILE_STATUS = 0x8b81;
  readonly LINK_STATUS = 0x8b82;
  readonly TRIANGLES = 4;
  readonly COLOR_BUFFER_BIT = 0x4000;
  readonly BLEND = 0x0be2;
  readonly ONE = 1;
  readonly SRC_ALPHA = 0x0302;
  readonly ONE_MINUS_SRC_ALPHA = 0x0303;

  calls: string[] = [];
  compileOk = true;
  linkOk = true;
  /** null simulates a driver that returns no info log. */
  infoLog: string | null = "fake";
  lost = false;
  /** "fragment" fails only the fragment stage (compileOk = false fails both). */
  compileFailsOn: "both" | "fragment" = "both";
  programs = 0;
  readonly attrs: WebGLContextAttributes | undefined;

  constructor(
    readonly canvas: HTMLCanvasElement,
    attrs?: WebGLContextAttributes,
  ) {
    this.attrs = attrs;
  }

  isContextLost(): boolean {
    return this.lost;
  }
  /** Like a browser: the attributes the context was created with, null once it is lost. */
  getContextAttributes(): WebGLContextAttributes | null {
    return this.lost ? null : (this.attrs ?? null);
  }
  /** A lost context hands out null objects, so an effect created on a lost canvas fails visibly. */
  createShader(type: number): Shader | null {
    if (this.lost) return null;
    this.calls.push(
      `createShader ${type === this.VERTEX_SHADER ? "vertex" : "fragment"}`,
    );
    return { type, src: "" };
  }
  shaderSource(s: Shader, src: string): void {
    s.src = src;
  }
  compileShader(): void {
    this.calls.push("compileShader");
  }
  getShaderParameter(s: Shader): boolean {
    if (this.compileOk) return true;
    return this.compileFailsOn === "fragment" && s.type === this.VERTEX_SHADER;
  }
  getShaderInfoLog(): string | null {
    return this.infoLog === null ? null : `${this.infoLog}: compile error`;
  }
  deleteShader(): void {
    this.calls.push("deleteShader");
  }
  createProgram(): object {
    this.programs += 1;
    this.calls.push("createProgram");
    return { id: this.programs };
  }
  attachShader(): void {
    // not recorded: every program attaches the same two shaders
  }
  linkProgram(): void {
    this.calls.push("linkProgram");
  }
  getProgramParameter(): boolean {
    return this.linkOk;
  }
  getProgramInfoLog(): string | null {
    return this.infoLog === null ? null : `${this.infoLog}: link error`;
  }
  deleteProgram(): void {
    this.calls.push("deleteProgram");
  }
  useProgram(): void {
    this.calls.push("useProgram");
  }
  getUniformLocation(_p: object, name: string): Loc {
    this.calls.push(`getUniformLocation ${name}`);
    return { name };
  }
  uniform1f(l: Loc, x: number): void {
    this.calls.push(`uniform1f ${l.name} ${x}`);
  }
  uniform2f(l: Loc, x: number, y: number): void {
    this.calls.push(`uniform2f ${l.name} ${x} ${y}`);
  }
  uniform3f(l: Loc, x: number, y: number, z: number): void {
    this.calls.push(`uniform3f ${l.name} ${x} ${y} ${z}`);
  }
  uniform1i(l: Loc, x: number): void {
    this.calls.push(`uniform1i ${l.name} ${x}`);
  }
  viewport(x: number, y: number, w: number, h: number): void {
    this.calls.push(`viewport ${x} ${y} ${w} ${h}`);
  }
  clearColor(r: number, g: number, b: number, a: number): void {
    this.calls.push(`clearColor ${r} ${g} ${b} ${a}`);
  }
  clear(mask: number): void {
    this.calls.push(`clear ${mask}`);
  }
  enable(cap: number): void {
    this.calls.push(`enable ${cap}`);
  }
  disable(cap: number): void {
    this.calls.push(`disable ${cap}`);
  }
  blendFuncSeparate(a: number, b: number, c: number, d: number): void {
    this.calls.push(`blendFuncSeparate ${a} ${b} ${c} ${d}`);
  }
  drawArrays(mode: number, first: number, count: number): void {
    this.calls.push(`drawArrays ${mode} ${first} ${count}`);
  }
  getExtension(name: string): { loseContext(): void } | null {
    if (name !== "WEBGL_lose_context") return null;
    return {
      loseContext: () => {
        this.lost = true;
        this.calls.push("loseContext");
      },
    };
  }
}

class FakeGradient {
  constructor(
    readonly owner: Fake2d,
    readonly kind: string,
  ) {}
  addColorStop(at: number, color: string): void {
    this.owner.calls.push(`addColorStop ${this.kind} ${at} ${color}`);
  }
}

export class Fake2d {
  calls: string[] = [];
  font = "";
  fillStyle: unknown = "";
  strokeStyle: unknown = "";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "miter";
  globalAlpha = 1;
  textBaseline = "alphabetic";
  constructor(readonly canvas: HTMLCanvasElement) {}
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void {
    this.calls.push(`setTransform ${a} ${b} ${c} ${d} ${e} ${f}`);
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    this.calls.push(`clearRect ${x} ${y} ${w} ${h}`);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push(`fillRect ${x} ${y} ${w} ${h} ${String(this.fillStyle)}`);
  }
  fillText(text: string, x: number, y: number): void {
    this.calls.push(`fillText ${text} ${x} ${y} ${String(this.fillStyle)}`);
  }
  beginPath(): void {
    this.calls.push("beginPath");
  }
  moveTo(x: number, y: number): void {
    this.calls.push(`moveTo ${x} ${y}`);
  }
  lineTo(x: number, y: number): void {
    this.calls.push(`lineTo ${x} ${y}`);
  }
  stroke(): void {
    this.calls.push(`stroke ${this.lineWidth} ${this.globalAlpha}`);
  }
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): FakeGradient {
    this.calls.push(`createLinearGradient ${x0} ${y0} ${x1} ${y1}`);
    return new FakeGradient(this, "linear");
  }
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): FakeGradient {
    this.calls.push(`createRadialGradient ${x0} ${y0} ${r0} ${x1} ${y1} ${r1}`);
    return new FakeGradient(this, "radial");
  }
}

const GL_CACHE = new WeakMap<HTMLCanvasElement, FakeGl>();
const CTX_CACHE = new WeakMap<HTMLCanvasElement, Fake2d>();

export function installFakeGl(
  opts: { webgl2?: boolean; canvas2d?: boolean } = {},
): {
  gls: FakeGl[];
  ctx2ds: Fake2d[];
  restore(): void;
} {
  const gls: FakeGl[] = [];
  const ctx2ds: Fake2d[] = [];
  const proto = HTMLCanvasElement.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, "getContext");
  const fake = function (
    this: HTMLCanvasElement,
    type: string,
    attrs?: WebGLContextAttributes,
  ) {
    if (type === "webgl2") {
      if (opts.webgl2 === false) return null;
      let gl = GL_CACHE.get(this);
      if (!gl) {
        gl = new FakeGl(this, attrs);
        GL_CACHE.set(this, gl);
        gls.push(gl);
      }
      return gl;
    }
    if (type === "2d") {
      if (opts.canvas2d === false) return null;
      let ctx = CTX_CACHE.get(this);
      if (!ctx) {
        ctx = new Fake2d(this);
        CTX_CACHE.set(this, ctx);
        ctx2ds.push(ctx);
      }
      return ctx;
    }
    return null;
  };
  Object.defineProperty(proto, "getContext", {
    value: fake,
    configurable: true,
    writable: true,
  });
  return {
    gls,
    ctx2ds,
    restore() {
      if (original) Object.defineProperty(proto, "getContext", original);
    },
  };
}
