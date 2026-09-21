"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fingerprint } from "lucide-react";
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
                pathname.startsWith(n.href) ? "text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Mono className="text-[11px] tracking-[0.14em] text-warning/60">TESTNET</Mono>
          {session ? (
            <>
              <Link
                href="/me"
                className={`rounded-[8px] px-3 py-1.5 text-sm ${
                  pathname.startsWith("/me") ? "text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"
                }`}
              >
                My agents
              </Link>
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-success/40 text-success"
                title={`Session ends in ${Math.ceil(secondsLeft / 60)} min`}
              >
                <Fingerprint size={16} strokeWidth={1.5} />
              </span>
            </>
          ) : (
            <Link
              href="/me"
              className={`rounded-[8px] px-3 py-1.5 text-sm ${
                pathname.startsWith("/me") ? "text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"
              }`}
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
              pathname.startsWith(n.href) ? "text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"
            }`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
