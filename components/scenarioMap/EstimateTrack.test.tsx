import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { EstimateTrack } from "./EstimateTrack";
import type { InputNode } from "@/lib/scenarioMap/types";

const node: InputNode = {
  id: "i", kind: "input", label: "My read", low: 0.2, likely: 0.35, high: 0.5, source: "Charlie",
};

// jsdom has no layout, so the track rect's getBoundingClientRect is always
// zeroed. Stub it to a known screen rect rather than fighting jsdom for real
// layout - the component reads screen geometry off this element by design
// (see the comment in EstimateTrack.tsx), so this is the one thing a test
// needs to fake to drive a drag at all.
// jsdom (this version) does not give an SVG <rect> its own SVGRectElement
// subclass - `el.constructor.name` comes back as the generic "SVGElement" -
// so the prototype to spy on is SVGElement, not SVGRectElement. Only the
// track's own reference rect is read via the ref in the component, so
// stubbing it for every SVG element is harmless.
function stubTrackRect(width = 200, left = 0) {
  return vi
    .spyOn(SVGElement.prototype, "getBoundingClientRect")
    .mockReturnValue({ left, width, top: 0, height: 16, right: left + width, bottom: 16, x: left, y: 0, toJSON() {} });
}

// EstimateTrack renders bare SVG elements (a <g> holding <rect>/<circle>),
// meant to sit inside a parent <svg> - MapView's own big one, or a small
// dedicated one in NodeList. Rendered with no <svg> ancestor at all, React
// has no namespace to put the tags in and jsdom falls back to unknown HTML
// elements, which silently breaks both geometry (no longer an SVGElement,
// so the getBoundingClientRect stub below does not apply) and would never
// happen in the real app. Wrapping in <svg> here matches both real call
// sites and is what makes the stub meaningful.
function renderTrack(overrides: Partial<InputNode> = {}, onChange = vi.fn()) {
  const n: InputNode = { ...node, ...overrides };
  const { container } = render(
    <svg>
      <EstimateTrack node={n} onChange={onChange} ariaLabel="My read likelihood" />
    </svg>,
  );
  return { onChange, handle: screen.getByRole("slider"), container };
}

