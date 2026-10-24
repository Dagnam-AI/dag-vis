import { describe, expect, it } from "vitest";
import { GLSL_FLUTED } from "../../../src/field/glsl/fluted.js";
import { MAX_REEDS } from "../../../src/field/spec.js";

const compact = GLSL_FLUTED.replace(/\s+/g, "");

describe("GLSL_FLUTED", () => {
  it("defines fieldColor over a SOURCE macro with the reed uniforms", () => {
    expect(GLSL_FLUTED).toContain("vec3 fieldColor(vec2 uv)");
    expect(GLSL_FLUTED).toContain("SOURCE(");
    for (const u of [
      "uniform int uReeds;",
      "uniform int uVertical;",
      "uniform float uRefraction;",
      "uniform float uShade;",
    ])
      expect(GLSL_FLUTED).toContain(u);
    expect(GLSL_FLUTED).toContain("smoothstep(0.0, 0.3, f)");
    expect(GLSL_FLUTED).toContain("smoothstep(0.7, 1.0, f)");
  });

  it("sizes the offsets uniform to the reed cap, packed four to a vec4", () => {
    expect(MAX_REEDS).toBe(256);
    expect(MAX_REEDS % 4).toBe(0);
    expect(GLSL_FLUTED).toContain(`uniform vec4 uOffsets[${MAX_REEDS / 4}];`);
    expect(compact).toContain("uOffsets[i>>2][i&3]");
  });

  it("finds the reed with integer arithmetic on the pixel, as the CPU does", () => {
    expect(compact).toContain("intsize=vertical?uWidth:uHeight;");
    expect(compact).toContain(
      "intp=int(clamp(floor(a*float(size)),0.0,float(size-1)));",
    );
    expect(compact).toContain("intn=(2*p+1)*uReeds;");
    expect(compact).toContain("intd=2*size;");
    expect(compact).toContain("inti=n/d;");
    expect(compact).toContain("floatf=float(n-i*d)/float(d);");
  });

  it("carries the CPU refraction and shade maths", () => {
    expect(compact).toContain("floatc=(float(i)+0.5)/float(uReeds);");
    expect(compact).toContain(
      "floata2=c+(a-c)*(1.0-uRefraction)+uOffsets[i>>2][i&3];",
    );
    expect(compact).toContain(
      "floatm=1.0-uShade*0.7*(1.0-smoothstep(0.0,0.3,f))+uShade*0.35*smoothstep(0.7,1.0,f);",
    );
    expect(compact).toContain("returncol*m;");
  });

  it("uses no trigonometry, pow, exp, log, sqrt or hash of its own", () => {
    for (const word of ["sin", "cos", "pow", "exp", "log", "sqrt", "hash"])
      expect(GLSL_FLUTED).not.toContain(word);
  });

  it("is balanced and leaves the shared uniforms to the common code", () => {
    expect(GLSL_FLUTED.split("{").length).toBe(GLSL_FLUTED.split("}").length);
    expect(GLSL_FLUTED).not.toContain("uniform int uWidth");
    expect(GLSL_FLUTED).not.toContain("uniform int uHeight");
  });
});
