# Scenario Map design

**Date:** 23/09/2026
**Status:** approved, not built
**Replaces:** the flat market picker and the thesis-basket cards on `/scenario`

## What this is

A map of the predictions behind a macro view. Nodes hold probabilities, each with
its source attached: a live market price from the board, an estimate you typed, or
a base rate you looked up. Formula nodes combine other nodes, and the arrows on the
map are those formulas rather than a separate sketching layer.

Prompted by Metaculus's Radiant, which does the same job over Metaculus forecasts.
The difference worth building is the source of the numbers. Radiant's every node is
a forecaster aggregate with no money behind it; here the default node is a real
price from Kalshi or Polymarket, which is what this site already has and Radiant
does not.

## What it is not

- **No free canvas.** Nodes are not dragged and arrows are not drawn by hand. The
  picture is derived from the formulas, so there is no second structure to keep in
  step with the maths, and it renders on a phone.
- **No AI drafting.** Radiant drafts a first map from a chat prompt. The built-in
  maps and a conversation with Claude cover it, and an in-page model call would put
  a free-tier quota between a reader and a static page.
- **No Metaculus.** `lib/metaculus.ts` stays dormant. It is token-gated and the
  token does not exist. If it ever does, it becomes a fourth node kind and nothing
  else changes.
- **No new dependency and no server state.**

## Data model

`lib/scenarioMap/types.ts`.

A map is `{ id, name, nodes: MapNode[] }`. Every node has an `id`, a `label` and a
kind.

**`market`** carries a board market id and a side (`yes` or `no`). Its value is that
market's live price, side-adjusted. It has no range: a price is a point, and giving
one an interval would invent precision the venue never quoted. An id that no longer
resolves against the board makes the node unresolved, never zero.

**`input`** carries `low`, `likely`, `high` and a one-line `source` string. This is
both of Radiant's hand-entered kinds: an estimate ("Charlie, 20 to 40, probably 25")
and a base rate ("3 of 12 post-war cycles") differ in where the number came from,
which is what `source` records, not in how they behave. A point estimate is
`low === likely === high`, which the engine handles without a special case.

**`formula`** carries an operator and the ids it reads:

| Operator | Meaning |
|---|---|
| `and` | every input resolves YES. Product. |
| `or` | at least one resolves YES. One minus the product of complements. |
| `not` | one minus its single input. |
| `mix` | weighted average of its inputs, weights part of the node. |
| `depends` | `P(A) = P(A given B)·P(B) + P(A given not B)·(1 - P(B))`. Three refs: the condition B, and the two conditionals. |

`depends` is the one that earns the feature. Everything else on this page can
already be expressed with the two functions in `lib/scenario.ts`; conditioning one
probability on another cannot, and it is how a macro view is actually argued.

`and` and `or` assume independence, which the current page already says in its lede
and must keep saying. `depends` is how a reader escapes that assumption for the pair
they care about.

## Engine

`lib/scenarioMap/engine.ts`, pure, no React.

Topological sort over the formula refs. A cycle marks every node in it `circular`
rather than throwing, because a half-built map is the normal state while someone is
editing one.

Then 4,000 Monte Carlo draws with a seeded PRNG, so the same map always renders the
same numbers and a re-render never wobbles. Per draw: `market` nodes are constants,
`input` nodes sample a triangular distribution over (low, likely, high), `formula`
nodes evaluate over the draw's values. Each node reports its median and its 10th and
90th percentiles.

A missing market, an unresolvable ref or a cycle makes a node unresolved, and every
node downstream of it unresolved too. An unresolved node prints as unresolved with
the reason. It never prints as a number, and a map with one broken leg still shows
every other node's value.

The seed and the draw count are module constants with the reasoning beside them.
4,000 draws puts the Monte Carlo error on a probability near 0.5 at about 0.8
percentage points, which is under the display precision of a whole percent.

## Layout

`lib/scenarioMap/layout.ts`, a pure function from a map to positions, so it is
testable without a DOM.

