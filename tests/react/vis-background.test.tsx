// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, type ReactElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { VisError } from "../../src/core/index.js";
import { VisBackground } from "../../src/react/index.js";
import { installFakeDom, type FakeDom } from "../animate/fake-dom.js";
import { FakeGl, installFakeGl } from "../animate/fake-gl.js";

describe("<VisBackground>", () => {
  let dom: FakeDom;
  let fake: ReturnType<typeof installFakeGl>;
  beforeEach(() => {
    dom = installFakeDom({ dpr: 1 });
    fake = installFakeGl();
  });
  afterEach(() => {
    cleanup();
    fake.restore();
    dom.restore();
  });

  const frame = (): void => {
    act(() => {
      dom.frame(16);
    });
  };
  const released = (gl: FakeGl): boolean => gl.calls.includes("deleteProgram");
  /** How many times the wrapper asked this canvas's context to be lost, and whether it now is. */
  const lostCalls = (gl: FakeGl): number =>
    gl.calls.filter((c) => c === "loseContext").length;

  it("renders a wrapper with no inline position, creates its canvas in an effect and starts the effect", () => {
    const { container } = render(
      <VisBackground effect="dither" className="bg" style={{ opacity: 0.4 }} />,
    );
    const wrapper = container.firstElementChild as HTMLDivElement;
    expect(wrapper.className).toBe("bg");
    // No inline position: the consumer's className governs layout (e.g. `absolute inset-0`).
    expect(wrapper.style.position).toBe("");
    expect(wrapper.style.overflow).toBe("hidden");
    expect(wrapper.style.opacity).toBe("0.4");
    const canvases = wrapper.querySelectorAll("canvas");
    expect(canvases).toHaveLength(1);
    expect(canvases[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(canvases[0]?.style.display).toBe("block");
    expect(canvases[0]?.style.pointerEvents).toBe("none");
    expect(fake.gls).toHaveLength(1);
    expect(fake.gls[0]?.canvas).toBe(canvases[0]);
    expect(dom.pending()).toBe(1);
  });

  it("lets the style prop override the wrapper defaults", () => {
    const { container } = render(
      <VisBackground effect="dither" style={{ position: "absolute" }} />,
    );
    expect((container.firstElementChild as HTMLElement).style.position).toBe(
      "absolute",
    );
  });

  it("passes the initial options to the effect", () => {
    render(<VisBackground effect="dither" options={{ waveSpeed: 0.03 }} />);
    frame();
    expect(fake.gls[0]?.calls).toContain("uniform1f waveSpeed 0.03");
  });

  it("updates the live effect when an option value changes, on the same canvas", () => {
    const { rerender, container } = render(
      <VisBackground effect="dither" options={{ waveSpeed: 0.03 }} />,
    );
    const canvas = container.querySelector("canvas");
    frame();
    rerender(<VisBackground effect="dither" options={{ waveSpeed: 0.08 }} />);
    frame();
    expect(fake.gls).toHaveLength(1);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(fake.gls[0]?.calls).toContain("uniform1f waveSpeed 0.08");
    expect(released(fake.gls[0]!)).toBe(false);
  });

  it("re-phases a live effect when only the seed changes", () => {
    const { rerender } = render(
      <VisBackground effect="pixel" options={{ seed: 1 }} />,
    );
    frame();
    const uTime = (gl: FakeGl): number =>
      Number(
        gl.calls
          .filter((c) => c.startsWith("uniform1f uTime"))
          .at(-1)
          ?.split(" ")[2],
      );
    const first = uTime(fake.gls[0]!);
    rerender(<VisBackground effect="pixel" options={{ seed: 2 }} />);
    frame();
    expect(fake.gls).toHaveLength(1);
    // A new seed moves the phase by up to 1000 s; one 16 ms frame moves it by well under 1.
    expect(Math.abs(uTime(fake.gls[0]!) - first)).toBeGreaterThan(1);
  });

  it("gives a switched effect a fresh canvas and loses the old one's context, not the new one's", () => {
    const { rerender, container, unmount } = render(
      <VisBackground effect="pixel" />,
    );
    const first = container.querySelector("canvas");
    rerender(<VisBackground effect="terminal" />);
    const canvases = container.querySelectorAll("canvas");
    expect(canvases).toHaveLength(1);
    expect(canvases[0]).not.toBe(first);
    expect(fake.gls).toHaveLength(2);
    expect(released(fake.gls[0]!)).toBe(true);
    expect(released(fake.gls[1]!)).toBe(false);
    // The wrapper never reuses a canvas, so it loses the old one's context; the new one stays live.
    expect(fake.gls[0]?.isContextLost()).toBe(true);
    expect(fake.gls[1]?.isContextLost()).toBe(false);
    expect(dom.pending()).toBe(1);
    unmount();
    expect(released(fake.gls[1]!)).toBe(true);
    expect(dom.pending()).toBe(0);
    expect(container.querySelector("canvas")).toBeNull();
    expect(fake.gls.map((gl) => gl.isContextLost())).toEqual([true, true]);
    expect(fake.gls.map(lostCalls)).toEqual([1, 1]);
  });

  it("loses the context exactly once when a GL effect unmounts, after destroying the effect", () => {
    const { unmount } = render(<VisBackground effect="dither" />);
    frame();
    const gl = fake.gls[0]!;
    expect(gl.isContextLost()).toBe(false);
    unmount();
    expect(gl.isContextLost()).toBe(true);
    expect(lostCalls(gl)).toBe(1);
    expect(gl.calls.indexOf("deleteProgram")).toBeLessThan(
      gl.calls.indexOf("loseContext"),
    );
  });

  it("loses the context of a GL effect whose start() failed after the context was made", () => {
    // Every shader fails to compile: createDither succeeds, start() throws once the context exists.
    const compile = vi
      .spyOn(FakeGl.prototype, "getShaderParameter")
      .mockReturnValue(false);
    const onError = vi.fn();
    const { container } = render(
      <VisBackground effect="dither" onError={onError} />,
    );
    compile.mockRestore();
    expect(container.querySelectorAll("canvas")).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(fake.gls).toHaveLength(1);
    expect(fake.gls[0]?.isContextLost()).toBe(true);
    expect(lostCalls(fake.gls[0]!)).toBe(1);
  });

  it("does not make a context for a canvas2d effect, nor lose one", () => {
    const { unmount } = render(<VisBackground effect="glitch" />);
    frame();
    unmount();
    expect(fake.gls).toHaveLength(0);
    expect(fake.ctx2ds).toHaveLength(1);
  });

  it("recreates the effect when `loop` is turned off (update cannot clear it)", () => {
    const { rerender, container } = render(
      <VisBackground effect="dither" options={{ loop: { duration: 4 } }} />,
    );
    const first = container.querySelector("canvas");
    rerender(<VisBackground effect="dither" options={{}} />);
    expect(container.querySelector("canvas")).not.toBe(first);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(fake.gls).toHaveLength(2);
    expect(released(fake.gls[0]!)).toBe(true);
  });

  it("recreates the effect when `colors` is dropped, and the new effect draws the default colour", () => {
    const { rerender, container } = render(
      <VisBackground effect="dither" options={{ colors: ["#ff0000"] }} />,
    );
    frame();
    expect(fake.gls[0]?.calls).toContain("uniform3f waveColor 1 0 0");
    const first = container.querySelector("canvas");
    rerender(<VisBackground effect="dither" />);
    frame();
    expect(container.querySelector("canvas")).not.toBe(first);
    expect(fake.gls).toHaveLength(2);
    expect(fake.gls[1]?.calls).not.toContain("uniform3f waveColor 1 0 0");
  });

  it("treats an option set to undefined like an absent one", () => {
    const { rerender, container } = render(
      <VisBackground effect="dither" options={{ loop: undefined }} />,
    );
    const first = container.querySelector("canvas");
    rerender(<VisBackground effect="dither" />);
    expect(container.querySelector("canvas")).toBe(first);
    expect(fake.gls).toHaveLength(1);
  });

  it("changes the colours of a live effect through update when colors stays set", () => {
    const { rerender } = render(
      <VisBackground effect="dither" options={{ colors: ["#ff0000"] }} />,
    );
    rerender(
      <VisBackground effect="dither" options={{ colors: ["#00ff00"] }} />,
    );
    frame();
    expect(fake.gls).toHaveLength(1);
    expect(fake.gls[0]?.calls).toContain("uniform3f waveColor 0 1 0");
  });

  it("survives StrictMode's mount, unmount, mount with one canvas and one live handle", () => {
    const { container } = render(
      <StrictMode>
        <VisBackground effect="dither" />
      </StrictMode>,
    );
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(fake.gls).toHaveLength(2);
    expect(released(fake.gls[0]!)).toBe(true);
    expect(released(fake.gls[1]!)).toBe(false);
    expect(fake.gls[1]?.canvas).toBe(container.querySelector("canvas"));
    expect(dom.pending()).toBe(1);
    frame();
    expect(fake.gls[1]?.calls.some((c) => c.startsWith("drawArrays"))).toBe(
      true,
    );
    // The first mount's canvas is gone for good (lost); the surviving mount's is live.
    expect(fake.gls.map((gl) => gl.isContextLost())).toEqual([true, false]);
    expect(fake.gls.map(lostCalls)).toEqual([1, 0]);
  });

  it("hydrates server markup without a mismatch, then adds its canvas", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      /* silence; asserted below */
    });
    const host = document.createElement("div");
    document.body.append(host);
    host.innerHTML = renderToString(
      <VisBackground effect="dither" className="bg" />,
    );
    expect(host.querySelectorAll("canvas")).toHaveLength(0);
    let root!: ReturnType<typeof hydrateRoot>;
    act(() => {
      root = hydrateRoot(
        host,
        <VisBackground effect="dither" className="bg" />,
      );
    });
    expect(error).not.toHaveBeenCalled();
    expect(host.querySelectorAll("canvas")).toHaveLength(1);
    expect(fake.gls).toHaveLength(1);
    act(() => {
      root.unmount();
    });
    host.remove();
    error.mockRestore();
  });

  it("throws a VisError naming `effect` for an unknown name, including inherited keys", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      /* React logs the render error */
    });
    for (const bad of ["bogus", "toString"]) {
      expect(() => render(<VisBackground effect={bad as "dither"} />)).toThrow(
        VisError,
      );
      expect(() => render(<VisBackground effect={bad as "dither"} />)).toThrow(
        /effect must be one of dither, pixel, terminal, glitch, ribbon, field/,
      );
    }
    error.mockRestore();
  });

  it("drives Canvas2D effects too", () => {
    const glitch = render(
      <VisBackground
        effect="glitch"
        options={{ colors: ["#ef4444"], vignette: "none" }}
      />,
    );
    frame();
    expect(fake.ctx2ds).toHaveLength(1);
    expect(fake.ctx2ds[0]?.calls.some((c) => c.startsWith("fillText"))).toBe(
      true,
    );
    glitch.unmount();
    render(<VisBackground effect="ribbon" />);
    frame();
    expect(fake.ctx2ds).toHaveLength(2);
    expect(fake.ctx2ds[1]?.calls.some((c) => c.startsWith("stroke"))).toBe(
      true,
    );
  });
});

