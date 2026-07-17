"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/timeline", label: "Timeline" },
  { href: "/map", label: "Map" },
  { href: "/scenario", label: "Scenario" },
  { href: "/cross-venue", label: "Cross-Venue" },
  { href: "/about", label: "About" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      <Link
        href="/"
        className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-[var(--text)]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="0" y="8" width="3" height="6" rx="0.5" fill="#4c9be8" />
          <rect x="5.5" y="4" width="3" height="10" rx="0.5" fill="#4c9be8" />
          <rect x="11" y="0" width="3" height="14" rx="0.5" fill="#4c9be8" />
        </svg>
        Macro Signals
      </Link>
      {LINKS.map(({ href, label }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              "text-[13px] tracking-[0.01em] " +
              (active
                ? "border-b-2 border-accent pb-0.5 text-[var(--text)]"
                : "text-muted hover:text-[var(--text)]")
            }
          >
            {label}
          </Link>
        );
      })}
      <span className="ml-auto flex items-center gap-2 text-[13px] text-muted">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        Live
      </span>
    </nav>
  );
}