Layers left to right by longest path from the leaves, ordered within a layer by the
barycentre of each node's inputs to cut crossings, edges drawn as curves. Positions
are in container pixels, not a fixed viewBox scaled to fit, so labels are the size
they are declared: the estate has shipped 4px axis labels twice by scaling a wide
viewBox into a phone. A resize handler redraws.

**Below 640px the picture comes off entirely** and the map renders as an outline,
each node's inputs indented under it. When a label and a decoration compete for a
narrow screen the label is the content, and a six-node graph at 375px is neither
readable nor tappable. The outline carries the same numbers and the same sources.

## Page

`/scenario`, still statically prerendered. `npm run build` must keep printing it
`○`, so the map is a client component fed by the existing server-side
`fetchTopMarkets`, and nothing on the route gains a `no-store` fetch.

The four theses in `lib/thesis.ts` become the first four built-in maps, each an
`and` over its legs. Their leg predicates are reused as they stand, so market ids
stay out of the source and a map resolves against whatever the board holds today.
The page opens on "Recession in 2026" with live numbers, never on an empty canvas or
a chooser, and the default is not written to the URL.

Layout down the page: a row of map chips (built-ins, then saved maps, then New),
then the map, then the node list. Each node is a row carrying its label, its kind,
its value with the range, and its source, and opens an inline editor on click. Add
offers the three kinds, and the market kind reuses the search-and-filter list that
is on the page today rather than a second one.

Colour says what kind a node is: the board's theme colour for a market, muted for an
input, accent for a formula. The accent stays off anything that is not interactive
or a value.

The existing visible lede goes with the picker it describes. The meta description
keeps a sentence, because a share card needs one and nobody on the page has to read
it. No standfirst replaces it.

## Persistence and sharing

Saved maps live in `localStorage` under one key, read and written inside try/catch,
with the page correct when the read comes back empty. Share encodes the map as
compact JSON, base64url, into the URL hash; opening such a link loads it as an
unsaved copy and does not touch what is stored. The hash is only ever written by the
share button.

Nothing goes to a server. There is no KV on this site and no auth, so this is the
only option that does not add both.

## Tests

Vitest, beside the modules, matching the repo's existing layout.

- **Engine:** closed forms with point inputs (`and` of 0.5 and 0.5 is 0.25, `or` is
  0.75, `depends` against a hand-computed case), the triangular mean, null
  propagation through a chain, cycle detection, and the seeded run reproducing.
- **Layout:** layer assignment on a diamond, stable ordering, and a two-parent node
  sitting to the right of both parents.
- **Codec:** round-trip of every node kind, and a malformed hash rejected rather
  than throwing.
- **Built-ins:** all four resolve against a fixture board, and a board missing a leg
  leaves the other legs resolved.
- **Outline:** renders every node and every number at narrow width.
- **Route table:** `/scenario` still `○` after the change.

## Considered and rejected

**A free canvas with drawn arrows**, which is Radiant's actual interface. Rejected
because arrows that never change a number are a second structure to maintain, a
canvas does not work at 375px, and the dragging is chrome rather than content.

**Free arithmetic expressions in a formula node.** This is what Radiant does, and
checked against its MCP schema on 23/09/2026 its node types are parameter, binary
probability, distribution, formula, base rate and Metaculus question, with the
formula node taking an arbitrary expression over other nodes' refs. A named operator
set was kept instead: the five operators cover the probability algebra this page
needs, they need no parser and no syntax to learn, and each one can state its
independence assumption in words next to the number. If a map ever needs arithmetic
these cannot express, an expression node is an addition rather than a rewrite.

**A separate distribution kind per family**, as Radiant has. One triangular input
covers a low, a likely and a high, which is how a person actually states an estimate,
and it degenerates to a point estimate for free.

**An outline with no picture.** Cheapest, and it throws away the thing that makes
Radiant worth copying. The narrow-screen rendering is exactly this, so it exists
anyway.
