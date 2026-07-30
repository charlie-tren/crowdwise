"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/map", label: "Map" },
  { href: "/scenario", label: "Scenario" },
  { href: "/cross-venue", label: "Compare" },
  { href: "/value", label: "Value" },
  { href: "/timeline", label: "Timeline" },
  { href: "/about", label: "About" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      <Link
        href="/"
        className="mr-2 flex items-center gap-2.5 text-[22px] font-semibold tracking-[-0.015em] text-[var(--text)]"
      >
        <svg width="28" height="28" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="10" cy="10" r="8.2" stroke="#2f5a86" strokeWidth="1" />
          <circle cx="10" cy="10" r="4.6" stroke="#2f5a86" strokeWidth="0.9" />
          <path d="M10 10 L15.8 4.2 A8.2 8.2 0 0 1 18.2 8.4 Z" fill="#4c9be8" fillOpacity="0.28" />
          <line x1="10" y1="10" x2="15.8" y2="4.2" stroke="#4c9be8" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="13.5" cy="5.2" r="1.6" fill="#fbbf24" />
          <circle cx="10" cy="10" r="1.4" fill="#4c9be8" />
        </svg>
        Crowdwise
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
      <div className="ml-auto flex items-center gap-3">
        <a
          href="https://charlie-tren.github.io/"
          className="rounded-full border border-white/10 px-2.5 py-1 text-[12px] text-muted transition-colors hover:border-white/25 hover:text-[var(--text)]"
        >
          More from Charlie ↗
        </a>
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <span className="h-1.5 w-1.5 animate-softpulse rounded-full bg-accent" />
          Live
        </span>
      </div>
    </nav>
  );
}
