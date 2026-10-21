import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  MAX_DIMENSION,
  bounded,
  describeValue,
  finite,
  integerIn,
  orDefault,
  parseId,
  parsePaint,
  parseSeed,
  within,
} from "../../src/core/validate.js";

describe("describeValue", () => {
  it("quotes strings and spells out every other type without throwing", () => {
    expect(describeValue("a b")).toBe('"a b"');
    expect(describeValue("x".repeat(80))).toBe(`"${"x".repeat(80)}"`);
    expect(describeValue("x".repeat(81))).toBe(`"${"x".repeat(80)}..."`);
    expect(describeValue(Number.NaN)).toBe("NaN");
    expect(describeValue(-Infinity)).toBe("-Infinity");
    expect(describeValue(5n)).toBe("5");
    expect(describeValue(true)).toBe("true");
    expect(describeValue(null)).toBe("null");
    expect(describeValue(undefined)).toBe("undefined");
    expect(describeValue({})).toBe("object");
    expect(describeValue(Object.create(null))).toBe("object");
    expect(describeValue(Symbol("s"))).toBe("symbol");
  });
});

describe("bounded", () => {
  it("returns in-range numbers, bounds included", () => {
    expect(bounded("x", 0, 0, 1)).toBe(0);
    expect(bounded("x", 1, 0, 1)).toBe(1);
    expect(bounded("x", 0.25, 0, 1)).toBe(0.25);
  });

  it("names the parameter and the offending value", () => {
    for (const bad of [
      Number.NaN,
      Infinity,
      -Infinity,
      -0.1,
      1.1,
      "0.5",
      null,
      undefined,
      {},
      [0.5],
      true,
    ]) {
      expect(() => bounded("opacity", bad, 0, 1)).toThrow(VisError);
      expect(() => bounded("opacity", bad, 0, 1)).toThrow(
        `opacity must be a number in 0..1, got ${describeValue(bad)}`,
      );
    }
  });
});

describe("finite", () => {
  it("returns any finite number and rejects the rest", () => {
    expect(finite("angle", -1e300)).toBe(-1e300);
    expect(finite("angle", 0)).toBe(0);
    for (const bad of [Number.NaN, Infinity, -Infinity, "1", null, undefined]) {
      expect(() => finite("angle", bad)).toThrow(VisError);
      expect(() => finite("angle", bad)).toThrow(
        `angle must be a finite number, got ${describeValue(bad)}`,
      );
    }
  });
});

describe("integerIn", () => {
  it("returns in-range integers, bounds included", () => {
    expect(integerIn("n", 2, 2, 4)).toBe(2);
    expect(integerIn("n", 4, 2, 4)).toBe(4);
  });

  it("rejects fractions, non-finite values, out-of-range and wrong types", () => {
    for (const bad of [2.5, Number.NaN, Infinity, 1, 5, "3", null, undefined]) {
      expect(() => integerIn("n", bad, 2, 4)).toThrow(VisError);
      expect(() => integerIn("n", bad, 2, 4)).toThrow(
        `n must be an integer in 2..4, got ${describeValue(bad)}`,
      );
    }
  });
});

describe("parsePaint", () => {
  it("splits a colour into an opaque hex and its alpha", () => {
    expect(parsePaint("color", "#ef4444")).toEqual({
      hex: "#ef4444",
      alpha: 1,
    });
    const p = parsePaint("color", "#ef444480");
    expect(p.hex).toBe("#ef4444");
    expect(p.alpha).toBeCloseTo(128 / 255, 6);
    expect(parsePaint("color", "rgb(0 0 0 / 0.25)")).toEqual({
      hex: "#000000",
      alpha: 0.25,
    });
  });

  it("names the parameter for a bad colour and for a non-string", () => {
    expect(() => parsePaint("color", "nope")).toThrow(VisError);
    expect(() => parsePaint("color", "nope")).toThrow("color: invalid colour");
    expect(() => parsePaint("color", "nope")).toThrow("nope");
    expect(() => parsePaint("background", "#12")).toThrow("background:");
    expect(() => parsePaint("color", 12)).toThrow(
      "color must be a colour string, got 12",
    );
    expect(() => parsePaint("color", null)).toThrow("got null");
  });

  it("refuses a colour too long to be one, without echoing it whole", () => {
    const long = `rgb(${"9".repeat(2_000_000)})`;
    expect(() => parsePaint("color", long)).toThrow(VisError);
    expect(() => parsePaint("color", long)).toThrow(
      "color must be a colour of at most 80 characters",
    );
    try {
      parsePaint("color", long);
    } catch (e) {
      expect((e as VisError).message.length).toBeLessThan(200);
    }
    expect(parsePaint("color", `rgb(1 2 3 / 1${" ".repeat(60)})`).hex).toBe(
      "#010203",
    );
  });
});

