// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createField } from "../../src/animate/field.js";
import { VisError } from "../../src/core/index.js";
import type { FieldPresetName, FieldSpec } from "../../src/field/index.js";
import { fieldPresets } from "../../src/field/presets.js";
import { timeCoords } from "../../src/field/time.js";
import { installFakeDom, type FakeDom } from "./fake-dom.js";
import { FakeGl, installFakeGl } from "./fake-gl.js";

const preset = (name: FieldPresetName): FieldSpec => fieldPresets[name];
const uniforms = (calls: string[]) =>
  calls.filter((c) => c.startsWith("uniform"));
const names = (calls: string[]) => uniforms(calls).map((c) => c.split(" ")[1]!);

describe("createField", () => {
  let dom: FakeDom;
  let fake: ReturnType<typeof installFakeGl>;
  let canvas: HTMLCanvasElement;
  const gl = () => fake.gls[0]!;

  function mount(dpr = 1, width = 32, height = 16): void {
    dom = installFakeDom({ dpr });
    fake = installFakeGl();
    const parent = document.createElement("div");
    parent.getBoundingClientRect = () =>
      ({ width, height }) as unknown as DOMRect;
    canvas = document.createElement("canvas");
    parent.appendChild(canvas);
    document.body.appendChild(parent);
  }
  const unmount = (): void => {
    fake.restore();
    dom.restore();
    document.body.innerHTML = "";
  };
  beforeEach(() => {
    mount();
  });
  afterEach(unmount);

  it("creates no context before use; the first frame builds the program and the LUT, then draws", () => {
    const h = createField(canvas, preset("lunar"), { loop: { duration: 6 } });
    expect(fake.gls).toHaveLength(0);
    h.renderAt(1.5);
    const calls = gl().calls;
    expect(gl().attrs).toMatchObject({ premultipliedAlpha: true });
    const at = (c: string) => calls.indexOf(c);
    expect(at("linkProgram")).toBeGreaterThan(-1);
    expect(calls).toContain(`disable ${gl().BLEND}`);
    const tex = at(
      `texImage2D ${gl().RGB32F} 256x1 ${gl().RGB} ${gl().FLOAT} ${256 * 3 * 4}`,
    );
    expect(tex).toBeGreaterThan(at("linkProgram"));
    expect(gl().textures[0]).toHaveLength(768);
    expect(calls.filter((c) => c.startsWith("texParameteri"))).toEqual([
      `texParameteri ${gl().TEXTURE_MIN_FILTER} ${gl().NEAREST}`,
      `texParameteri ${gl().TEXTURE_MAG_FILTER} ${gl().NEAREST}`,
      `texParameteri ${gl().TEXTURE_WRAP_S} ${gl().CLAMP_TO_EDGE}`,
      `texParameteri ${gl().TEXTURE_WRAP_T} ${gl().CLAMP_TO_EDGE}`,
    ]);
    expect(h.duration).toBe(6);
  });

  it("uploads the whole flow uniform set on the first frame, in plan order, at the drawing buffer size", () => {
    const h = createField(canvas, preset("lunar"), { loop: { duration: 6 } });
    h.renderAt(1.5);
    const tc = timeCoords(1.5, 6);
    const calls = gl().calls;
    const frame = calls.slice(calls.lastIndexOf("useProgram"));
    expect(names(frame)).toEqual([
      "uWidth",
      "uHeight",
      "uAspect",
      "uSeed",
      "uGrainSeed",
      "uGrain",
      "uGrainFrame",
      "uTime",
      "uShape",
      "uOctaves",
      "uStrength",
      "uWarpScale",
      "uScale",
      "uRot",
      "uVignette",
      "uHasHighlight",
      "uHighlight",
      "uHighlightColor",
      "uLut",
    ]);
    const u = uniforms(frame);
    expect(u).toContain("uniform1i uWidth 32");
    expect(u).toContain("uniform1i uHeight 16");
    expect(u).toContain("uniform1f uAspect 2");
    expect(u).toContain("uniform1ui uSeed 2");
    expect(u).toContain("uniform1ui uGrainSeed 2");
    expect(u).toContain(`uniform1i uGrainFrame ${tc.grainFrame}`);
    expect(u).toContain(`uniform2f uTime ${tc.z} ${tc.w}`);
    expect(u).toContain("uniform1i uShape 3");
    expect(u).toContain("uniform4f uHighlight 0.85 0.3 0.45 0.6");
    expect(u).toContain("uniform1i uLut 0");
    expect(frame.slice(-3)).toEqual([
      `activeTexture ${gl().TEXTURE0}`,
      `bindTexture ${gl().TEXTURE_2D} tex`,
      `drawArrays ${gl().TRIANGLES} 0 3`,
    ]);
  });

  it("sends only what changed: nothing for a repeated frame, the time for a new one", () => {
    const h = createField(canvas, preset("lunar"));
    h.renderAt(0);
    gl().calls.length = 0;
    h.renderAt(0);
    expect(uniforms(gl().calls)).toEqual([]);
    expect(gl().calls.at(-1)).toBe(`drawArrays ${gl().TRIANGLES} 0 3`);
    gl().calls.length = 0;
    h.renderAt(2);
    expect(names(gl().calls)).toEqual(["uGrainFrame", "uTime"]);
  });

  it("follows the drawing buffer size, including a resize and the device pixel ratio", () => {
    unmount();
    mount(2, 32, 16);
    const h = createField(canvas, preset("lunar"));
    h.renderAt(0);
    expect(uniforms(gl().calls)).toContain("uniform1i uWidth 64");
    expect(uniforms(gl().calls)).toContain("uniform1f uAspect 2");
    gl().calls.length = 0;
    dom.resize(30, 10); // the running effect repaints its last frame
    expect(uniforms(gl().calls)).toEqual([
      "uniform1i uWidth 60",
      "uniform1i uHeight 20",
      "uniform1f uAspect 3",
    ]);
    expect(gl().calls.at(-1)).toBe(`drawArrays ${gl().TRIANGLES} 0 3`);
  });

  it("sizes the program by the drawing buffer when the browser clamped it, and sets that viewport", () => {
    const h = createField(canvas, preset("lunar"));
    h.renderAt(0);
    gl().bufferSize = [20, 10];
    gl().calls.length = 0;
    h.renderAt(0);
    const calls = gl().calls;
    expect(uniforms(calls)).toEqual([
      "uniform1i uWidth 20",
      "uniform1i uHeight 10",
    ]);
    // The runtime sets the canvas-sized viewport first; the field then sets the buffer's.
    expect(calls.filter((c) => c.startsWith("viewport"))).toEqual([
      "viewport 0 0 32 16",
      "viewport 0 0 20 10",
    ]);
    gl().bufferSize = null;
    gl().calls.length = 0;
    h.renderAt(0);
    expect(gl().calls.filter((c) => c.startsWith("viewport"))).toEqual([
      "viewport 0 0 32 16",
    ]);
  });

  it("draws nothing into an empty drawing buffer", () => {
    const h = createField(canvas, preset("lunar"));
    h.renderAt(0);
    gl().bufferSize = [0, 10];
    gl().calls.length = 0;
    expect(() => {
      h.renderAt(1);
    }).not.toThrow();
    gl().bufferSize = [10, 0];
    h.renderAt(2);
    expect(gl().calls.filter((c) => !c.startsWith("viewport"))).toEqual([]);
  });

  it("fluid has no LUT texture and sends the array uniforms from the plan", () => {
    const h = createField(canvas, preset("fluid-dawn"));
    h.renderAt(0);
    const calls = gl().calls;
    expect(calls.some((c) => c.startsWith("texImage2D"))).toBe(false);
    expect(calls).not.toContain(`activeTexture ${gl().TEXTURE0}`);
    const u = uniforms(calls);
    expect(u).toContain("uniform2fv uPos 16");
    expect(u).toContain("uniform3fv uLab 24");
    expect(u).toContain("uniform1fv uSigma 8");
    expect(u).toContain("uniform1i uCount 5");
    expect(u.some((c) => c.startsWith("uniform3f uBaseLab "))).toBe(true);
    expect(u.some((c) => c.startsWith("uniform1i uLut"))).toBe(false);
    expect(gl().uploads.get("uPos")).toHaveLength(16);
    expect(gl().uploads.get("uSigma")?.[0]).toBeCloseTo(
      2 * (0.35 * 1.2) ** 2,
      6,
    );
  });

  it("moves the fluid points with time and resends them only when they moved", () => {
    const h = createField(canvas, preset("fluid-dawn"));
    h.renderAt(0);
    const at0 = gl().uploads.get("uPos");
    gl().calls.length = 0;
    h.renderAt(0);
    expect(uniforms(gl().calls)).toEqual([]);
    h.renderAt(1);
    expect(names(gl().calls)).toEqual(["uGrainFrame", "uTime", "uPos"]);
    expect(gl().uploads.get("uPos")).not.toEqual(at0);
  });

  it("fluted sends the reed offsets as vec4s and the direction", () => {
    const h = createField(canvas, preset("fluted-ember"));
    h.renderAt(0);
    const u = uniforms(gl().calls);
    expect(u).toContain("uniform4fv uOffsets 256");
    expect(u).toContain("uniform1i uVertical 1");
    expect(u).toContain("uniform1i uReeds 28");
    expect(u).toContain("uniform1ui uSeed 1");
    expect(u).toContain("uniform1ui uGrainSeed 19");
    expect(gl().uploads.get("uOffsets")).toHaveLength(256);
    expect(gl().calls.some((c) => c.startsWith("texImage2D"))).toBe(false);
  });

  it("fluted over a flow source uploads its LUT", () => {
    const h = createField(canvas, {
      kind: "fluted",
      source: { kind: "flow", palette: ["#000", "#fff"] },
    });
    h.renderAt(0);
    expect(gl().calls.filter((c) => c.startsWith("texImage2D"))).toHaveLength(
      1,
    );
    expect(uniforms(gl().calls)).toContain("uniform4fv uOffsets 256");
  });

  it("sends the same frame at t = 0 and t = loop", () => {
    const h = createField(canvas, preset("lagoon"), { loop: { duration: 4 } });
    h.renderAt(0);
    h.renderAt(1.3);
    gl().calls.length = 0;
    h.renderAt(0);
    const a = [...gl().calls];
    h.renderAt(1.3);
    gl().calls.length = 0;
    h.renderAt(4);
    expect(gl().calls).toEqual(a);
  });

  it("repaints after a context restore with a fresh program, LUT and every uniform", () => {
    const h = createField(canvas, preset("pine"));
    h.renderAt(0.5);
    const first = names(gl().calls);
    gl().calls.length = 0;
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    h.renderAt(1); // lost: nothing is drawn
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    const calls = gl().calls;
    expect(calls.filter((c) => c === "linkProgram")).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith("texImage2D"))).toHaveLength(1);
    expect(calls.filter((c) => c === "createTexture")).toHaveLength(1);
    expect(names(calls.slice(calls.lastIndexOf("useProgram")))).toEqual(first);
    expect(calls.at(-1)).toBe(`drawArrays ${gl().TRIANGLES} 0 3`);
    // The restored frame samples the rebuilt texture, and destroy frees the live objects.
    expect(gl().createdTextures).toHaveLength(2);
    expect(gl().boundTextures.at(-1)).toBe(gl().createdTextures[1]);
    h.destroy();
    expect(gl().deletedTextures).toEqual([gl().createdTextures[1]]);
    expect(gl().deletedPrograms).toEqual([gl().createdPrograms[1]]);
  });

  it("destroy frees the program and the LUT, never the context, and the canvas can host another field", () => {
    const h = createField(canvas, preset("lagoon"));
    h.renderAt(0);
    expect(gl().createdTextures).toHaveLength(1);
    expect(gl().createdPrograms).toHaveLength(1);
    // The texture the frame sampled is the one that was uploaded.
    expect(gl().boundTextures.at(-1)).toBe(gl().createdTextures[0]);
    gl().calls.length = 0;
    h.destroy();
    expect(gl().calls).toEqual(["deleteTexture", "deleteProgram"]);
    expect(gl().deletedTextures).toEqual(gl().createdTextures);
    expect(gl().deletedPrograms).toEqual(gl().createdPrograms);
    expect(() => {
      h.renderAt(0);
    }).toThrow(VisError);
    const again = createField(canvas, preset("fluid-dawn"));
    gl().calls.length = 0;
    expect(() => {
      again.renderAt(0);
    }).not.toThrow();
    expect(gl().calls).toContain("linkProgram");
    expect(fake.gls).toHaveLength(1);
    again.destroy();
    expect(gl().calls.at(-1)).toBe("deleteProgram");
    expect(gl().deletedPrograms[1]).toBe(gl().createdPrograms[1]);
    expect(gl().deletedPrograms[1]).not.toBe(gl().createdPrograms[0]);
    expect(gl().calls).not.toContain("loseContext");
  });

  it("throws a VisError naming the parameter on an invalid spec, before touching the canvas", () => {
    expect(() =>
      createField(canvas, { kind: "flow", palette: ["#000"] } as never),
    ).toThrow(VisError);
    expect(() =>
      createField(canvas, { kind: "flow", palette: ["#000"] } as never),
    ).toThrow(/palette/);
    expect(() => createField(canvas, { kind: "plasma" } as never)).toThrow(
      /kind/,
    );
    expect(fake.gls).toHaveLength(0);
  });

  it("rejects invalid common options at creation", () => {
    expect(() => createField(canvas, preset("lunar"), { speed: -1 })).toThrow(
      /speed/,
    );
    expect(() =>
      createField(canvas, preset("lunar"), { seed: 1.5 } as never),
    ).toThrow(/seed/);
    expect(fake.gls).toHaveLength(0);
  });

  it("surfaces a shader that fails to compile, and still destroys cleanly", () => {
    // The canvas hands out one context: break its compiler before the field asks for it.
    (canvas.getContext("webgl2") as unknown as FakeGl).compileOk = false;
    const h = createField(canvas, preset("lunar"));
    expect(() => {
      h.renderAt(0);
    }).toThrow(/failed to compile/);
    gl().calls.length = 0;
    h.destroy();
    expect(gl().calls).toEqual([]);
  });

  it("skips a uniform the compiler optimised away (null location)", () => {
    const spy = vi
      .spyOn(FakeGl.prototype, "getUniformLocation")
      .mockImplementation(function (this: FakeGl, _p: object, name: string) {
        this.calls.push(`getUniformLocation ${name}`);
        return (name === "uVignette" ? null : { name }) as never;
      });
    try {
      const h = createField(canvas, preset("cobalt"));
      expect(() => {
        h.renderAt(0);
      }).not.toThrow();
      expect(names(gl().calls)).not.toContain("uVignette");
      expect(names(gl().calls)).toContain("uScale");
    } finally {
      spy.mockRestore();
    }
  });

  it("ignores extra option keys, as the React wrapper passes { spec, ...options }", () => {
    const spec = preset("rose");
    const h = createField(canvas, spec, { spec, speed: 2 } as never);
    expect(() => {
      h.renderAt(0);
    }).not.toThrow();
  });

  describe("update", () => {
    it("takes the loop at draw time and cannot clear it", () => {
      const h = createField(canvas, preset("lagoon"));
      h.renderAt(0);
      expect(h.duration).toBeUndefined();
      h.update({ loop: { duration: 2 } });
      expect(h.duration).toBe(2);
      gl().calls.length = 0;
      h.renderAt(3); // wraps to 1 s of a 2 s loop
      const tc = timeCoords(1, 2);
      expect(uniforms(gl().calls)).toContain(`uniform2f uTime ${tc.z} ${tc.w}`);
      h.update({ loop: undefined });
      expect(h.duration).toBe(2);
    });

    it("leaves everything as it was when a patch is invalid", () => {
      const h = createField(canvas, preset("lagoon"), {
        loop: { duration: 4 },
      });
      h.renderAt(1);
      expect(() => {
        h.update({ speed: 2, loop: { duration: -1 } });
      }).toThrow(/loop/);
      expect(h.duration).toBe(4);
    });

    it("does not let a seed option change a field: the spec's seed is the only one", () => {
      const h = createField(canvas, preset("lunar"), { seed: 99 } as never);
      h.renderAt(0);
      expect(uniforms(gl().calls)).toContain("uniform1ui uSeed 2");
      h.update({ seed: 7 } as never);
      gl().calls.length = 0;
      h.renderAt(1);
      expect(names(gl().calls)).not.toContain("uSeed");
      expect(() => {
        h.update({ seed: 1.5 } as never);
      }).toThrow(/seed/);
    });
  });

  describe("update with a spec", () => {
    const patch = (spec: unknown, extra: object = {}) =>
      ({ spec, ...extra }) as never;

    it("accepts the same spec by value and still applies the rest of the patch", () => {
      const h = createField(canvas, preset("lagoon"));
      h.renderAt(0);
      const copy = structuredClone(preset("lagoon"));
      expect(() => {
        h.update(patch(copy, { loop: { duration: 3 } }));
      }).not.toThrow();
      expect(h.duration).toBe(3);
      expect(() => {
        h.update(patch(undefined));
      }).not.toThrow();
    });

    it("throws a VisError for a different spec and applies nothing of the patch", () => {
      const h = createField(canvas, preset("lagoon"));
      h.renderAt(0);
      const other = { ...(preset("lagoon") as object), seed: 77 };
      expect(() => {
        h.update(patch(other, { loop: { duration: 3 } }));
      }).toThrow(VisError);
      expect(() => {
        h.update(patch(preset("fluid-dawn")));
      }).toThrow(/destroy it and create a new one/);
      expect(h.duration).toBeUndefined();
    });

    it("throws the validation error, naming the parameter, for an invalid spec", () => {
      const h = createField(canvas, preset("lagoon"));
      expect(() => {
        h.update(patch({ kind: "flow", palette: ["#000"] }));
      }).toThrow(/palette/);
    });
  });

  it("animates when started: each frame advances the time", () => {
    const h = createField(canvas, preset("fluid-dawn"));
    h.start();
    dom.frame(16);
    expect(gl().calls.filter((c) => c.startsWith("drawArrays"))).toHaveLength(
      1,
    );
    gl().calls.length = 0;
    dom.frame(400);
    expect(names(gl().calls)).toContain("uTime");
    h.destroy();
  });
});
