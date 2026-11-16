import { unzipSync, strFromU8 } from "fflate";
import type { FedPathPoint } from "./highlights";

// The Atlanta Fed Market Probability Tracker: market-implied probabilities for the
// 3-month compounded average SOFR, estimated from CME options on SOFR futures. It
// is the OIS/futures-implied rate path (WIRP-style) - a REAL-money comparator for
// the site's prediction-market implied path. Published by a Federal Reserve Bank
// (freely usable; attribute "Atlanta Fed / CME"). Only a ~7 MB .xlsx is offered
// (no JSON feed), so we fetch + unzip + parse it here. Any failure degrades to
// null and the home page falls back to the crowd-only path.
export const ATLANTA_FED_MPT_URL =
  "https://www.atlantafed.org/-/media/Project/Atlanta/FRBA/Documents/research-and-data/data/market-probability-tracker/mpt_histdata.xlsx";

// The Atlanta Fed site 403s non-browser user agents, so present a browser UA.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface MptRow {
  date: string; // observation date, ISO
  referenceStart: string; // Excel serial for the start of the 3-month SOFR window
  targetRange: string; // FOMC target range on the observation date, e.g. "425bps - 450bps"
  field: string; // statistic name, e.g. "Rate: mean"
  value: number;
}

export interface FedFuturesPoint {
  refStartTs: number; // ms epoch for the window start
  meanPct: number; // implied 3m-avg SOFR, mean, in percent
  p25Pct: number;
  p75Pct: number;
}

export interface FedFuturesPath {
  asOf: string; // latest observation date in the file
  currentRatePct: number; // midpoint of the current FOMC target range, percent
  points: FedFuturesPoint[]; // sorted by window start
}

// ---- xlsx parsing (fflate unzip + minimal XML) -----------------------------

type BytesFetcher = (url: string) => Promise<Uint8Array>;

const realBytesFetcher: BytesFetcher = async (url) => {
  // No `cache: "no-store"`: in a static export build that throws a static-generation
  // bailout and the overlay silently drops. The workbook (~7 MB) is over Next's 2 MB
  // data-cache limit, so Next skips caching it with a warning; the PARSED result is
  // cached in-process instead (see fetchFedFuturesPath).
  const resp = await fetch(url, { headers: { "User-Agent": BROWSER_UA, Accept: "*/*" } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
};

let _bytesFetcher = realBytesFetcher;
export function setBytesFetcher(fn: BytesFetcher) { _bytesFetcher = fn; }
export function resetBytesFetcher() { _bytesFetcher = realBytesFetcher; }

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
    return unescapeXml(texts.join(""));
  });
}

// Parse a worksheet's rows into arrays of cell strings, resolving shared-string
// references. Assumes dense rows (the Fed export has all 5 columns present) and
// takes cells in document order.
function parseSheetRows(xml: string, shared: string[]): string[][] {
  return [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((rm) => {
    const cells: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1] ?? "";
      const inner = cm[2] ?? "";
      const t = attrs.match(/\bt="([^"]+)"/)?.[1];
      let val = "";
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (v != null) {
        val = t === "s" ? (shared[Number(v)] ?? "") : v;
      } else {
        const is = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("");
        if (is) val = unescapeXml(is);
      }
      cells.push(val);
    }
    return cells;
  });
}

const EXPECTED_HEADER = ["date", "reference_start", "target_range", "field", "value"];

// Unzip the MPT workbook and extract the DATA sheet as tidy rows. Robust to sheet
// ordering: it scans every worksheet and picks the one whose first row matches the
// expected header. Returns [] on any structural surprise (caller degrades).
export function extractMptRows(bytes: Uint8Array): MptRow[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return [];
  }
  const sharedXml = files["xl/sharedStrings.xml"];
  const shared = sharedXml ? parseSharedStrings(strFromU8(sharedXml)) : [];

  const sheetNames = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  for (const name of sheetNames) {
    const rows = parseSheetRows(strFromU8(files[name]), shared);
    if (!rows.length) continue;
    const header = rows[0].map((c) => c.trim().toLowerCase());
    if (EXPECTED_HEADER.some((h, i) => header[i] !== h)) continue;

    const out: MptRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 5) continue;
      const value = Number(String(r[4]).trim());
      if (!Number.isFinite(value)) continue;
      out.push({
        date: r[0].trim(),
        referenceStart: r[1].trim(),
        targetRange: r[2].trim(),
        field: r[3].trim(),
        value,
      });
    }
    return out;
  }
  return [];
}

// ---- shaping ----------------------------------------------------------------

// Excel serial date (days since 1899-12-30) -> ms epoch. 25569 = serial of the
// Unix epoch (1970-01-01).
export function excelSerialToMs(serial: string | number): number {
  const n = Number(serial);
  return Number.isFinite(n) ? (n - 25569) * 86_400_000 : NaN;
}

