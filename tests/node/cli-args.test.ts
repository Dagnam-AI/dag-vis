import { describe, expect, it } from "vitest";

import {
  defined,
  messageOf,
  oneLine,
  parseFocus,
  parseNumber,
  parseOptions,
} from "../../src/node/cli-args.js";

const ALLOWED = ["title", "out", "w"];
const parse = (args: string[]): Record<string, string> =>
  Object.fromEntries(parseOptions(args, ALLOWED));

describe("parseOptions", () => {
  it("reads --name value and --name=value, in any order", () => {
    expect(parse(["--title", "Hi", "--out=a b.svg", "--w", "5"])).toEqual({
      title: "Hi",
      out: "a b.svg",
      w: "5",
    });
    expect(parse([])).toEqual({});
  });

  it("keeps empty values, dashes inside a value, and = inside an inline value", () => {
    expect(parse(["--title", "", "--out=a=b"])).toEqual({
      title: "",
      out: "a=b",
    });
    expect(parse(["--title", "-1"])).toEqual({ title: "-1" });
    expect(parse(["--title=--x"])).toEqual({ title: "--x" });
  });

  it.each([
    [["--bogus", "1"], 'unknown option: "--bogus"'],
    [["--bogus=1"], 'unknown option: "--bogus"'],
    [["--constructor", "1"], 'unknown option: "--constructor"'],
    [["--"], 'unknown option: "--"'],
    [["--title", "a", "--title", "b"], "duplicate option: --title"],
    [["--title=a", "--title", "b"], "duplicate option: --title"],
    [["--title"], "missing value for --title"],
    [["--title", "--out", "x"], "missing value for --title"],
    [["-t", "x"], 'unexpected argument: "-t"'],
    [["stray"], 'unexpected argument: "stray"'],
    [["--title", "a", "stray"], 'unexpected argument: "stray"'],
  ])("rejects %j with %s", (args, message) => {
    expect(() => parseOptions(args, ALLOWED)).toThrow(message);
  });
});

describe("parseNumber", () => {
  it.each([
    ["0", 0],
    ["5", 5],
    ["007", 7],
    ["0.5", 0.5],
    ["1200", 1200],
  ])("accepts %j", (raw, value) => {
    expect(parseNumber("w", raw)).toBe(value);
  });

  it.each([
    "",
    " ",
    "1e3",
    "1e3x",
    "0x10",
    "-5",
    "+5",
    ".5",
    "5.",
    "1,5",
    "5px",
    " 5",
    "5 ",
    "5\n",
    "abc",
    "Infinity",
    "NaN",
    "９",
    "9".repeat(400),
  ])("rejects %j", (raw) => {
    expect(() => parseNumber("w", raw)).toThrow("--w must be a plain decimal");
  });
});

describe("parseFocus", () => {
  it("parses x,y", () => {
    expect(parseFocus("0.5,1")).toEqual([0.5, 1]);
  });

  it.each(["1", "1,2,3", "0.5,", ",0.5", "a,b", "1e0,0", "0.5, 0.5", "-1,0"])(
    "rejects %j",
    (raw) => {
      expect(() => parseFocus(raw)).toThrow("--focus must be x,y");
    },
  );
});

describe("helpers", () => {
  it("defined drops undefined values and keeps everything else", () => {
    expect(defined({ a: 1, b: undefined, c: "", d: 0, e: false })).toEqual({
      a: 1,
      c: "",
      d: 0,
      e: false,
    });
    expect(Object.keys(defined({ a: undefined }))).toEqual([]);
  });

  it("messageOf reads Errors and stringifies anything else", () => {
    expect(messageOf(new Error("boom"))).toBe("boom");
    expect(messageOf("plain")).toBe("plain");
    expect(messageOf(42)).toBe("42");
  });

  it("oneLine collapses line breaks and trims", () => {
    expect(oneLine(" a\nb\r\n  c \n")).toBe("a b c");
    expect(oneLine("already one line")).toBe("already one line");
  });
});
