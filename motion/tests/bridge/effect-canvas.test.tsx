// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import type { EffectHandle } from "@dagnam/vis/animate";

import { EffectCanvas } from "../../src/bridge/effect-canvas.tsx";

const FPS = 30;

/** What a fake handle was asked to do. The handle itself is `EffectHandle`; the spies are kept apart so no method is read off it unbound. */
interface Fake {
  canvas: HTMLCanvasElement;
  start: Mock;
  renderAt: Mock;
  destroy: Mock;
}

const fakeHandle = (
  canvas: HTMLCanvasElement,
): { handle: EffectHandle; fake: Fake } => {
  const fake: Fake = {
    canvas,
    start: vi.fn(),
    renderAt: vi.fn(),
    destroy: vi.fn(),
  };
  const handle: EffectHandle = {
    canvas,
    running: false,
    duration: undefined,
    start: fake.start,
    stop: vi.fn(),
    update: vi.fn(),
    renderAt: fake.renderAt,
    destroy: fake.destroy,
  };
  return { handle, fake };
};

/** A `create` that remembers every handle it made, in order. */
const recording = () => {
  const made: Fake[] = [];
  const create = vi.fn((canvas: HTMLCanvasElement) => {
    const { handle, fake } = fakeHandle(canvas);
    made.push(fake);
    return handle;
  });
  return { made, create };
};

const times = (handle: Fake): number[] =>
  handle.renderAt.mock.calls.map((c) => c[0] as number);

afterEach(cleanup);

describe("<EffectCanvas>", () => {
  it("creates one handle, paints t = frame / fps for each frame, never starts the loop, destroys on unmount", () => {
    const { made, create } = recording();
    const frame = (f: number) => (
      <EffectCanvas create={create} t={f / FPS} width={640} height={360} />
    );
    const { rerender, unmount, container } = render(frame(0));
    const box = container.firstElementChild as HTMLDivElement;
    expect(box.style.width).toBe("640px");
    expect(box.style.height).toBe("360px");
    // The runtime reads the canvas's parent rect, so the canvas sits inside the sized box.
    expect(made[0]!.canvas.parentElement).toBe(box);
    rerender(frame(15));
    rerender(frame(30));
    expect(create).toHaveBeenCalledTimes(1);
    expect(times(made[0]!)).toEqual([0, 0.5, 1]);
    expect(made[0]!.start).not.toHaveBeenCalled();
    expect(made[0]!.destroy).not.toHaveBeenCalled();
    unmount();
    expect(made[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(made[0]!.canvas.isConnected).toBe(false);
  });

  it("does not repaint when nothing changed", () => {
    const { made, create } = recording();
    const ui = <EffectCanvas create={create} t={2} width={100} height={50} />;
    const { rerender } = render(ui);
    rerender(ui);
    expect(times(made[0]!)).toEqual([2]);
  });

  it("recreates the handle when `create` changes and paints it at the current t", () => {
    const a = recording();
    const b = recording();
    const { rerender, container } = render(
      <EffectCanvas create={a.create} t={2} width={100} height={50} />,
    );
    rerender(<EffectCanvas create={b.create} t={2} width={100} height={50} />);
    expect(a.made[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(a.made[0]!.canvas.isConnected).toBe(false);
    expect(b.create).toHaveBeenCalledTimes(1);
    expect(times(b.made[0]!)).toEqual([2]);
    expect(b.made[0]!.start).not.toHaveBeenCalled();
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("repaints when the size changes", () => {
    const { made, create } = recording();
    const { rerender } = render(
      <EffectCanvas create={create} t={1} width={100} height={50} />,
    );
    rerender(<EffectCanvas create={create} t={1} width={200} height={50} />);
    rerender(<EffectCanvas create={create} t={1} width={200} height={80} />);
    expect(create).toHaveBeenCalledTimes(1);
    expect(times(made[0]!)).toEqual([1, 1, 1]);
  });
});
