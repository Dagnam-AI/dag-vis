import { describe, expect, it } from "vitest";

import { escapeXml, svgDataUrl } from "../../src/lib/svg.ts";

describe("svg helpers", () => {
  it("escapes the five XML characters", () => {
    expect(escapeXml(`a<b>&"c'`)).toBe("a&lt;b&gt;&amp;&quot;c&apos;");
  });

  it("wraps an svg string as a decodable data URL", () => {
    const url = svgDataUrl("<svg xmlns='http://www.w3.org/2000/svg'/>");
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.split(",")[1]!)).toBe(
      "<svg xmlns='http://www.w3.org/2000/svg'/>",
    );
  });
});
