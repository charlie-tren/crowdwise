// Squarified treemap layout (Bruls, Huizing & van Wijk 2000). Pure geometry -
// no React, no data-contract coupling. Given a list of {item, value} and a
// rectangle, it tiles the rectangle so each item's area is proportional to its
// value while keeping tile aspect ratios as close to square as possible. Used
// by MarketTreemap to lay out both the theme panels and the markets inside each.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placed<T> extends Rect {
  item: T;
}

interface Cell<T> {
  item: T;
  area: number;
}

// Worst (largest) aspect ratio in a row laid along a side of length `side`.
function worst<T>(row: Cell<T>[], side: number): number {
  if (!row.length || side <= 0) return Infinity;
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  for (const c of row) {
    sum += c.area;
    if (c.area > max) max = c.area;
    if (c.area < min) min = c.area;
  }
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

// Places a completed row against the short edge of `rect` and returns the
// leftover rectangle to keep subdividing.
function placeRow<T>(row: Cell<T>[], rect: Rect, out: Placed<T>[]): Rect {
  const sum = row.reduce((a, c) => a + c.area, 0);
  if (rect.w >= rect.h) {
    const stripW = sum / rect.h; // vertical strip on the left
    let y = rect.y;
    for (const c of row) {
      const h = c.area / stripW;
      out.push({ item: c.item, x: rect.x, y, w: stripW, h });
      y += h;
    }
    return { x: rect.x + stripW, y: rect.y, w: rect.w - stripW, h: rect.h };
  }
  const stripH = sum / rect.w; // horizontal strip on top
  let x = rect.x;
  for (const c of row) {
    const w = c.area / stripH;
    out.push({ item: c.item, x, y: rect.y, w, h: stripH });
    x += w;
  }
  return { x: rect.x, y: rect.y + stripH, w: rect.w, h: rect.h - stripH };
}

export function squarify<T>(items: { item: T; value: number }[], rect: Rect): Placed<T>[] {
  const total = items.reduce((a, i) => a + Math.max(0, i.value), 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return [];
  const area = rect.w * rect.h;
  const cells: Cell<T>[] = items
    .filter((i) => i.value > 0)
    .map((i) => ({ item: i.item, area: (i.value / total) * area }))
    .sort((a, b) => b.area - a.area);

  const out: Placed<T>[] = [];
  let remaining = cells;
  let r: Rect = { ...rect };

  while (remaining.length) {
    const side = Math.min(r.w, r.h);
    let count = 1;
    while (count < remaining.length) {
      const cur = remaining.slice(0, count);
      const nxt = remaining.slice(0, count + 1);
      if (worst(nxt, side) > worst(cur, side)) break;
      count++;
    }
    r = placeRow(remaining.slice(0, count), r, out);
    remaining = remaining.slice(count);
  }
  return out;
}

export function inset(r: Rect, pad: number): Rect {
  return {
    x: r.x + pad,
    y: r.y + pad,
    w: Math.max(0, r.w - pad * 2),
    h: Math.max(0, r.h - pad * 2),
  };
}
