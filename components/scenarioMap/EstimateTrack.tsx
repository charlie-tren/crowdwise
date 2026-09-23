"use client";
import { useEffect, useRef } from "react";
import { fractionFromClientX, likelyForKey, shiftRange } from "@/lib/scenarioMap/dragMath";
import type { Range as EstimateRange } from "@/lib/scenarioMap/dragMath";
import type { InputNode } from "@/lib/scenarioMap/types";

// Drawn in a fixed set of internal units, independent of how many real CSS
// pixels the track ends up occupying on screen. MapView embeds this directly
// in its own SVG at 1 unit = 1 px; NodeList wraps it in a small
// width="100%" svg that stretches to the row. Either way the pointer maths
// below never reads these units - it reads the track rect's own
// getBoundingClientRect, which is always real screen pixels, so a stretched
// or unstretched track is handled identically and a sideways-scrolled
// MapView is handled for free (a scrolled element's bounding rect already
// reflects the scroll).
export const TRACK_UNITS = 240;
export const TRACK_H = 16;
const HANDLE_R = 5.5;
const BAND_H = 4;
// The visible handle is 11px across (2*HANDLE_R) wherever 1 unit is roughly
// 1 screen px - a hard thing to hit with a thumb. HIT_R draws a separate,
// invisible, larger circle underneath that carries the actual interaction
// (role, focus, pointer handlers), giving a 44px touch target - the usual
// guidance - without changing how big the handle itself looks.
//
// Checked against the real node layout (NODE_W/GAP_X in lib/scenarioMap/layout.ts
// and MapView's TRACK_INSET/TRACK_WIDTH): two horizontally-adjacent tracks'
// handles can come no closer than 76px centre-to-centre even at their extremes
// (one dragged to likely=1, its neighbour to likely=0), and vertically-stacked
// nodes are 110px apart. Both comfortably clear 2*HIT_R=44, so two input
// nodes' hit areas cannot overlap at the current geometry.
export const HIT_R = 22;

