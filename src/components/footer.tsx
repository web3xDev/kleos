// Footer. Brand, grouped links and the contracts everything is read from,
// each linked to the explorer so the claims on the site can be checked.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Wordmark } from "@/components/mark";
import { Mono } from "@/components/ui";
import { addresses, chain } from "@/lib/chain";

type FooterLink = { href: string; label: string; external?: boolean; address?: string };

const explorer = chain.blockExplorers.default.url;
// Local copy: shortHex in ui.tsx is client-only and this is a server component.
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/explore", label: "Explore agents" },
      { href: "/try", label: "Try it" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/api/agents", label: "Public API", external: true },
      { href: "https://github.com/web3xDev/kleos", label: "GitHub", external: true },
    ],
  },
  {
    title: "Contracts",
    links: [
      { href: `${explorer}/address/${addresses.identityRegistry}`, label: "Identity Registry", address: short(addresses.identityRegistry), external: true },
      { href: `${explorer}/address/${addresses.kleosStamps}`, label: "KleosStamps", address: short(addresses.kleosStamps), external: true },
      { href: `${explorer}/address/${addresses.kleosCredit}`, label: "KleosCredit", address: short(addresses.kleosCredit), external: true },
    ],
  },
];

function FooterItem({ l }: { l: FooterLink }) {
  const cls = "group inline-flex items-center gap-1.5 text-sm text-secondary transition-colors duration-[180ms] hover:text-primary";
  const body = (
    <>
      {l.label}
      {l.address && <Mono className="text-xs text-tertiary group-hover:text-secondary">{l.address}</Mono>}
      {l.external && <ArrowUpRight size={12} strokeWidth={1.5} className="text-tertiary group-hover:text-primary" />}
    </>
  );
  return l.external ? (
    <a href={l.href} target="_blank" rel="noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <Link href={l.href} className={cls}>
      {body}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-border-subtle bg-background">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-8 pt-12 md:px-8">
        {/* Mobile: brand on top, Product and Developers side by side, Contracts (long rows) full width.
            Desktop: brand plus three columns in one row. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-10">
          <div className="col-span-2 max-w-xs md:col-span-1">
            <Link href="/" className="inline-flex">
              <Wordmark />
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-secondary">
              Portable reputation for AI agents. Every record is settled onchain and verifiable by anyone.
            </p>
          </div>
          {columns.map((c) => (
            <div key={c.title} className={c.title === "Contracts" ? "col-span-2 md:col-span-1" : ""}>
              <Mono className="text-[11px] tracking-[0.14em] text-tertiary">{c.title.toUpperCase()}</Mono>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <FooterItem l={l} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 md:mt-20">
          <span className="text-xs text-tertiary">© 2026 Kleos</span>
          <Mono className="text-xs text-tertiary">Built on ERC-8004 · x402 · {chain.name}</Mono>
        </div>
      </div>
    </footer>
  );
}
