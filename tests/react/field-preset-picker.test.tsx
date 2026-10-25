// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode, type ReactElement } from "react";
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
import {
  fieldPresetCatalog,
  fieldPresets,
  renderField,
  type FieldPresetName,
} from "../../src/field/index.js";
import {
  FieldPresetPicker,
  type FieldPresetPickerProps,
} from "../../src/react/index.js";
import { installFakeGl } from "../animate/fake-gl.js";

const NAMES = fieldPresetCatalog.map((p) => p.name);

/** jsdom has no ImageData; the picker only builds one and hands it to putImageData. */
class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

describe("<FieldPresetPicker>", () => {
  let fake: ReturnType<typeof installFakeGl>;
  let error: MockInstance<typeof console.error>;
  // The thumbnail cache is module-level and outlives a test: every test that paints uses a size nobody else uses.
  let next = 0;
  const uniqueSize = () => ({ width: 3 + next++, height: 2 });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("ImageData", FakeImageData);
    fake = installFakeGl();
    error = vi.spyOn(console, "error").mockImplementation(() => {
      /* asserted per test */
    });
  });
  afterEach(() => {
    cleanup();
    error.mockRestore();
    fake.restore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const radios = (container: HTMLElement): HTMLButtonElement[] =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const painted = (): number =>
    fake.ctx2ds.reduce((n, c) => n + c.images.length, 0);
  const flush = (): void => {
    act(() => {
      vi.runAllTimers();
    });
  };
  const noop = (): void => {
    /* unused */
  };
  const picker = (props: Partial<FieldPresetPickerProps> = {}) => (
    <FieldPresetPicker onChange={noop} thumbSize={uniqueSize()} {...props} />
  );

  describe("markup", () => {
    it("is a radiogroup with one labelled radio per preset, in catalog order", () => {
      const { container, getByRole } = render(picker());
      const group = getByRole("radiogroup");
      expect(group.getAttribute("aria-label")).toBe("Field preset");
      const all = radios(container);
      expect(all).toHaveLength(19);
      expect(all.map((r) => r.textContent)).toEqual(
        fieldPresetCatalog.map((p) => p.label),
      );
      for (const r of all) {
        expect(r.getAttribute("type")).toBe("button");
        expect(r.querySelector("canvas")?.getAttribute("aria-hidden")).toBe(
          "true",
        );
      }
    });

    it("takes an aria-label, className and style, and sizes the grid and canvases by thumbSize", () => {
      const { container, getByRole } = render(
        picker({
          "aria-label": "Cover look",
          className: "presets",
          style: { gap: 4, color: "red" },
          thumbSize: { width: 120, height: 60 },
        }),
      );
      const group = getByRole("radiogroup");
      expect(group.getAttribute("aria-label")).toBe("Cover look");
      expect(group.className).toBe("presets");
      expect(group.style.display).toBe("grid");
      expect(group.style.gridTemplateColumns).toBe(
        "repeat(auto-fill, minmax(120px, 1fr))",
      );
      expect(group.style.gap).toBe("4px");
      expect(group.style.color).toBe("red");
      const canvas = container.querySelector("canvas");
      expect(canvas?.width).toBe(120);
      expect(canvas?.height).toBe(60);
    });

    it("defaults to 160 x 90 thumbnails and a 12 px gap", () => {
      const { container, getByRole } = render(
        <FieldPresetPicker onChange={noop} />,
      );
      const canvas = container.querySelector("canvas");
      expect([canvas?.width, canvas?.height]).toEqual([160, 90]);
      expect(getByRole("radiogroup").style.gap).toBe("12px");
    });
  });

  describe("selection", () => {
    it("checks nothing and makes only the first radio tabbable when there is no value", () => {
      for (const value of [undefined, null]) {
        const { container, unmount } = render(picker({ value }));
        const all = radios(container);
        expect(all.map((r) => r.getAttribute("aria-checked"))).toEqual(
          Array<string>(19).fill("false"),
        );
        expect(all.map((r) => r.tabIndex)).toEqual([
          0,
          ...Array<number>(18).fill(-1),
        ]);
        unmount();
      }
    });

    it("checks the value and makes only it tabbable", () => {
      const { container } = render(picker({ value: "lagoon" }));
      const all = radios(container);
      const at = NAMES.indexOf("lagoon");
      expect(
        all.map((r) => [r.getAttribute("aria-checked"), r.tabIndex]),
      ).toEqual(NAMES.map((_, i) => (i === at ? ["true", 0] : ["false", -1])));
    });

    it("calls onChange with the preset name on a click", () => {
      const onChange = vi.fn();
      const { getByText } = render(picker({ onChange }));
      fireEvent.click(getByText("Rainbow band"));
      expect(onChange).toHaveBeenCalledExactlyOnceWith("rainbow-band");
    });
  });

  describe("keyboard", () => {
    const press = (
      container: HTMLElement,
      from: FieldPresetName,
      key: string,
    ) => {
      const button = radios(container)[NAMES.indexOf(from)]!;
      button.focus();
      return { button, notPrevented: fireEvent.keyDown(button, { key }) };
    };

    it.each([
      ["ArrowRight", "lunar", "lagoon"],
      ["ArrowDown", "lunar", "lagoon"],
      ["ArrowLeft", "lagoon", "lunar"],
      ["ArrowUp", "lagoon", "lunar"],
      ["ArrowRight", "fluted-ember", "violet-dusk"],
      ["ArrowDown", "fluted-ember", "violet-dusk"],
      ["ArrowLeft", "violet-dusk", "fluted-ember"],
      ["ArrowUp", "violet-dusk", "fluted-ember"],
      ["Home", "lagoon", "violet-dusk"],
      ["End", "lagoon", "fluted-ember"],
    ] as const)("%s from %s selects and focuses %s", (key, from, to) => {
      const onChange = vi.fn();
      const { container } = render(picker({ value: from, onChange }));
      const { notPrevented } = press(container, from, key);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(to);
      expect(document.activeElement).toBe(radios(container)[NAMES.indexOf(to)]);
      expect(notPrevented, "the page must not scroll").toBe(false);
    });

    it.each([
      ["altKey", "ArrowLeft"],
      ["altKey", "ArrowRight"],
      ["ctrlKey", "ArrowDown"],
      ["ctrlKey", "Home"],
      ["ctrlKey", "End"],
      ["metaKey", "ArrowLeft"],
      ["metaKey", "ArrowRight"],
      ["metaKey", "ArrowUp"],
    ] as const)(
      "leaves %s + %s to the browser: no selection, no focus change, default not prevented",
      (modifier, key) => {
        const onChange = vi.fn();
        const { container } = render(picker({ value: "lunar", onChange }));
        const button = radios(container)[NAMES.indexOf("lunar")]!;
        button.focus();
        const notPrevented = fireEvent.keyDown(button, {
          key,
          [modifier]: true,
        });
        expect(onChange).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(button);
        expect(notPrevented, "Alt+Left is Back, Cmd+Arrow is history").toBe(
          true,
        );
      },
    );

    it("still acts on Shift + an arrow key", () => {
      const onChange = vi.fn();
      const { container } = render(picker({ value: "lunar", onChange }));
      const button = radios(container)[NAMES.indexOf("lunar")]!;
      button.focus();
      fireEvent.keyDown(button, { key: "ArrowRight", shiftKey: true });
      expect(onChange).toHaveBeenCalledExactlyOnceWith("lagoon");
    });

    it("ignores other keys: no selection, no focus change, default not prevented", () => {
      const onChange = vi.fn();
      const { container } = render(picker({ value: "lunar", onChange }));
      for (const key of ["a", "Tab", "Enter", " ", "PageDown"]) {
        const { button, notPrevented } = press(container, "lunar", key);
        expect(document.activeElement).toBe(button);
        expect(notPrevented, key).toBe(true);
      }
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("thumbnails", () => {
    it("paints each thumbnail in a task of its own after mount, never during render", () => {
      render(picker());
      expect(painted()).toBe(0);
      expect(vi.getTimerCount()).toBe(19);
      flush();
      expect(painted()).toBe(19);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("paints the CPU renderField frame of each preset at the thumbnail size and t", () => {
      const thumbSize = uniqueSize();
      const { container } = render(picker({ thumbSize, t: 1.5 }));
      flush();
      const all = radios(container);
      for (const [i, name] of NAMES.entries()) {
        const ctx = fake.ctx2ds.find(
          (c) => c.canvas === all[i]?.querySelector("canvas"),
        );
        const image = ctx?.images[0];
        expect(image?.width).toBe(thumbSize.width);
        expect(image?.height).toBe(thumbSize.height);
        expect(image?.data, name).toEqual(
          renderField(fieldPresets[name], { ...thumbSize, t: 1.5 }).data,
        );
        expect(ctx?.calls.at(-1)).toBe(
          `putImageData ${thumbSize.width} ${thumbSize.height} 0 0`,
        );
      }
    });

    it("draws at second 0 by default", () => {
      const thumbSize = uniqueSize();
      render(picker({ thumbSize }));
      flush();
      expect(fake.ctx2ds[0]?.images[0]?.data).toEqual(
        renderField(fieldPresets["violet-dusk"], { ...thumbSize, t: 0 }).data,
      );
    });

    it("cancels the pending thumbnails when the picker unmounts", () => {
      const { unmount } = render(picker());
      expect(vi.getTimerCount()).toBe(19);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
      flush();
      expect(painted()).toBe(0);
    });

    it("cancels and restarts when thumbSize changes: only the new size is painted", () => {
      const first = uniqueSize();
      const second = uniqueSize();
      const { rerender } = render(picker({ thumbSize: first }));
      rerender(picker({ thumbSize: second }));
      flush();
      expect(painted()).toBe(19);
      for (const ctx of fake.ctx2ds)
        expect(ctx.images.map((i) => i.width)).toEqual([second.width]);
    });

    it("cancels and restarts when t changes before the thumbnails finish: only the new t is painted", () => {
      const thumbSize = uniqueSize();
      const { rerender } = render(picker({ thumbSize, t: 1 }));
      rerender(picker({ thumbSize, t: 2 }));
      expect(vi.getTimerCount()).toBe(19);
      flush();
      expect(painted()).toBe(19);
      for (const [i, name] of NAMES.entries()) {
        const image = fake.ctx2ds[i]?.images[0];
        expect(image?.data, name).toEqual(
          renderField(fieldPresets[name], { ...thumbSize, t: 2 }).data,
        );
      }
    });

    it("reuses a cached thumbnail at once, without a task or a new render", () => {
      const thumbSize = uniqueSize();
      const first = render(picker({ thumbSize }));
      flush();
      const before = fake.ctx2ds.flatMap((c) => c.images);
      first.unmount();
      render(picker({ thumbSize }));
      expect(vi.getTimerCount()).toBe(0);
      const after = fake.ctx2ds.flatMap((c) => c.images).slice(19);
      expect(after).toHaveLength(19);
      for (const [i, image] of after.entries()) expect(image).toBe(before[i]);
    });

    it("keeps only the 128 newest thumbnails: the oldest are rendered again", () => {
      const thumbSize = uniqueSize();
      const view = render(picker({ thumbSize, t: 0 }));
      flush();
      const at0 = fake.ctx2ds.flatMap((c) => c.images);
      // 7 moments x 19 presets = 133 entries; the 5 oldest (t = 0, first five presets) are dropped.
      for (const t of [1, 2, 3, 4, 5, 6]) {
        view.rerender(picker({ thumbSize, t }));
        flush();
      }
      view.unmount();
      const before = painted();
      render(picker({ thumbSize, t: 0 }));
      // The 14 newest t = 0 thumbnails are still cached and paint at once.
      expect(painted() - before).toBe(14);
      flush();
      const again = fake.ctx2ds.flatMap((c) => c.images).slice(before);
      expect(again).toHaveLength(19);
      // Cached ones are the very same image; the evicted five were drawn afresh (equal pixels, new object).
      const same = again.filter((image) => at0.includes(image));
      expect(same).toHaveLength(14);
      for (const [i, image] of again.slice(14).entries())
        expect(image.data).toEqual(at0[i]?.data);
    });

    it("leaves a canvas blank when its 2d context is unavailable", () => {
      fake.restore();
      fake = installFakeGl({ canvas2d: false });
      const { container } = render(picker());
      expect(() => {
        flush();
      }).not.toThrow();
      expect(radios(container)).toHaveLength(19);
      expect(painted()).toBe(0);
    });

    it("survives StrictMode's mount, unmount, mount", () => {
      const { container } = render(<StrictMode>{picker({})}</StrictMode>);
      flush();
      expect(radios(container)).toHaveLength(19);
      // One image per thumbnail: the first mount's tasks were cancelled, the second mount's ran once.
      expect(painted()).toBe(19);
      expect(new Set(fake.ctx2ds.filter((c) => c.images.length > 0)).size).toBe(
        19,
      );
    });
  });

  describe("invalid props", () => {
    const bad = (props: Record<string, unknown>): ReactElement => (
      <FieldPresetPicker
        onChange={noop}
        {...(props as { thumbSize?: never })}
      />
    );

    it.each([
      [
        "a null thumbSize",
        { thumbSize: null },
        /thumbSize\.width must be an integer in 1\.\.512, got undefined/,
      ],
      [
        "a thumbSize that is a number",
        { thumbSize: 9 },
        /thumbSize\.width must be an integer in 1\.\.512, got undefined/,
      ],
      [
        "a zero height",
        { thumbSize: { width: 9, height: 0 } },
        /thumbSize\.height must be an integer in 1\.\.512, got 0/,
      ],
      [
        "a side over the parser's own limit",
        { thumbSize: { width: 20000, height: 9 } },
        /thumbSize\.width must be an integer in 1\.\.512, got 20000/,
      ],
      [
        "a zero width",
        { thumbSize: { width: 0, height: 9 } },
        /thumbSize\.width must be an integer in 1\.\.512, got 0/,
      ],
      [
        "a fractional height",
        { thumbSize: { width: 9, height: 4.5 } },
        /thumbSize\.height must be an integer/,
      ],
      [
        "a width over 512",
        { thumbSize: { width: 513, height: 9 } },
        /thumbSize\.width must be an integer in 1\.\.512, got 513/,
      ],
      ["a NaN t", { t: Number.NaN }, /t must be a number in/],
      ["a t over the limit", { t: 2e6 }, /t must be a number in/],
      ["an unknown value", { value: "nope" }, /known: violet-dusk/],
    ])("throws a VisError at render for %s", (_label, props, message) => {
      expect(() => render(bad(props))).toThrow(VisError);
      expect(() => render(bad(props))).toThrow(message);
    });
  });
});