describe("parseId", () => {
  it("accepts XML-safe names up to maxLength characters", () => {
    expect(parseId("idPrefix", "vis1", 64)).toBe("vis1");
    expect(parseId("idPrefix", "_a-b_9", 64)).toBe("_a-b_9");
    expect(parseId("idPrefix", "vis-5", 64)).toBe("vis-5");
    expect(parseId("idPrefix", "a".repeat(64), 64)).toBe("a".repeat(64));
    expect(parseId("idPrefix", "a".repeat(60), 60)).toBe("a".repeat(60));
  });

  it("rejects anything that could break out of an attribute or a url()", () => {
    for (const bad of [
      "",
      "1abc",
      "-a",
      "a b",
      'a"b',
      "a)",
      "a#b",
      "a.b",
      "<x>",
      "ok\n",
      "a".repeat(65),
      12,
      null,
      undefined,
    ]) {
      expect(() => parseId("idPrefix", bad, 64)).toThrow(VisError);
      expect(() => parseId("idPrefix", bad, 64)).toThrow(
        `idPrefix must be a valid id`,
      );
    }
  });

  it("states the cap it was given", () => {
    expect(() => parseId("idPrefix", "a".repeat(61), 60)).toThrow(
      "then up to 59 letters",
    );
    expect(() => parseId("idPrefix", "a".repeat(65), 64)).toThrow(
      "then up to 63 letters",
    );
  });
});

describe("parseSeed", () => {
  it("defaults to 1 only on undefined and accepts safe integers", () => {
    expect(parseSeed(undefined)).toBe(1);
    expect(parseSeed(0)).toBe(0);
    expect(parseSeed(-7)).toBe(-7);
    expect(parseSeed(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("names the seed and the offending value", () => {
    for (const bad of [null, "1", 1.5, Number.NaN, Infinity, 2 ** 53, {}]) {
      expect(() => parseSeed(bad)).toThrow(VisError);
      expect(() => parseSeed(bad)).toThrow(
        `seed must be a safe integer, got ${describeValue(bad)}`,
      );
    }
  });
});

describe("within", () => {
  it("returns the result and leaves non-VisErrors alone", () => {
    expect(within("base", () => 5)).toBe(5);
    const boom = new TypeError("boom");
    expect(() =>
      within("base", () => {
        throw boom;
      }),
    ).toThrow(boom);
  });

  it("prefixes a VisError with the name and keeps the original as cause", () => {
    const inner = new VisError("kind must be known");
    let caught: unknown;
    try {
      within("pattern", () => {
        throw inner;
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(VisError);
    expect((caught as VisError).message).toBe("pattern: kind must be known");
    expect((caught as VisError).cause).toBe(inner);
  });
});

describe("orDefault", () => {
  it("defaults on undefined only, so null reaches the validator", () => {
    expect(orDefault(undefined, 5)).toBe(5);
    expect(orDefault(0, 5)).toBe(0);
    expect(orDefault("", "x")).toBe("");
    expect(orDefault(null as never, 5)).toBeNull();
  });
});

describe("limits", () => {
  it("exports the dimension cap the public docs quote", () => {
    expect(MAX_DIMENSION).toBe(16384);
  });
});
