// Footer. Minimal and technical: what it is, where to go, what it is built on.

import Link from "next/link";
import { Mark } from "@/components/mark";
import { Mono } from "@/components/ui";
import { chain } from "@/lib/chain";

const links = [
  { href: "/explore", label: "Explore" },
  { href: "/try", label: "Try" },
  { href: "/docs", label: "Docs" },
  { href: "https://github.com/web3xDev/kleos", label: "GitHub", external: true },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border-subtle">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <span className="inline-flex items-center gap-2.5 text-primary">
              <Mark size={16} />
              <span className="text-sm font-semibold tracking-[0.18em]">KLEOS</span>
            </span>
            <p className="mt-3 text-sm text-secondary">Portable reputation for AI agents.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((l) =>
              l.external ? (
                <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="text-sm text-secondary hover:text-primary">
                  {l.label}
                </a>
              ) : (
                <Link key={l.href} href={l.href} className="text-sm text-secondary hover:text-primary">
                  {l.label}
                </Link>
              ),
            )}
          </nav>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-6">
          <Mono className="text-xs text-tertiary">ERC-8004 · x402 · {chain.name}</Mono>
          <span className="text-xs text-tertiary">© 2026 Kleos</span>
        </div>
      </div>
    </footer>
  );
}
