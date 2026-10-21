import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { LOGO, logoSvg } from "../../src/brand/logo.js";
import { expectGolden } from "../helpers/golden.js";

describe("LOGO", () => {
  it("carries the verbatim viewBox and a single closed path", () => {
    expect(LOGO.viewBox).toBe("199 193 628 628");
    expect(LOGO).toMatchObject({ x: 199, y: 193, width: 628, height: 628 });
    expect(LOGO.path.startsWith("M615.026245,442.038239")).toBe(true);
    expect(LOGO.path.endsWith("Z")).toBe(true);
    expect(LOGO.path).not.toMatch(/\s{2,}|\n/);
  });
});

describe("logoSvg", () => {
  it("defaults to a 256px transparent mark in brand red", () => {
    const svg = logoSvg();
    expect(svg).toContain('width="256" height="256"');
    expect(svg).toContain('fill="#ef4444"');
    expect(svg).not.toContain("<rect");
    expectGolden("brand/logo-default.svg", svg);
  });

  it("adds an opaque background and padding when asked", () => {
    const svg = logoSvg({
      color: "#ffffff",
      size: 180,
      background: "#0a0a0a",
      padding: 0.125,
    });
    expect(svg).toContain('<rect width="180" height="180" fill="#0a0a0a"/>');
    expect(svg).toContain("translate(22.5 22.5)");
    expectGolden("brand/logo-apple-touch.svg", svg);
  });

  it("is deterministic", () => {
    expect(logoSvg({ size: 64 })).toBe(logoSvg({ size: 64 }));
  });

  it("validates colour, size and padding", () => {
    expect(() => logoSvg({ color: "nope" })).toThrow(VisError);
    expect(() => logoSvg({ size: 0 })).toThrow(VisError);
    expect(() => logoSvg({ padding: 0.5 })).toThrow(VisError);
    expect(() => logoSvg({ padding: -0.1 })).toThrow(VisError);
  });
});
