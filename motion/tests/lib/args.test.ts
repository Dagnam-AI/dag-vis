import { describe, expect, it } from "vitest";

import {
  NODE_WORDING,
  PLAIN_WORDING,
  parseArgv,
  parseJsonObject,
  type ArgSpec,
} from "../../src/lib/args.ts";

const SPEC: ArgSpec = {
  flags: ["--json", "--force"],
  values: { "--props": "a JSON object" },
};

describe("parseArgv", () => {
  it("separates flags, option values and positionals, in any order", () => {
    const parsed = parseArgv(
      ["a", "--json", "--props", "{}", "b", "--force", "--json"],
      SPEC,
    );
    expect([...parsed.flags].sort()).toEqual(["--force", "--json"]);
    expect([...parsed.values]).toEqual([["--props", "{}"]]);
    expect(parsed.positionals).toEqual(["a", "b"]);
  });

  it("returns empty results for no arguments, and works with no spec fields", () => {
    const parsed = parseArgv([], {});
    expect(parsed.flags.size).toBe(0);
    expect(parsed.values.size).toBe(0);
    expect(parsed.positionals).toEqual([]);
    expect(parseArgv(["x"], {}).positionals).toEqual(["x"]);
  });

  it("lets the last value of an option win and takes a dash-leading value as the value", () => {
    expect(
      parseArgv(["--props", "a", "--props", "--json"], SPEC).values.get(
        "--props",
      ),
    ).toBe("--json");
  });

  it("treats everything after -- as positionals, and a lone - as one", () => {
    expect(parseArgv(["--", "--json", "-x"], SPEC)).toMatchObject({
      flags: new Set(),
      positionals: ["--json", "-x"],
    });
    expect(parseArgv(["-", "a"], SPEC).positionals).toEqual(["-", "a"]);
  });

  it("does not take a property of Object.prototype for an option", () => {
    expect(() => parseArgv(["constructor"], SPEC)).not.toThrow();
    expect(() => parseArgv(["--constructor"], SPEC)).toThrow(/Unknown option/);
  });

  it("names a value option that has no value", () => {
    expect(() => parseArgv(["--props"], SPEC)).toThrow(
      "--props needs a JSON object",
    );
  });

  it("stops at the first positional past max, naming it (also after --)", () => {
    const one = { ...SPEC, max: 1 };
    expect(() => parseArgv(["a", "b", "c"], one)).toThrow(
      "unexpected extra argument b",
    );
    expect(() => parseArgv(["a", "--", "z"], one)).toThrow(
      "unexpected extra argument z",
    );
    expect(parseArgv(["a"], one).positionals).toEqual(["a"]);
    expect(() => parseArgv(["a"], { ...SPEC, max: 0 })).toThrow(
      "unexpected extra argument a",
    );
  });

  describe("with Node's wording (the default)", () => {
    it.each([
      ["--jsn", "--jsn"],
      ["-j", "-j"],
      ["--no-json", "--no-json"],
      ["--jsn=3", "--jsn"],
      ["-jx", "-j"],
      ["--props=1", "--props"],
    ])("names %s as the unknown option %s", (arg, name) => {
      expect(() => parseArgv([arg], SPEC)).toThrow(
        `Unknown option '${name}'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "${name}"`,
      );
    });

    it("says a flag does not take a value", () => {
      expect(() => parseArgv(["--json=x"], SPEC)).toThrow(
        "Option '--json' does not take an argument",
      );
    });

    it("words an extra argument plainly", () => {
      expect(() => parseArgv(["a", "b"], { max: 1 })).toThrow(
        "unexpected extra argument b",
      );
    });
  });

  describe("with plain wording", () => {
    const plain = { ...SPEC, wording: PLAIN_WORDING };
    it.each(["-x", "--other", "--json=x", "--props=1", "--jsn=3"])(
      "names %s exactly as typed",
      (arg) => {
        expect(() => parseArgv([arg], plain)).toThrow(`unknown option ${arg}`);
      },
    );
  });

  it("exposes both wordings' unknown-option messages", () => {
    expect(NODE_WORDING.unknown("--x")).toMatch(/^Unknown option '--x'/);
    expect(PLAIN_WORDING.unknown("--x")).toBe("unknown option --x");
    expect(PLAIN_WORDING.flagValue("--f", "--f=1")).toBe(
      "unknown option --f=1",
    );
  });
});

describe("parseJsonObject", () => {
  it("returns the object", () => {
    expect(parseJsonObject("--props", '{"seed":3,"n":{"x":[1]}}')).toEqual({
      seed: 3,
      n: { x: [1] },
    });
  });

  it("names the option when the text is not JSON", () => {
    expect(() => parseJsonObject("--props", "{nope")).toThrow(
      "--props is not valid JSON",
    );
  });

  it.each(["[1]", "null", "3", '"s"', "true"])(
    "refuses %s: not an object",
    (json) => {
      expect(() => parseJsonObject("--data", json)).toThrow(
        "--data must be a JSON object",
      );
    },
  );
});
