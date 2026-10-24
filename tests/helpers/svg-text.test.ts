import { describe, expect, it } from "vitest";

import { textContent } from "./svg-text.js";

describe("textContent", () => {
  it("keeps the text of child elements and drops their tags", () => {
    expect(textContent('DAGNAM<tspan fill="#ef4444">.AI</tspan>')).toBe(
      "DAGNAM.AI",
    );
    expect(textContent("Visual <tspan>•</tspan> Modular")).toBe(
      "Visual • Modular",
    );
    expect(textContent("a<b><i>c</i></b>d")).toBe("acd");
  });

  it("returns plain text unchanged, including escaped entities", () => {
    expect(textContent("plain")).toBe("plain");
    expect(textContent("")).toBe("");
    expect(textContent('A &lt;b&gt; &amp; "c"')).toBe('A &lt;b&gt; &amp; "c"');
  });

  it("never leaves a tag opener behind, however the tags are nested or broken", () => {
    expect(textContent("<scr<script>ipt>x")).not.toContain("<");
    expect(textContent("a<<b>c")).toBe("ac");
  });
});
