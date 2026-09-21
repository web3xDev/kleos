"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";
import { Wordmark } from "@/components/mark";
import { Mono } from "@/components/ui";

const nav = [
  { href: "/explore", label: "Explore" },
  { href: "/try", label: "Try" },
  { href: "/docs", label: "Docs" },
];

export function Header() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const { session, secondsLeft } = useSession();

  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-background/85 backdrop-blur-[6px]">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 md:px-8">
        <Link href="/" aria-label="Kleos home">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-[8px] px-3 py-1.5 text-sm ${
                isActive(n.href) ? "text-primary hover:bg-surface-hover" : "text-secondary hover:bg-surface-hover hover:text-primary"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 items-center rounded-full bg-warning-muted px-2.5 font-mono text-xs text-warning">Testnet</span>
          {session ? (
            <Link
              href="/me"
              className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border px-3.5 text-sm text-primary hover:border-border-hover hover:bg-surface-hover"
              title={`Session ends in ${Math.ceil(secondsLeft / 60)} min`}
            >
              My agents
            </Link>
          ) : (
            <Link
              href="/me"
              className="inline-flex h-9 items-center rounded-[8px] border border-border px-3.5 text-sm text-primary hover:border-border-hover hover:bg-surface-hover"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-border-subtle px-3 py-1.5 md:hidden">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`shrink-0 rounded-[8px] px-3 py-1.5 text-sm ${
              isActive(n.href) ? "text-primary hover:bg-surface-hover" : "text-secondary hover:bg-surface-hover hover:text-primary"
            }`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
