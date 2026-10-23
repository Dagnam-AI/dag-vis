// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VisError } from "../../src/core/index.js";
import { gradientSvg, type GradientSpec } from "../../src/gradient/index.js";
import { Gradient } from "../../src/react/index.js";

const SPEC: GradientSpec = {
  kind: "linear",
  idPrefix: "g1",
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
      `<svg preserveAspectRatio="xMidYMid slice" style="${STRETCH}"`,
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

  it("fills its wrapper instead of letterboxing: slice by default, meet and none on request", () => {
    const fit = (f?: "slice" | "meet" | "none"): string | null => {
      const { container, unmount } = render(
        f === undefined ? (
          <Gradient spec={SPEC} />
        ) : (
          <Gradient spec={SPEC} fit={f} />
        ),
      );
      const value =
        container.querySelector("svg")?.getAttribute("preserveAspectRatio") ??
        null;
      unmount();
      return value;
    };
    expect(fit()).toBe("xMidYMid slice");
    expect(fit("slice")).toBe("xMidYMid slice");
    expect(fit("meet")).toBe("xMidYMid meet");
    expect(fit("none")).toBe("none");
  });

  it("is decorative by default and an img with a label when titled", () => {
    const plain = render(<Gradient spec={SPEC} />);
    const wrapper = plain.container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper.getAttribute("role")).toBeNull();
    plain.unmount();
    const titled = render(<Gradient spec={SPEC} title="Sunset" />);
    const labelled = titled.container.firstElementChild as HTMLElement;
    expect(labelled.getAttribute("role")).toBe("img");
    expect(labelled.getAttribute("aria-label")).toBe("Sunset");
    expect(labelled.getAttribute("aria-hidden")).toBeNull();
  });

  it("gives two gradients in one document distinct ids, and keeps an explicit idPrefix", () => {
    const bare: GradientSpec = {
      kind: "linear",
      stops: ["#000000", "#ffffff"],
    };
    const { container } = render(
      <>
        <Gradient spec={bare} />
        <Gradient spec={bare} />
        <Gradient spec={SPEC} />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("[id]"), (e) => e.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z_][\w-]*$/);
    expect(ids.some((id) => id.startsWith("g1"))).toBe(true);
  });

  it("hydrates server markup with the same ids", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      /* asserted below */
    });
    const bare: GradientSpec = {
      kind: "linear",
      stops: ["#000000", "#ffffff"],
    };
    const host = document.createElement("div");
    document.body.append(host);
    const tree = (
      <>
        <Gradient spec={bare} />
        <Gradient spec={bare} />
      </>
    );
    host.innerHTML = renderToString(tree);
    const serverHtml = host.innerHTML;
    let root!: ReturnType<typeof hydrateRoot>;
    act(() => {
      root = hydrateRoot(host, tree);
    });
    expect(error).not.toHaveBeenCalled();
    expect(host.innerHTML).toBe(serverHtml);
    act(() => {
      root.unmount();
    });
    host.remove();
    error.mockRestore();
  });

  it("throws a VisError for an invalid fit, including inherited keys and non-strings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      /* React logs the render error */
    });
    for (const bad of ["cover", "toString", "__proto__", 5, null])
      expect(() =>
        render(<Gradient spec={SPEC} fit={bad as "slice"} />),
      ).toThrow(/fit must be one of slice, meet, none/);
    expect(() => render(<Gradient spec={SPEC} fit={"x" as "slice"} />)).toThrow(
      VisError,
    );
    error.mockRestore();
  });
});