export function EstimateTrack({
  node, onChange, ariaLabel, units = TRACK_UNITS,
}: {
  node: InputNode;
  onChange: (range: { low: number; likely: number; high: number }) => void;
  ariaLabel: string;
  units?: number;
}) {
  const trackRef = useRef<SVGRectElement>(null);
  const frame = useRef<number | null>(null);
  const dragging = useRef(false);
  // The range computed by the most recent applyFromClientX call that has not
  // yet reached onChange - non-null exactly while a commit is still owed to
  // the parent, whether that commit lands via the throttled animation frame
  // or (see endDrag) synchronously on release.
  const pendingDrag = useRef<EstimateRange | null>(null);

  const clearFrame = () => {
    if (frame.current != null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  };
  // Cancel on unmount, not just on pointer release: a drag that ends by the
  // node being removed mid-gesture must not fire a callback into unmounted
  // state on the next frame. Unlike a real release, unmounting has no parent
  // left to receive a commit, so this discards rather than flushing.
  useEffect(() => () => {
    clearFrame();
    pendingDrag.current = null;
  }, []);

  const applyFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const fraction = fractionFromClientX(clientX, rect);
    // requestAnimationFrame, not the raw pointermove rate: pointermove can
    // fire well over 60 times a second, and evaluateMap has no reason to run
    // more often than the screen paints. Only the LATEST position within a
    // frame survives - a new schedule replaces, never queues alongside, the
    // last one.
    clearFrame();
    pendingDrag.current = shiftRange(node, fraction);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const toCommit = pendingDrag.current;
      pendingDrag.current = null;
      if (toCommit) onChange(toCommit);
    });
  };

  const onPointerDown = (e: React.PointerEvent<SVGCircleElement>) => {
    // Keeps the drag alive even if the pointer leaves the small handle -
    // without this, a fast drag on a touch screen loses capture the instant
    // the finger crosses the handle's edge. Optional-called: jsdom (the test
    // environment) does not implement it at all, and a missing method here
    // must not crash the drag it is only there to make more robust.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragging.current = true;
    applyFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!dragging.current) return;
    applyFromClientX(e.clientX);
  };
  const endDrag = () => {
    dragging.current = false;
    // A fast drag - pointerdown, pointermove, pointerup all inside one
    // animation frame - used to have its pending frame simply CANCELLED
    // here, discarding the last movement instead of committing it: any
    // gesture that ended before the next frame rendered did nothing at all.
    // Cancel the frame (it must not also fire later and commit a second
    // time) but flush whatever it was about to commit right now, synchronously,
    // so the final pointer position is never lost. If the frame already fired
    // on its own before release, pendingDrag is already null and this is a
    // no-op - that is what stops a frame landing a moment before release from
    // being double-applied.
    clearFrame();
    const toCommit = pendingDrag.current;
    pendingDrag.current = null;
    if (toCommit) onChange(toCommit);
  };

  // Composing across a synchronous burst of keydowns (holding an arrow key
  // down can deliver many keydowns before React ever re-renders this
  // component with an updated `node` prop) needs its own baseline, separate
  // from `node`: each key step used to compute its target from `node.likely`
  // directly, so ten ArrowRight presses in one tick each computed the SAME
  // one-step target and only the final, identical commit survived. pendingKey
  // holds the latest not-yet-reflected-in-props value and is read as the
  // baseline for the next key press. It is reset in an effect keyed on
  // `node`, not during render (refs must not be written while rendering) -
  // that effect only runs after a commit, so it cannot fire in the middle of
  // a synchronous burst that never yields for React to re-render, which is
  // exactly the case that needs pendingKey to keep composing. Once a
  // genuinely new `node` prop does land, the effect clears it and `node`
  // itself is the accurate baseline again.
  const pendingKey = useRef<EstimateRange | null>(null);
  useEffect(() => {
    pendingKey.current = null;
  }, [node]);

  const onKeyDown = (e: React.KeyboardEvent<SVGCircleElement>) => {
    const base = pendingKey.current ?? node;
    const target = likelyForKey(e.key, base.likely);
    if (target == null) return;
    e.preventDefault();
    const result = shiftRange(base, target);
    pendingKey.current = result;
    onChange(result);
  };

  const lowX = node.low * units;
  const highX = node.high * units;
  const likelyX = node.likely * units;

  return (
    <g data-estimate-track>
      {/* The reference element for pointer maths: every fraction is read off
          THIS element's live geometry, never a value computed ahead of time. */}
      <rect
        ref={trackRef}
        x={0}
        y={TRACK_H / 2 - 1}
        width={units}
        height={2}
        fill="rgba(255,255,255,0.14)"
      />
      {/* The low-to-high band: the track shows the range, not just the point. */}
      <rect
        x={lowX}
        y={TRACK_H / 2 - BAND_H / 2}
        width={Math.max(0, highX - lowX)}
        height={BAND_H}
        rx={BAND_H / 2}
        fill="rgba(139,147,167,0.45)"
      />
      {/* The actual interactive element: invisible, and considerably bigger
          than the handle it sits behind, so there is something worth a
          thumb's worth of room to grab. Everything about the interaction -
          role, focus, pointer and key handling - lives here, not on the
          circle a reader can see. */}
      <circle
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(node.likely * 100)}
        aria-valuetext={`${Math.round(node.likely * 100)}%`}
        cx={likelyX}
        cy={TRACK_H / 2}
        r={HIT_R}
        fill="transparent"
        style={{ touchAction: "none", cursor: "ew-resize" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      />
      {/* Purely decorative: what you see is not what you grab. pointerEvents
          none means it can never intercept an event meant for the hit target
          above, no matter the paint order. */}
      <circle
        aria-hidden="true"
        cx={likelyX}
        cy={TRACK_H / 2}
        r={HANDLE_R}
        fill="#c7ccd8"
        stroke="#8b93a7"
        strokeWidth={1.5}
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
}
