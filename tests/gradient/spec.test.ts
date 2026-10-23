import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  MAX_SPEC_DEPTH,
  MAX_SPEC_NODES,
  assertSpec,
  assertSpecBudget,
} from "../../src/gradient/spec.js";

describe("assertSpec", () => {
  it("accepts any object with a string kind, leaving the rest to the kind", () => {
    expect(() => {
      assertSpec({ kind: "linear" });
    }).not.toThrow();
    expect(() => {
      assertSpec({ kind: "plaid" });
    }).not.toThrow();
  });

  it.each([null, undefined, 5, "linear", true])(
    "rejects %j, which is not an object",
    (spec) => {
      expect(() => {
        assertSpec(spec);
      }).toThrow(VisError);
      expect(() => {
        assertSpec(spec);
      }).toThrow("gradient spec must be an object");
    },
  );

  it.each([{}, [], { kind: 5 }, { kind: null }, { kind: ["linear"] }])(
    "rejects %j, which has no string kind",
    (spec) => {
      expect(() => {
        assertSpec(spec);
      }).toThrow("unknown gradient kind");
    },
  );
});

const LEAF = { kind: "linear", stops: ["#000000", "#ffffff"] };

/** `layers` wrapped around `inner`, `levels` times (the result has `levels + 1` levels). */
function nest(levels: number, inner: object = LEAF): object {
  let spec = inner;
  for (let i = 0; i < levels; i++) spec = { kind: "layers", layers: [spec] };
  return spec;
}

describe("assertSpecBudget", () => {
  it("accepts a leaf and the costliest specs the package documents", () => {
    const fluted = (reeds: number, source: object): object => ({
      kind: "fluted",
      reeds,
      source,
    });
    for (const spec of [
      LEAF,
      fluted(256, LEAF),
      fluted(64, { kind: "conic", stops: LEAF.stops }),
      fluted(16, fluted(16, LEAF)),
      {
        kind: "layers",
        layers: Array.from({ length: 8 }, () => fluted(256, LEAF)),
      },
      {
        kind: "layers",
        layers: [fluted(16, fluted(16, LEAF)), fluted(16, fluted(16, LEAF))],
      },
    ])
      expect(() => {
        assertSpecBudget(spec);
      }).not.toThrow();
  });

  it("accepts exactly the depth and node limits, and rejects one more", () => {
    expect(() => {
      assertSpecBudget(nest(MAX_SPEC_DEPTH - 1));
    }).not.toThrow();
    expect(() => {
      assertSpecBudget(nest(MAX_SPEC_DEPTH));
    }).toThrow(/more than 16 levels deep/);

    const wide = (n: number): object => ({
      kind: "layers",
      layers: Array.from({ length: n }, () => ({ ...LEAF })),
    });
    expect(() => {
      assertSpecBudget(wide(MAX_SPEC_NODES - 1));
    }).not.toThrow();
    expect(() => {
      assertSpecBudget(wide(MAX_SPEC_NODES));
    }).toThrow(/more than 64 nodes/);
  });

  it("stops a very deep tree with a VisError, not a stack overflow", () => {
    const deep = nest(5000);
    expect(() => {
      assertSpecBudget(deep);
    }).toThrow(VisError);
    expect(() => {
      assertSpecBudget(deep);
    }).toThrow(/levels deep/);
    let fluted: object = LEAF;
    for (let i = 0; i < 5000; i++) fluted = { kind: "fluted", source: fluted };
    expect(() => {
      assertSpecBudget(fluted);
    }).toThrow(/levels deep/);
  });

  it("rejects a cycle through layers or a fluted source", () => {
    const layers: { kind: string; layers: unknown[] } = {
      kind: "layers",
      layers: [],
    };
    layers.layers.push(LEAF, layers);
    expect(() => {
      assertSpecBudget(layers);
    }).toThrow(/contains a cycle/);
    const fluted: { kind: string; source?: unknown } = { kind: "fluted" };
    fluted.source = { kind: "layers", layers: [fluted] };
    expect(() => {
      assertSpecBudget(fluted);
    }).toThrow(/contains a cycle/);
  });

  it("counts a shared sub-spec once per use, so a doubling tree is rejected fast", () => {
    const doubling = (levels: number): object => {
      let shared: object = LEAF;
      for (let i = 0; i < levels; i++)
        shared = { kind: "layers", layers: [shared, shared] };
      return shared;
    };
    // 2^10 visits in a tree only 11 deep: the node limit stops it.
    expect(() => {
      assertSpecBudget(doubling(10));
    }).toThrow(/more than 64 nodes/);
    // 2^40 visits: whichever limit trips first, it is a VisError and it is instant.
    expect(() => {
      assertSpecBudget(doubling(40));
    }).toThrow(VisError);
    // A shared leaf that is not a cycle is fine.
    expect(() => {
      assertSpecBudget({ kind: "layers", layers: [LEAF, LEAF] });
    }).not.toThrow();
  });

  it("rejects an enormous or sparse layers array without looping over it", () => {
    expect(() => {
      assertSpecBudget({ kind: "layers", layers: new Array(2 ** 32 - 1) });
    }).toThrow(/more than 64 nodes/);
  });

  it("leaves malformed entries to the renderer", () => {
    for (const spec of [
      { kind: "layers", layers: [null, 5, "x"] },
      { kind: "layers", layers: 5 },
      { kind: "fluted" },
      { kind: "fluted", source: 5 },
    ])
      expect(() => {
        assertSpecBudget(spec);
      }).not.toThrow();
  });
});
