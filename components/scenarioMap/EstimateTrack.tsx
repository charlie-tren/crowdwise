"use client";
import { useEffect, useRef } from "react";
import { fractionFromClientX, likelyForKey, shiftRange } from "@/lib/scenarioMap/dragMath";
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

  const cancelFrame = () => {
    if (frame.current != null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  };
  // Cancel on unmount, not just on pointer release: a drag that ends by the
  // node being removed mid-gesture must not fire a callback into unmounted
  // state on the next frame.
  useEffect(() => cancelFrame, []);

  const applyFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const fraction = fractionFromClientX(clientX, rect);
    // requestAnimationFrame, not the raw pointermove rate: pointermove can
    // fire well over 60 times a second, and evaluateMap has no reason to run
    // more often than the screen paints. Only the LATEST position within a
    // frame survives - a new schedule replaces, never queues alongside, the
    // last one.
    cancelFrame();
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      onChange(shiftRange(node, fraction));
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
    cancelFrame();
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGCircleElement>) => {
    const target = likelyForKey(e.key, node.likely);
    if (target == null) return;
    e.preventDefault();
    onChange(shiftRange(node, target));
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
        r={HANDLE_R}
        fill="#c7ccd8"
        stroke="#8b93a7"
        strokeWidth={1.5}
        style={{ touchAction: "none", cursor: "ew-resize" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      />
    </g>
  );
}
