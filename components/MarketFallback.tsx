"use client";
import { useEffect, useState } from "react";
import { MarketDetail } from "./MarketDetail";
import { relatedMarkets } from "@/lib/board";
import { displayTitle } from "@/lib/highlights";
import { marketIdFromPath } from "@/lib/marketFallback";
import type { BoardPayload, Market } from "@/lib/types";

type State = { m: Market; related: Market[] } | "loading" | "missing";

export function MarketFallback() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const id = marketIdFromPath(window.location.pathname);
    if (!id) { setState("missing"); return; }
    Promise.all([
      fetch(`/api/market/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/board").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([d, board]: [{ market: Market | null } | null, BoardPayload | null]) => {
        const m = d?.market;
        if (!m) { setState("missing"); return; }
        document.title = `${displayTitle(m).slice(0, 60)} - Crowdwise`;
        setState({ m, related: relatedMarkets(board?.markets ?? [], m) });
      })
      .catch(() => setState("missing"));
  }, []);

  if (state === "loading") return <p className="text-sm text-muted">Loading market…</p>;
  if (state === "missing") return <p className="text-sm text-muted">This market could not be found.</p>;
  return <MarketDetail m={state.m} related={state.related} />;
}
