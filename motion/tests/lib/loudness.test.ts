import { describe, expect, it } from "vitest";

import {
  TARGET,
  checkLoudness,
  dbToLinear,
  gainToTarget,
  parseLoudnorm,
} from "../../src/lib/loudness.ts";

const STDERR = `size=N/A time=00:00:06.00 bitrate=N/A speed= 300x
[Parsed_loudnorm_0 @ 0x1] 
{
	"input_i" : "-23.41",
	"input_tp" : "-5.60",
	"input_lra" : "2.10",
	"input_thresh" : "-33.51",
	"output_i" : "-16.00",
	"target_offset" : "0.00"
}
`;

describe("parseLoudnorm", () => {
  it("reads the last JSON block ffmpeg prints", () => {
    expect(parseLoudnorm(STDERR)).toEqual({
      integrated: -23.41,
      truePeak: -5.6,
      lra: 2.1,
    });
  });
  it("fails loudly without a block or without a field", () => {
    expect(() => parseLoudnorm("no json here")).toThrow(/no JSON block/);
    expect(() => parseLoudnorm("} then {")).toThrow(/no JSON block/);
    expect(() => parseLoudnorm('{"input_i":"-16"}')).toThrow(/input_tp/);
  });
  it("rejects a silent input, which loudnorm reports as -inf", () => {
    const silent = '{"input_i":"-inf","input_tp":"-inf","input_lra":"0.00"}';
    expect(() => parseLoudnorm(silent)).toThrow(/input_i/);
  });
});

describe("gain and check", () => {
  it("computes the dB gain to the target and its linear factor", () => {
    expect(gainToTarget({ integrated: -23, truePeak: -9, lra: 1 })).toBe(7);
    expect(dbToLinear(20)).toBeCloseTo(10);
    expect(dbToLinear(0)).toBe(1);
  });
  it("accepts -16 ±1 LUFS with peaks below -1 dBTP and names each problem otherwise", () => {
    expect(
      checkLoudness({ integrated: -16.4, truePeak: -1.5, lra: 3 }),
    ).toEqual([]);
    expect(checkLoudness({ integrated: -18, truePeak: -0.5, lra: 3 })).toEqual([
      `integrated loudness -18 LUFS, target ${String(TARGET.integrated)} ±${String(TARGET.tolerance)}`,
      `true peak -0.5 dBTP, must be below ${String(TARGET.truePeakMax)}`,
    ]);
  });
});
