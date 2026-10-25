// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
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

import { createField, type EffectHandle } from "../../src/animate/index.js";
import { VisError } from "../../src/core/index.js";
import { fieldPresets, type FieldSpec } from "../../src/field/index.js";
import { VisBackground } from "../../src/react/index.js";
import { installFakeGl } from "../animate/fake-gl.js";

// jsdom has no WebGL2 and the fake GL does not run the field shader: createField is replaced
// (the other effects are tested against the fake GL in vis-background.test.tsx).
vi.mock("../../src/animate/field.js", () => ({ createField: vi.fn() }));

describe('<VisBackground effect="field">', () => {
  const dawn = fieldPresets["fluid-dawn"];
  const spec = (seed: number): FieldSpec => ({ ...dawn, seed });
  const mocked = vi.mocked(createField);
  interface Made {
    handle: EffectHandle;
    canvas: HTMLCanvasElement;
    start: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }
  let made: Made[];
  let fake: ReturnType<typeof installFakeGl>;
  const create = (canvas: HTMLCanvasElement): EffectHandle => {
    // The real field makes its context when it starts; the fake handle makes it here, on its own canvas.
    canvas.getContext("webgl2");
    const start = vi.fn();
    const update = vi.fn();
    const destroy = vi.fn();
    const handle = {
      canvas,
      running: false,
      start,
      stop: vi.fn(),
      update,
      renderAt: vi.fn(),
      destroy,
    } as EffectHandle;
    made.push({ handle, canvas, start, update, destroy });
    return handle;
  };
  let error: MockInstance<typeof console.error>;
  beforeEach(() => {
    fake = installFakeGl();
    made = [];
    error = vi.spyOn(console, "error").mockImplementation(() => {
      /* asserted per test */
    });
    mocked.mockReset();
    mocked.mockImplementation(create);
  });
  afterEach(() => {
    cleanup();
    error.mockRestore();
    fake.restore();
  });
  /** Context state per canvas the field made, in creation order. */
  const lost = (): boolean[] => fake.gls.map((gl) => gl.isContextLost());

  const view = (
    options: { spec: FieldSpec; speed?: number },
    onError?: (e: unknown) => void,
  ): ReactElement => (
    <VisBackground
      effect="field"
      options={options}
      {...(onError ? { onError } : {})}
    />
  );

  it("creates the field with the canvas, the spec and the options, starts it once and destroys it on unmount", () => {
    const options = { spec: spec(1), speed: 0.5 };
    const { container, unmount } = render(view(options));
    const canvases = container.querySelectorAll("canvas");
    expect(canvases).toHaveLength(1);
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked).toHaveBeenCalledWith(canvases[0], options.spec, options);
    expect(made[0]?.start).toHaveBeenCalledTimes(1);
    expect(made[0]?.destroy).not.toHaveBeenCalled();
    unmount();
    expect(made[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeNull();
    expect(lost()).toEqual([true]);
  });

  it("applies a changed non-spec option with update() and does not recreate", () => {
    const s = spec(1);
    const { rerender, container } = render(view({ spec: s, speed: 0.5 }));
    const canvas = container.querySelector("canvas");
    rerender(view({ spec: s, speed: 0.9 }));
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(made[0]?.update).toHaveBeenCalledTimes(1);
    expect(made[0]?.update).toHaveBeenCalledWith({ spec: s, speed: 0.9 });
    expect(made[0]?.destroy).not.toHaveBeenCalled();
  });

  it("does nothing for an equal spec in a fresh object", () => {
    const { rerender, container } = render(view({ spec: spec(1), speed: 0.5 }));
    const canvas = container.querySelector("canvas");
    for (let i = 0; i < 3; i++) rerender(view({ spec: spec(1), speed: 0.5 }));
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(made[0]?.update).not.toHaveBeenCalled();
    expect(made[0]?.destroy).not.toHaveBeenCalled();
  });

  it("recreates the effect when the spec value changes, without calling update() with the new spec", () => {
    const { rerender, container } = render(view({ spec: spec(1), speed: 0.5 }));
    const first = container.querySelector("canvas");
    rerender(view({ spec: spec(2), speed: 0.5 }));
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(mocked.mock.calls[1]?.[1]).toEqual(spec(2));
    expect(made[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(made[1]?.destroy).not.toHaveBeenCalled();
    expect(first?.isConnected).toBe(false);
    const canvases = container.querySelectorAll("canvas");
    expect(canvases).toHaveLength(1);
    expect(canvases[0]).toBe(made[1]?.canvas);
    expect(made[1]?.start).toHaveBeenCalledTimes(1);
    expect(made[0]?.update).not.toHaveBeenCalled();
    expect(made[1]?.update).not.toHaveBeenCalled();
    // The replaced canvas's context is lost; the new one's is live.
    expect(lost()).toEqual([true, false]);
    // The new handle is a live one: a later non-spec change updates it.
    rerender(view({ spec: spec(2), speed: 0.7 }));
    expect(made[1]?.update).toHaveBeenCalledTimes(1);
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it("contains an invalid new spec, then mounts again for a valid one", () => {
    const rejected = new VisError("spec.seed is not valid");
    mocked.mockImplementation((canvas, s) => {
      if (s.seed === 99) throw rejected;
      return create(canvas);
    });
    const onError = vi.fn();
    const { rerender, container } = render(view({ spec: spec(1) }, onError));
    rerender(view({ spec: spec(99) }, onError));
    expect(made[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("canvas")).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(rejected);
    // Same invalid spec again: no retry, no second report.
    rerender(view({ spec: spec(99) }, onError));
    expect(onError).toHaveBeenCalledTimes(1);
    rerender(view({ spec: spec(3) }, onError));
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(made).toHaveLength(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("survives StrictMode's mount, unmount, mount with one live canvas and balanced create/destroy", () => {
    const { container, unmount } = render(
      <StrictMode>{view({ spec: spec(1) })}</StrictMode>,
    );
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(made[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(made[1]?.destroy).not.toHaveBeenCalled();
    expect(made[0]?.canvas.isConnected).toBe(false);
    const canvases = container.querySelectorAll("canvas");
    expect(canvases).toHaveLength(1);
    expect(canvases[0]).toBe(made[1]?.canvas);
    expect(made[1]?.start).toHaveBeenCalledTimes(1);
    expect(lost()).toEqual([true, false]);
    unmount();
    expect(made[1]?.destroy).toHaveBeenCalledTimes(1);
    expect(container.querySelector("canvas")).toBeNull();
    expect(lost()).toEqual([true, true]);
  });

  it("recreates exactly once more for a spec change under StrictMode", () => {
    const { rerender, container } = render(
      <StrictMode>{view({ spec: spec(1) })}</StrictMode>,
    );
    expect(mocked).toHaveBeenCalledTimes(2);
    rerender(<StrictMode>{view({ spec: spec(2) })}</StrictMode>);
    expect(mocked).toHaveBeenCalledTimes(3);
    expect(mocked.mock.calls[2]?.[1]).toEqual(spec(2));
    expect(made[1]?.destroy).toHaveBeenCalledTimes(1);
    expect(made[2]?.destroy).not.toHaveBeenCalled();
    const canvases = container.querySelectorAll("canvas");
    expect(canvases).toHaveLength(1);
    expect(canvases[0]).toBe(made[2]?.canvas);
    for (const m of made) expect(m.update).not.toHaveBeenCalled();
    expect(lost()).toEqual([true, true, false]);
    // Created minus destroyed is the one live handle.
    expect(made.filter((m) => m.destroy.mock.calls.length === 0)).toHaveLength(
      1,
    );
  });

  // Elements are built but never rendered: the errors come from VisBackgroundProps itself.
  it("types the spec as required, and seed and colors as absent, for the field effect", () => {
    const elements = [
      // @ts-expect-error `options` is required for effect="field"
      <VisBackground effect="field" />,
      // @ts-expect-error `options.spec` is required for effect="field"
      <VisBackground effect="field" options={{ speed: 1 }} />,
      // @ts-expect-error a field takes no `seed` option: it belongs to the spec
      <VisBackground effect="field" options={{ spec: spec(1), seed: 1 }} />,
      // @ts-expect-error a field takes no `colors` option: the palette is in the spec
      <VisBackground effect="field" options={{ spec: spec(1), colors: [] }} />,
    ];
    expect(elements).toHaveLength(4);
  });
});
