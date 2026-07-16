const THEME_COLOURS: Record<string, string> = {
  "Rates/Fed": "#4c9be8", Inflation: "#f97316", "Growth/Recession": "#22c55e",
  "Commodities/Oil": "#eab308", Geopolitics: "#ef4444", "Elections/Politics": "#b39ddb",
};

export function ThemeChip({ theme, active = true, onClick }: { theme: string; active?: boolean; onClick?: () => void }) {
  const c = THEME_COLOURS[theme] ?? "#4c9be8";
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${active ? "text-[var(--text)]" : "text-muted"}`}
      style={{ borderColor: c, backgroundColor: active ? `${c}22` : "transparent" }}
    >
      {theme}
    </button>
  );
}