// "425bps - 450bps" -> 4.375 (percent midpoint). Averages all bps numbers found.
export function parseTargetMidPct(targetRange: string): number {
  const nums = [...targetRange.matchAll(/(\d+(?:\.\d+)?)\s*bps/gi)].map((m) => Number(m[1]));
  if (!nums.length) return NaN;
  const avgBps = nums.reduce((s, x) => s + x, 0) / nums.length;
  return avgBps / 100;
}

// Build the implied SOFR path for the LATEST observation date: mean + 25th/75th
// percentile (converted bps -> percent) at each reference window, sorted by time.
export function buildFedFuturesPath(rows: MptRow[]): FedFuturesPath | null {
  if (!rows.length) return null;
  const latest = rows.reduce((mx, r) => (r.date > mx ? r.date : mx), rows[0].date);
  const latestRows = rows.filter((r) => r.date === latest);
  if (!latestRows.length) return null;

  type Acc = { mean?: number; p25?: number; p75?: number };
  const byRef = new Map<string, Acc>();
  for (const r of latestRows) {
    const g = byRef.get(r.referenceStart) ?? {};
    if (r.field === "Rate: mean") g.mean = r.value / 100;
    else if (r.field === "Rate: 25th percentile") g.p25 = r.value / 100;
    else if (r.field === "Rate: 75th percentile") g.p75 = r.value / 100;
    byRef.set(r.referenceStart, g);
  }

  const points: FedFuturesPoint[] = [...byRef.entries()]
    .map(([refStart, g]) => ({
      refStartTs: excelSerialToMs(refStart),
      meanPct: g.mean as number,
      p25Pct: g.p25 as number,
      p75Pct: g.p75 as number,
    }))
    .filter((p) => Number.isFinite(p.refStartTs) && p.meanPct != null && p.p25Pct != null && p.p75Pct != null)
    .sort((a, b) => a.refStartTs - b.refStartTs);
  if (points.length < 2) return null;

  const currentRatePct = parseTargetMidPct(latestRows.find((r) => r.targetRange)?.targetRange ?? "");
  return { asOf: latest, currentRatePct, points };
}

// In-process cache of the tiny parsed result (the Fed updates daily), so one build
// downloads the workbook once. Serves stale on a later fetch failure.
let _cache: { at: number; path: FedFuturesPath | null } | null = null;
const CACHE_TTL_MS = 6 * 3_600_000;

export async function fetchFedFuturesPath(nowMs: number = Date.now()): Promise<FedFuturesPath | null> {
  if (_cache && nowMs - _cache.at < CACHE_TTL_MS) return _cache.path;
  try {
    const bytes = await _bytesFetcher(ATLANTA_FED_MPT_URL);
    const path = buildFedFuturesPath(extractMptRows(bytes));
    _cache = { at: nowMs, path };
    return path;
  } catch (err) {
    console.warn("Atlanta Fed MPT fetch/parse failed", err);
    return _cache?.path ?? null; // serve stale on failure if we have it
  }
}

// ---- overlay series (futures vs crowd, both as rate LEVEL over time) ---------

export interface OverlayRow {
  ts: number;
  label: string;
  futMean?: number;
  band?: [number, number]; // [p25, p75] futures uncertainty
  crowd?: number; // prediction-market implied level
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtTs(ts: number): string {
  const d = new Date(ts);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

// Merge the futures path and the crowd (prediction-market) path into one set of
// rows on a shared calendar axis, both expressed as expected policy-rate LEVEL
// (percent). Both lines are anchored at today's rate (currentRatePct); the crowd
// path is the current rate plus its cumulative implied change. Capped to
// horizonMonths so the far-out quarterly windows (with a very wide band) don't
// blow out the y-axis. nowMs is injectable for deterministic tests.
export function buildOverlaySeries(
  futures: FedFuturesPath,
  crowd: FedPathPoint[],
  nowMs: number,
  horizonMonths = 18,
): OverlayRow[] {
  const rows: OverlayRow[] = [];
  const cur = futures.currentRatePct;
  const horizonTs = nowMs + horizonMonths * 30.44 * 86_400_000;

  // Shared "today" anchor so both lines emanate from the actual current rate.
  rows.push({ ts: nowMs, label: "Now", futMean: cur, band: [cur, cur], crowd: cur });

  for (const p of futures.points) {
    if (p.refStartTs < nowMs || p.refStartTs > horizonTs) continue;
    rows.push({ ts: p.refStartTs, label: fmtTs(p.refStartTs), futMean: p.meanPct, band: [p.p25Pct, p.p75Pct] });
  }
  for (const c of crowd) {
    const [y, mo] = c.ym.split("-").map(Number);
    const ts = Date.UTC(y, (mo || 1) - 1, 15);
    if (ts > horizonTs) continue;
    rows.push({ ts, label: fmtTs(ts), crowd: cur + c.cumulativeBps / 100 });
  }

  return rows.sort((a, b) => a.ts - b.ts);
}
