// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { bindControls } from "../../demo/controls.js";

const SPEED = { key: "speed", min: 0, max: 4, step: 0.05 };

function setup(onChange: (p: Record<string, number>) => void) {
  const form = document.createElement("div");
  bindControls(form, [SPEED], { speed: 1 }, onChange);
  const input = form.querySelector("input")!;
  const out = form.querySelector("output")!;
  const error = form.querySelector(".error")!;
  const move = (v: string) => {
    input.value = v;
    input.dispatchEvent(new Event("input"));
  };
  return { input, out, error, move };
}

describe("demo sliders", () => {
  it("shows the live value (or the min) and passes one-key patches", () => {
    const onChange = vi.fn();
    const { input, out, error, move } = setup(onChange);
    expect(input.value).toBe("1");
    expect(out.textContent).toBe("1");
    move("2");
    expect(onChange).toHaveBeenCalledWith({ speed: 2 });
    expect(out.textContent).toBe("2");
    expect(error.textContent).toBe("");

    const form = document.createElement("div");
    bindControls(form, [SPEED], {}, vi.fn());
    expect(form.querySelector("input")?.value).toBe("0");
  });

  it("reverts to the last accepted value and shows the error when update throws", () => {
    let fail = false;
    const { input, out, error, move } = setup(() => {
      if (fail) throw new Error("speed must be finite");
    });
    move("3");
    fail = true;
    move("4");
    expect(input.value).toBe("3");
    expect(out.textContent).toBe("3");
    expect(error.textContent).toBe("speed must be finite");
    fail = false;
    move("0.5");
    expect(error.textContent).toBe("");
  });

  it("stringifies a non-Error throw", () => {
    const { error, move } = setup(() => {
      throw "boom"; // eslint-disable-line @typescript-eslint/only-throw-error -- exercising the non-Error branch
    });
    move("2");
    expect(error.textContent).toBe("boom");
  });
});
