import { describe, expectTypeOf, it } from "vitest";
import type { Sampler } from "../../../src/field/cpu/types.js";
import type { TimeCoords } from "../../../src/field/time.js";

describe("Sampler contract", () => {
  it("prepares per frame and samples per pixel into a Float64Array", () => {
    expectTypeOf<Sampler["prepare"]>().parameter(0).toEqualTypeOf<TimeCoords>();
    expectTypeOf<Sampler["prepare"]>().returns.toBeVoid();
    expectTypeOf<Sampler["sample"]>().parameters.toEqualTypeOf<
      [number, number, number, number, Float64Array]
    >();
    expectTypeOf<Sampler["sample"]>().returns.toBeVoid();
  });
});
