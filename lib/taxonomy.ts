export const CATEGORIES = [
  "Rates/Fed", "Inflation", "Growth/Recession",
  "Commodities/Oil", "Geopolitics", "Elections/Politics",
] as const;

export type Category = (typeof CATEGORIES)[number] | "Other";

export const KALSHI_MACRO_SERIES: Record<string, (typeof CATEGORIES)[number]> = {
  KXFED: "Rates/Fed", KXFEDDECISION: "Rates/Fed", KXRATECUT: "Rates/Fed",
  KXFEDMEET: "Rates/Fed", KXCBRATEHIKE: "Rates/Fed", KXUST10: "Rates/Fed",
  KX10Y2Y: "Rates/Fed", KX3MTBILL: "Rates/Fed",
  KXCPIYOY: "Inflation",
  KXNBERRECESSQ: "Growth/Recession", KXGDP: "Growth/Recession", KXU3: "Growth/Recession",
  KXISMPMI: "Growth/Recession", KXPAYROLLS: "Growth/Recession", KXCHGDPYOY: "Growth/Recession",
  KXEFFTARIFF: "Growth/Recession",
  KXWTI: "Commodities/Oil", KXBARRELS: "Commodities/Oil",
};

// [theme, prefixes] - series-ticker prefix fallback (checked before title keywords)
export const SERIES_PREFIX: [(typeof CATEGORIES)[number], string[]][] = [
  ["Rates/Fed", ["KXFED", "FED", "FOMC", "KXRATE", "KXUST", "KX10Y", "KX3M"]],
  ["Inflation", ["KXCPI", "CPI", "KXPCE", "PCE", "KXINFL"]],
  ["Growth/Recession", ["KXGDP", "GDP", "KXNBER", "WRECSS", "KXU3", "KXPAYROLL", "KXISM", "KXNFP"]],
  ["Commodities/Oil", ["KXWTI", "KXOIL", "KXBRENT", "KXBARREL", "KXOPEC", "KXGOLD"]],
];

// [theme, keywords] - matched as word-boundary regex, first match wins.
export const THEME_KEYWORDS: [(typeof CATEGORIES)[number], string[]][] = [
  ["Rates/Fed", ["fed", "fomc", "powell", "interest rate", "interest rates", "rate cut",
    "rate cuts", "rate hike", "rate hikes", "rate decision", "federal funds",
    "basis point", "basis points", "bps", "treasury yield", "treasury spread",
    "yield curve", "rate by"]],
  ["Inflation", ["inflation", "disinflation", "deflation", "cpi", "pce", "core pce", "price index"]],
  ["Growth/Recession", ["recession", "gdp", "unemployment", "jobs report", "nonfarm", "non-farm",
    "payroll", "payrolls", "jobless", "economic growth", "soft landing", "hard landing",
    "pmi", "tariff", "tariffs"]],
  ["Commodities/Oil", ["oil", "crude", "wti", "brent", "opec", "gasoline", "natural gas",
    "gold", "silver", "barrel", "barrels"]],
  ["Geopolitics", ["war", "invade", "invasion", "ceasefire", "nuclear", "military", "russia",
    "ukraine", "taiwan", "iran", "israel", "gaza", "nato", "sanctions", "missile",
    "north korea", "venezuela", "hamas", "hezbollah"]],
  ["Elections/Politics", ["election", "elections", "president", "presidential", "senate",
    "congress", "congressional", "governor", "primary", "nominee", "impeach", "impeachment",
    "shutdown", "supreme court", "prime minister", "parliament", "cabinet", "speaker",
    "referendum", "chancellor", "midterm", "midterms"]],
];