describe("EstimateTrack", () => {
  it("exposes a slider role with min/max/now and a meaningful label", () => {
    const { handle } = renderTrack();
    expect(handle.getAttribute("aria-valuemin")).toBe("0");
    expect(handle.getAttribute("aria-valuemax")).toBe("100");
    expect(handle.getAttribute("aria-valuenow")).toBe("35");
    expect(handle.getAttribute("aria-label")).toBe("My read likelihood");
  });

  it("is focusable", () => {
    const { handle } = renderTrack();
    expect(handle.getAttribute("tabindex")).toBe("0");
  });

  it("throttles the drag to one callback per animation frame", async () => {
    const rectSpy = stubTrackRect(200, 0);
    const { onChange, handle } = renderTrack();

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    // Several moves inside the same frame - a pointermove can fire well over
    // 60 times a second, and only the latest position should survive.
    fireEvent.pointerMove(handle, { clientX: 110, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 120, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 130, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0][0];
    expect(arg.likely).toBeCloseTo(0.65, 1); // 130/200

    rectSpy.mockRestore();
  });

  it("shifts low and high with likely, preserving width, on drag", async () => {
    const rectSpy = stubTrackRect(200, 0);
    const { onChange, handle } = renderTrack();

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 }); // fraction 0.5
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    expect(onChange).toHaveBeenCalledTimes(1);
    const { low, likely, high } = onChange.mock.calls[0][0];
    expect(likely).toBeCloseTo(0.5);
    expect(high - low).toBeCloseTo(0.5 - 0.2); // original width preserved
    rectSpy.mockRestore();
  });

  it("clamps the band at 0 without changing its width when dragged off the left edge", async () => {
    const rectSpy = stubTrackRect(200, 0);
    const { onChange, handle } = renderTrack();

    fireEvent.pointerDown(handle, { clientX: -500, pointerId: 1 });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    const { low, high } = onChange.mock.calls[0][0];
    expect(low).toBeCloseTo(0);
    expect(high - low).toBeCloseTo(0.3);
    rectSpy.mockRestore();
  });

  it("clamps the band at 1 without changing its width when dragged off the right edge", async () => {
    const rectSpy = stubTrackRect(200, 0);
    const { onChange, handle } = renderTrack();

    fireEvent.pointerDown(handle, { clientX: 5000, pointerId: 1 });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    const { low, high } = onChange.mock.calls[0][0];
    expect(high).toBeCloseTo(1);
    expect(high - low).toBeCloseTo(0.3);
    rectSpy.mockRestore();
  });

  it("does not call onChange from a pointermove before pointerdown", () => {
    const { onChange, handle } = renderTrack();
    fireEvent.pointerMove(handle, { clientX: 110, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops updating once the pointer is released", async () => {
    const rectSpy = stubTrackRect(200, 0);
    const { onChange, handle } = renderTrack();

    // Let the pointerdown's own scheduled frame land first, the way a real
    // gesture always would (release always comes at least a frame after the
    // initial press). Releasing commits only a frame still PENDING at that
    // moment - see "does not double-apply..." below for a frame that has
    // already fired by the time release happens.
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(onChange).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 180, pointerId: 1 });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    // The move after release must not add a second call.
    expect(onChange).toHaveBeenCalledTimes(1);
    rectSpy.mockRestore();
  });

  // This is the fast-drag bug: throttling to requestAnimationFrame means a
  // drag that ends before the next frame renders used to have its pending
  // frame CANCELLED on release, discarding the last movement rather than
  // committing it. A plain automated click-drag (pointerdown, pointermove,
  // pointerup with no frame rendered in between, exactly as below) used to
  // produce no call at all. The fix commits the latest pending value
  // synchronously on release instead of just cancelling it.
  it("commits the moved value on release even when no animation frame fires in between", () => {
    const rectSpy = stubTrackRect(200, 0);
    const { onChange, handle } = renderTrack();

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 130, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 130, pointerId: 1 });

    // No requestAnimationFrame tick has run at all at this point - the commit
    // must have happened synchronously inside the pointerup handler.
    expect(onChange).toHaveBeenCalledTimes(1);
    const { low, likely, high } = onChange.mock.calls[0][0];
    expect(likely).toBeCloseTo(0.65, 1); // 130/200, the LAST pointermove, not the pointerdown's 0.5
    expect(low).toBeCloseTo(0.5);
    expect(high).toBeCloseTo(0.8);
    rectSpy.mockRestore();
  });

  // The other half of the same fix: if the throttled frame happens to land
  // in the instant just before release, release must not commit a second
  // time on top of it. Committing only when a frame is still genuinely
  // pending (and clearing that pending state the moment it is committed,
  // whichever path commits it) is what keeps this from double-applying.
  it("does not double-apply a movement when a frame fires immediately before release", async () => {
    const rectSpy = stubTrackRect(200, 0);
    const { onChange, handle } = renderTrack();

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 150, pointerId: 1 });
    // The frame lands here, while the pointer is still down.
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(onChange).toHaveBeenCalledTimes(1);
    const committed = onChange.mock.calls[0][0].likely;
    expect(committed).toBeCloseTo(0.75, 1); // 150/200

    fireEvent.pointerUp(handle, { clientX: 150, pointerId: 1 });

    // Still exactly one call: nothing left pending for release to commit.
    expect(onChange).toHaveBeenCalledTimes(1);
    rectSpy.mockRestore();
  });

  it("moves right on ArrowRight and left on ArrowLeft, composing off the just-pressed value", () => {
    const { onChange, handle } = renderTrack();
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onChange.mock.calls[0][0].likely).toBeCloseTo(0.36);
    // The component never re-renders with an updated `node` between these two
    // synchronous fireEvent calls (onChange here is a bare mock, same as a
    // real burst of keydowns with no frame between them), so ArrowLeft must
    // compose off what ArrowRight just produced (0.36), not re-read the
    // original prop (0.35). One step right then one step left is therefore a
    // round trip back to exactly 0.35, not 0.34 - 0.34 is what you get if the
    // second key silently ignores the first (the composing bug below).
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onChange.mock.calls[1][0].likely).toBeCloseTo(0.35);
  });

  // The keyboard equivalent of the fast-drag bug: each keydown used to
  // compute its target from the last COMMITTED prop value rather than the
  // latest pending one, so holding an arrow key down (many keydowns
  // dispatched before React ever re-renders with an updated node) silently
  // dropped all but the last step. Ten ArrowRight presses in the same tick
  // must move the value by ten steps, not one.
  it("composes many keydowns dispatched in the same tick instead of collapsing to one step", () => {
    const { onChange, handle } = renderTrack();
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(handle, { key: "ArrowRight" });
    }
    expect(onChange).toHaveBeenCalledTimes(10);
    const last = onChange.mock.calls[9][0];
    expect(last.likely).toBeCloseTo(0.35 + 10 * 0.01); // 0.45, ten full steps
  });

  it("pins the band to the extreme on Home and End without squashing its width", () => {
    // node is low 0.2 / likely 0.35 / high 0.5, so likely sits 0.15 inside its
    // own 0.3-wide band. Home/End target the very edge (0 or 1), but the band
    // preserves its width rather than being squashed to reach it exactly, so
    // the resulting likely stops short of 0 or 1 by the same 0.15 offset -
    // this is the same "stops at the edge, does not squash" rule the drag
    // itself follows (see shiftRange in dragMath.ts).
    const { onChange, handle } = renderTrack();
    fireEvent.keyDown(handle, { key: "End" });
    const afterEnd = onChange.mock.calls[0][0];
    expect(afterEnd.high).toBeCloseTo(1);
    expect(afterEnd.high - afterEnd.low).toBeCloseTo(0.3);
    fireEvent.keyDown(handle, { key: "Home" });
    const afterHome = onChange.mock.calls[1][0];
    expect(afterHome.low).toBeCloseTo(0);
    expect(afterHome.high - afterHome.low).toBeCloseTo(0.3);
  });

  it("reaches likely exactly 1 on End when likely already sits at the top of its band", () => {
    const { onChange, handle } = renderTrack({ low: 0.3, likely: 0.5, high: 0.5 });
    fireEvent.keyDown(handle, { key: "End" });
    expect(onChange.mock.calls[0][0].likely).toBeCloseTo(1);
  });

  it("reaches likely exactly 0 on Home when likely already sits at the bottom of its band", () => {
    const { onChange, handle } = renderTrack({ low: 0.3, likely: 0.3, high: 0.6 });
    fireEvent.keyDown(handle, { key: "Home" });
    expect(onChange.mock.calls[0][0].likely).toBeCloseTo(0);
  });

  it("ignores a key it does not handle", () => {
    const { onChange, handle } = renderTrack();
    fireEvent.keyDown(handle, { key: "Tab" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not mutate the node it was handed", async () => {
    const rectSpy = stubTrackRect(200, 0);
    const original: InputNode = { ...node };
    const frozen = Object.freeze({ ...node });
    const onChange = vi.fn();
    render(
      <svg>
        <EstimateTrack node={frozen} onChange={onChange} ariaLabel="x" />
      </svg>,
    );
    const handle = screen.getByRole("slider");
    expect(() => fireEvent.pointerDown(handle, { clientX: 180, pointerId: 1 })).not.toThrow();
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(frozen).toEqual(original);
    rectSpy.mockRestore();
  });

  it("draws the band from low to high using the given unit scale", () => {
    const { container } = render(
      <svg>
        <EstimateTrack node={{ ...node, low: 0.25, high: 0.75 }} onChange={vi.fn()} ariaLabel="x" units={100} />
      </svg>,
    );
    const rects = container.querySelectorAll("rect");
    const band = rects[1]; // [0]=track baseline, [1]=band
    expect(Number(band.getAttribute("x"))).toBeCloseTo(25);
    expect(Number(band.getAttribute("width"))).toBeCloseTo(50);
  });

  // An 11px circle (the visible handle's own diameter, HANDLE_R=5.5) is a
  // hard thing to hit with a thumb; the usual touch-target guidance is
  // around 44px. The fix is a separate, invisible, bigger circle carrying
  // the interaction (role, focus, pointer handlers) so the visible handle
  // itself never has to grow.
  it("gives the handle a hit target well past its own visible size, big enough for a touch target", () => {
    const { container, handle } = renderTrack();
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(2);
    // The slider role belongs to the hit target, not the decorative circle -
    // that is what makes it the thing that is actually focusable and grabbable.
    expect(handle).toBe(circles[0]);
    const hitR = Number(circles[0].getAttribute("r"));
    const visibleR = Number(circles[1].getAttribute("r"));
    expect(visibleR).toBeCloseTo(5.5);
    expect(hitR).toBeGreaterThanOrEqual(visibleR * 3);
    expect(hitR * 2).toBeGreaterThanOrEqual(44); // the usual touch-target minimum, as a diameter
    // The decorative circle must never steal a pointer event from the hit
    // target sitting behind/around it.
    expect(circles[1].getAttribute("style") ?? "").toMatch(/pointer-events:\s*none/);
  });
});
