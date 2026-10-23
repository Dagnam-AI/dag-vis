// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { gradientSvg, type GradientSpec } from "../../src/gradient/index.js";
import { Gradient } from "../../src/react/index.js";

const SPEC: GradientSpec = {
  kind: "linear",
  angle: 90,
  stops: ["#000000", "#ffffff"],
};
const STRETCH = "display:block;width:100%;height:100%";

/** The same markup through the same parser, so the comparison ignores serialisation differences. */
const parsed = (html: string): string => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.innerHTML;
};

describe("<Gradient>", () => {
  afterEach(cleanup);

  it("renders gradientSvg inline, stretched to its wrapper", () => {
    const { container } = render(
      <Gradient
        spec={SPEC}
        width={300}
        height={100}
        className="g"
        style={{ height: 40 }}
      />,
    );
    const wrapper = container.firstElementChild as HTMLDivElement;
    expect(wrapper.className).toBe("g");
    expect(wrapper.style.height).toBe("40px");
    const svg = wrapper.querySelector("svg")!;
    expect(svg.getAttribute("style")).toBe(STRETCH);
    expect(svg.getAttribute("viewBox")).toBe("0 0 300 100");
    const expected = gradientSvg(SPEC, { width: 300, height: 100 }).replace(
      "<svg",
      `<svg style="${STRETCH}"`,
    );
    expect(wrapper.innerHTML).toBe(parsed(expected));
  });

  it("defaults to 1200x630", () => {
    const { container } = render(<Gradient spec={SPEC} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 1200 630");
  });

  it("falls back to the spec's own size before the default", () => {
    const { container } = render(
      <Gradient spec={{ ...SPEC, size: { width: 400, height: 200 } }} />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 400 200");
  });

  it("lets width and height override the spec size independently", () => {
    const { container } = render(
      <Gradient
        spec={{ ...SPEC, size: { width: 400, height: 200 } }}
        width={800}
      />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 800 200");
  });
});
