"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fingerprint, Menu, X } from "lucide-react";
import { useSession } from "@/lib/session";
import { Wordmark } from "@/components/mark";

const nav = [
  { href: "/explore", label: "Explore" },
  { href: "/try", label: "Try" },
  { href: "/docs", label: "Docs" },
];

export function Header() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const { session, secondsLeft } = useSession();
  const [drawer, setDrawer] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle bg-background/85 backdrop-blur-[6px]">
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
                isActive(n.href) ? "bg-surface-elevated text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 items-center rounded-full bg-warning-muted px-2.5 font-mono text-xs text-warning">Testnet</span>
          {/* Mobile: the menu opens a drawer with the nav and the session link */}
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            aria-expanded={drawer}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-border text-primary hover:border-border-hover hover:bg-surface-hover md:hidden"
          >
            <Menu size={18} strokeWidth={1.5} />
          </button>
          {session ? (
            <Link
              href="/me"
              className="hidden h-9 items-center gap-2 rounded-[8px] border border-border px-3.5 text-sm text-primary hover:border-border-hover hover:bg-surface-hover md:inline-flex"
              title={`Session ends in ${Math.ceil(secondsLeft / 60)} min`}
            >
              My agents
              {/* green = a live passkey session (a real state, per the color rule) */}
              <Fingerprint size={14} strokeWidth={1.5} className="text-success" />
            </Link>
          ) : (
            <Link
              href="/me"
              className="hidden h-9 items-center gap-2 rounded-[8px] border border-border px-3.5 text-sm text-primary hover:border-border-hover hover:bg-surface-hover md:inline-flex"
            >
              Sign in
              {/* white until a session exists; turns green on My agents */}
              <Fingerprint size={14} strokeWidth={1.5} />
            </Link>
          )}
        </div>
      </div>
      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} isActive={isActive} signedIn={Boolean(session)} />
    </header>
  );
}

// Mobile navigation: a panel sliding in from the right over a blurred page.
// Portaled to <body>: the sticky header's backdrop blur would otherwise trap a
// fixed-position child inside the header's box. Always mounted (hidden when
// closed), so opening only flips styles and the slide runs every time; mounting
// on open raced the first frame and sometimes popped in.
function MobileDrawer({
  open,
  onClose,
  isActive,
  signedIn,
}: {
  open: boolean;
  onClose: () => void;
  isActive: (href: string) => boolean;
  signedIn: boolean;
}) {
  // The portal needs document; render it once the page is hydrated, then keep it.
  const [client, setClient] = useState(false);
  useEffect(() => setClient(true), []);
  const visible = open;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!client) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] overflow-hidden md:hidden"
      aria-hidden={!visible}
      inert={!visible}
      // Hidden only after the slide out has finished; shown at once when opening.
      style={{ visibility: visible ? "visible" : "hidden", transition: `visibility 0s linear ${visible ? 0 : 260}ms` }}
    >
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 220ms ease-out" }}
      />
      <nav
        aria-label="Menu"
        className="absolute bottom-0 right-0 top-0 flex w-[min(320px,85vw)] flex-col border-l border-border bg-background p-4"
        style={{ transform: visible ? "none" : "translateX(100%)", transition: "transform 260ms cubic-bezier(0.2, 0, 0, 1)" }}
      >
        <div className="flex items-center justify-between">
          <Link href="/" onClick={onClose} aria-label="Kleos home">
            <Wordmark />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-secondary hover:bg-surface-hover hover:text-primary"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <ul className="mt-8 space-y-1">
          {nav.map((n) => (
            <li key={n.href}>
              <Link
                href={n.href}
                onClick={onClose}
                className={`flex h-12 items-center rounded-[8px] px-3 text-base ${
                  isActive(n.href) ? "bg-surface-elevated text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"
                }`}
              >
                {n.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-auto border-t border-border-subtle pt-4">
          <Link
            href="/me"
            onClick={onClose}
            className="flex h-12 items-center justify-center gap-2 rounded-[8px] border border-border text-sm text-primary hover:border-border-hover hover:bg-surface-hover"
          >
            {signedIn ? "My agents" : "Sign in"}
            <Fingerprint size={16} strokeWidth={1.5} className={signedIn ? "text-success" : ""} />
          </Link>
        </div>
      </nav>
    </div>,
    document.body,
  );
}
