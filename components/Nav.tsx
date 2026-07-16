"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Macro Signals" },
  { href: "/timeline", label: "Timeline" },
  { href: "/map", label: "Map" },
  { href: "/scenario", label: "Scenario" },
  { href: "/about", label: "About" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname?.startsWith(href);
        const isLast = href === "/about";
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              (active ? "font-medium text-[var(--text)]" : "text-muted hover:text-[var(--text)]") +
              (isLast ? " ml-auto" : "")
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