describe("<VisBackground> under prefers-reduced-motion", () => {
  it("draws one static frame and schedules nothing", () => {
    const dom = installFakeDom({ dpr: 1, reducedMotion: true });
    const fake = installFakeGl();
    try {
      const { container } = render(<VisBackground effect="dither" />);
      expect(container.querySelectorAll("canvas")).toHaveLength(1);
      expect(
        fake.gls[0]?.calls.filter((c) => c.startsWith("drawArrays")),
      ).toHaveLength(1);
      expect(dom.pending()).toBe(0);
    } finally {
      cleanup();
      fake.restore();
      dom.restore();
    }
  });
});

describe("<VisBackground> failure containment", () => {
  let dom: FakeDom;
  let fake: ReturnType<typeof installFakeGl>;
  let error: MockInstance<typeof console.error>;
  beforeEach(() => {
    dom = installFakeDom({ dpr: 1 });
    error = vi.spyOn(console, "error").mockImplementation(() => {
      /* asserted per test */
    });
  });
  afterEach(() => {
    cleanup();
    fake.restore();
    dom.restore();
    error.mockRestore();
  });

  it("renders nothing and reports through onError when WebGL2 is unavailable, leaving the page up", () => {
    fake = installFakeGl({ webgl2: false });
    const onError = vi.fn();
    const { container } = render(
      <main>
        <h1>Landing</h1>
        <VisBackground effect="dither" className="bg" onError={onError} />
      </main>,
    );
    expect(container.querySelector("h1")?.textContent).toBe("Landing");
    expect(container.querySelector(".bg")).not.toBeNull();
    expect(container.querySelectorAll("canvas")).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(VisError);
    expect(String(onError.mock.calls[0]?.[0])).toContain("WebGL2");
    expect(dom.pending()).toBe(0);
  });

  it("falls back to console.error without an onError prop", () => {
    fake = installFakeGl({ webgl2: false });
    render(<VisBackground effect="dither" />);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toBeInstanceOf(VisError);
  });

  it("contains invalid creation options too, with no half-built handle", () => {
    fake = installFakeGl();
    const onError = vi.fn();
    const { container } = render(
      <VisBackground
        effect="dither"
        options={{ waveSpeed: -1 }}
        onError={onError}
      />,
    );
    expect(container.querySelectorAll("canvas")).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(fake.gls).toHaveLength(0);
  });

  it("contains a failing Canvas2D effect as well", () => {
    fake = installFakeGl({ canvas2d: false });
    const onError = vi.fn();
    const { container } = render(
      <VisBackground effect="glitch" onError={onError} />,
    );
    expect(container.querySelectorAll("canvas")).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("retries when a corrected value of the same key replaces invalid creation options", () => {
    fake = installFakeGl();
    const onError = vi.fn();
    const view = (waveSpeed: number): ReactElement => (
      <VisBackground
        effect="dither"
        options={{ waveSpeed }}
        onError={onError}
      />
    );
    const { rerender, container } = render(view(-1));
    expect(container.querySelectorAll("canvas")).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
    rerender(view(-2));
    expect(container.querySelectorAll("canvas")).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(2);
    rerender(view(0.1));
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(fake.gls).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(dom.pending()).toBe(1);
    // Recovered: later value changes update the live effect instead of recreating it.
    rerender(view(0.2));
    act(() => {
      dom.frame(16);
    });
    expect(fake.gls).toHaveLength(1);
    expect(fake.gls[0]?.calls).toContain("uniform1f waveSpeed 0.2");
  });

  it("mounts once when the correction also changes the key set", () => {
    fake = installFakeGl();
    const onError = vi.fn();
    const { rerender, container } = render(
      <VisBackground
        effect="dither"
        options={{ waveSpeed: -1 }}
        onError={onError}
      />,
    );
    rerender(
      <VisBackground
        effect="dither"
        options={{ waveSpeed: 0.1, colors: ["#ff0000"] }}
        onError={onError}
      />,
    );
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(fake.gls).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    // Still invalid after a key-set change: one more report, not two.
    const again = render(
      <VisBackground
        effect="dither"
        options={{ waveSpeed: -1 }}
        onError={onError}
      />,
    );
    again.rerender(
      <VisBackground
        effect="dither"
        options={{ waveSpeed: -3, colors: ["#ff0000"] }}
        onError={onError}
      />,
    );
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it("keeps the live effect and reports an invalid update", () => {
    fake = installFakeGl();
    const onError = vi.fn();
    const { rerender, container } = render(
      <VisBackground
        effect="dither"
        options={{ waveSpeed: 0.1 }}
        onError={onError}
      />,
    );
    const canvas = container.querySelector("canvas");
    rerender(
      <VisBackground
        effect="dither"
        options={{ waveSpeed: -1 }}
        onError={onError}
      />,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(dom.pending()).toBe(1);
  });

  it("uses the latest onError without recreating the effect", () => {
    fake = installFakeGl();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <VisBackground effect="dither" onError={first} />,
    );
    rerender(
      <VisBackground
        effect="dither"
        options={{ waveSpeed: -1 }}
        onError={second}
      />,
    );
    expect(fake.gls).toHaveLength(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("<VisBackground> update churn", () => {
  it("does not call update() on re-renders with equal inline literals, only on a changed value", () => {
    // Under reduced motion update() redraws, so a spurious update() shows up as an extra draw.
    const dom = installFakeDom({ dpr: 1, reducedMotion: true });
    const fake = installFakeGl();
    const draws = (): number =>
      (fake.gls[0]?.calls ?? []).filter((c) => c.startsWith("drawArrays"))
        .length;
    try {
      const view = (waveSpeed: number): ReactElement => (
        <VisBackground
          effect="dither"
          options={{ colors: ["#ff0000"], waveSpeed, loop: undefined }}
        />
      );
      const { rerender } = render(view(0.15));
      expect(draws()).toBe(1);
      for (let i = 0; i < 20; i++) rerender(view(0.15));
      expect(draws()).toBe(1);
      expect(fake.gls).toHaveLength(1);
      rerender(view(0.2));
      expect(draws()).toBe(2);
    } finally {
      cleanup();
      fake.restore();
      dom.restore();
    }
  });
});
