import { THEME_COLOURS } from "@/lib/themeColours";

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
