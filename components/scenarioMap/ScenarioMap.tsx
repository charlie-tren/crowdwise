"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { builtInMaps } from "@/lib/scenarioMap/builtins";
import { decodeMap, deleteMap, encodeMap, loadSaved, saveMap } from "@/lib/scenarioMap/codec";
import { evaluateMap } from "@/lib/scenarioMap/engine";
import type { MapNode, ScenarioMap as MapType } from "@/lib/scenarioMap/types";
import type { Market } from "@/lib/types";
import { MapOutline } from "./MapOutline";
import { MapView } from "./MapView";
import { NodeList } from "./NodeList";

const FOCUS_RING = "focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const newId = () => `n${Math.random().toString(36).slice(2, 9)}`;

export function ScenarioMap({ markets }: { markets: Market[] }) {
  const builtIns = useMemo(() => builtInMaps(markets), [markets]);
  const [saved, setSaved] = useState<MapType[]>([]);
  const [current, setCurrent] = useState<MapType>(builtIns[0]);
  const [dirty, setDirty] = useState(false);
  const [shared, setShared] = useState(false);

  // Storage is read AFTER mount, never during render: the server has none, and
  // reading it in render would make the two disagree. This effect never touches
  // `current`, so it cannot race with the one below. The lint rule below wants
  // state derived from props/subscriptions, not a one-off read of a browser API
  // that does not exist during SSR; there is no "external system" to subscribe
  // to here, only a value that can only be read once mounted.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setSaved(loadSaved());
  }, []);

  // Both the hash-on-first-load check and the built-in-follows-the-board check
  // write `current`, so they live in ONE effect rather than two. Two separate
  // effects both scheduled from the same mount would each capture the SAME
  // stale closure (current.id = the initial built-in, shared = false): the hash
  // effect's setCurrent(fromLink) and the refresh effect's setCurrent(builtIns[0])
  // would both be queued from that one commit, and being plain (non-functional)
  // setState calls, the later one wins - silently clobbering a shared link back
  // to the default built-in before the reader ever sees it. One effect means
  // only one thing ever decides `current` per commit.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      const hash = window.location.hash.match(/(?:^|#|&)m=([^&]+)/);
      const fromLink = hash ? decodeMap(hash[1]) : null;
      if (fromLink) {
        // One-off read of window.location.hash, only possible after mount (see
        // the comment on the effect above): there is no external system to
        // subscribe to here.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrent(fromLink);
        setShared(true);
        return;
      }
    }
    // The built-ins are rebuilt whenever the board moves, so an untouched
    // built-in has to follow it. An edited map is the reader's and is left alone.
    if (dirty || shared) return;
    const fresh = builtIns.find((m) => m.id === current.id);
    if (fresh) setCurrent(fresh);
  }, [builtIns, current.id, dirty, shared]);

  // A hash change on an already-open page is a same-document navigation:
  // nothing remounts, so nothing re-runs the effect above. The Share button
  // writes the hash with history.replaceState, which the spec does not fire
  // hashchange for (confirmed against this file: onShare below is the only
  // other place that touches the hash, and it calls replaceState, not
  // pushState or a direct assignment), so this listener cannot hear its own
  // writes and cannot loop.
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.match(/(?:^|#|&)m=([^&]+)/);
      // An emptied or map-less hash leaves whatever is on screen alone: the
      // reader may have unsaved edits, and snapping back to the default would
      // throw those away with no warning.
      if (!hash) return;
      const fromLink = decodeMap(hash[1]);
      // A malformed hash must not blank the page; decodeMap already returns
      // null for anything it cannot parse, so just ignore it here.
      if (!fromLink) return;
      // Mirrors the mount-time hash load: an unsaved copy of the reader's
      // own, not written to storage, and not folded into the current dirty
      // edit so Save behaves the same way it would on a fresh page load.
      setCurrent(fromLink);
      setShared(true);
      setDirty(false);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const results = useMemo(() => evaluateMap(current, markets), [current, markets]);

  const edit = (next: MapType) => { setCurrent(next); setDirty(true); };

  const pick = (map: MapType) => { setCurrent(map); setDirty(false); setShared(false); };

  const addNode = (node: MapNode) => edit({ ...current, nodes: [...current.nodes, node] });

  const onSave = () => {
    // A built-in is never overwritten: saving an edited one forks it.
    const target: MapType =
      current.builtIn || shared
        ? { ...current, id: `own-${newId()}`, name: `${current.name} (mine)`, builtIn: undefined }
        : current;
    saveMap(target);
    setSaved(loadSaved());
    setCurrent(target);
    setDirty(false);
    setShared(false);
  };

  const onShare = () => {
    const hash = `#m=${encodeMap(current)}`;
    window.history.replaceState(null, "", hash);
    navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}${hash}`).catch(() => {});
  };

  const onNew = () =>
    pick({
      id: `own-${newId()}`,
      name: "Untitled map",
      // Never an empty canvas: one node to edit beats a blank screen.
      nodes: [{ id: newId(), kind: "input", label: "My estimate", low: 0.2, likely: 0.35, high: 0.5, source: "" }],
    });

  const chips = [...builtIns, ...saved];

  return (
    <div>
      <h1 className="mb-4 text-[28px] font-semibold tracking-[-0.02em]">Scenario Map</h1>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {chips.map((m) => (
          <button
            key={m.id}
            onClick={() => pick(m)}
            className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${FOCUS_RING} ${
              m.id === current.id
                ? "border-accent bg-accent/[0.12] text-[var(--text)]"
                : "border-white/10 text-muted hover:border-white/25 hover:text-[var(--text)]"
            }`}
          >
            {m.name}
          </button>
        ))}
        <button onClick={onNew} className={`rounded-full border border-dashed border-white/20 px-3 py-1 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}>
          New map
        </button>
      </div>

      {/* The map's own name, and the only way to rename one. */}
      <input
        aria-label="Map name"
        value={current.name}
        onChange={(e) => edit({ ...current, name: e.target.value })}
        className={`mb-3 w-full max-w-sm rounded-lg border border-white/10 bg-panel/40 px-3 py-1.5 text-[15px] font-medium text-[var(--text)] outline-none ${FOCUS_RING}`}
      />

      <div className="mb-6 rounded-2xl border border-white/[0.06] bg-panel/40 p-4">
        <MapView map={current} results={results} markets={markets} onChange={edit} />
        <MapOutline map={current} results={results} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => addNode({ id: newId(), kind: "input", label: "New estimate", low: 0.2, likely: 0.35, high: 0.5, source: "" })}
          className={`rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}
        >
          Add estimate
        </button>
        <button
          onClick={() => {
            const top = markets.find((m) => m.prob != null);
            addNode({ id: newId(), kind: "market", label: top?.title.slice(0, 40) ?? "Pick a market", marketId: top?.id ?? "", side: "yes" });
          }}
          className={`rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}
        >
          Add market
        </button>
        <button
          onClick={() =>
            addNode({ id: newId(), kind: "formula", label: "All of them", op: "and", refs: current.nodes.slice(0, 2).map((n) => n.id) })
          }
          className={`rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}
        >
          Add formula
        </button>
        <span className="ml-auto flex gap-2">
          <button onClick={onShare} className={`rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}>
            Share
          </button>
          <button onClick={onSave} className={`rounded-lg border border-accent bg-accent/[0.12] px-3 py-1.5 text-[12px] text-[var(--text)] ${FOCUS_RING}`}>
            Save
          </button>
          {!current.builtIn && saved.some((m) => m.id === current.id) && (
            <button
              onClick={() => { deleteMap(current.id); setSaved(loadSaved()); pick(builtIns[0]); }}
              className={`rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-[var(--text)] ${FOCUS_RING}`}
            >
              Delete
            </button>
          )}
        </span>
      </div>

      <NodeList map={current} results={results} markets={markets} onChange={edit} />
    </div>
  );
}
