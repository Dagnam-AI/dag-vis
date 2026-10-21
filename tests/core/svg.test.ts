import { describe, expect, it } from "vitest";

import { el, escapeAttr, svgDoc, text } from "../../src/core/svg.js";

describe("svg builder", () => {
  it("renders a self-closing element when there are no children", () => {
    expect(el("rect", { x: 0, y: 1.5, fill: "#fff" })).toBe(
      '<rect x="0" y="1.5" fill="#fff"/>',
    );
  });

  it("renders children and skips undefined attributes", () => {
    expect(el("g", { opacity: undefined, id: "a" }, "<x/>", "<y/>")).toBe(
      '<g id="a"><x/><y/></g>',
    );
  });

  it("renders a bare tag with no attrs", () => {
    expect(el("defs")).toBe("<defs/>");
  });

  it("escapes attribute values and text", () => {
    expect(escapeAttr('a"b<c>&d')).toBe("a&quot;b&lt;c&gt;&amp;d");
    expect(el("t", { title: '"' })).toBe('<t title="&quot;"/>');
    expect(text("<b> & c")).toBe("&lt;b&gt; &amp; c");
  });

  it("formats numeric attributes with fmt", () => {
    expect(el("c", { r: 1.23456 })).toBe('<c r="1.235"/>');
  });

  it("wraps children in a standalone svg document", () => {
    expect(svgDoc({ width: 10, height: 20 }, "<a/>")).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20" viewBox="0 0 10 20"><a/></svg>',
    );
  });
});
