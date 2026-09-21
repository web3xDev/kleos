"use client";

// Docs sidebar: marks the section currently in view, and the one just
// clicked, so the reader always knows where they are.

import { useEffect, useState } from "react";
import { Label } from "@/components/ui";

export function DocsNav({ items }: { items: [string, string][] }) {
  const [active, setActive] = useState<string>(items[0]?.[0] ?? "");

  useEffect(() => {
    const sections = items.map(([id]) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;

    const pick = () => {
      // The last section whose top has passed a line 120px below the viewport top.
      const line = 120;
      let current = sections[0].id;
      for (const el of sections) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
      }
      setActive(current);
    };
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("hashchange", pick);
    return () => {
      window.removeEventListener("scroll", pick);
      window.removeEventListener("hashchange", pick);
    };
  }, [items]);

  return (
    <aside className="md:sticky md:top-24 md:self-start">
      <Label>Docs</Label>
      <ul className="mt-3 space-y-0.5 border-l border-border-subtle">
        {items.map(([id, label]) => {
          const on = active === id;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={() => setActive(id)}
                className={`-ml-px block border-l py-1 pl-3 text-sm ${
                  on ? "border-primary text-primary" : "border-transparent text-secondary hover:border-border-hover hover:text-primary"
                }`}
              >
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
