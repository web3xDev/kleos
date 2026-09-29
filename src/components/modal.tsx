"use client";

// Centered dialog over a blurred page. Fades and scales in, and out again.
// Always mounted once the page is hydrated (hidden when closed), so opening
// only flips styles and the transition runs every time; mounting on open
// raced the first frame and sometimes popped in. Esc and a click on the
// backdrop close it, unless `locked` (e.g. while a transaction is in flight).
// Callers keep rendering the last content while it closes.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const DURATION = 200;

export function Modal({
  open,
  onClose,
  locked = false,
  labelledBy,
  width = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  locked?: boolean;
  labelledBy?: string;
  /** md: confirmations; xl: forms with more to read (connect a runtime). */
  width?: "md" | "xl";
  children: ReactNode;
}) {
  const [client, setClient] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one flag on mount: the portal needs document
  useEffect(() => setClient(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, locked, onClose]);

  if (!client) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      aria-hidden={!open}
      inert={!open}
      // Hidden only after the fade out has finished; shown at once when opening.
      style={{ visibility: open ? "visible" : "hidden", transition: `visibility 0s linear ${open ? 0 : DURATION}ms` }}
    >
      <div
        aria-hidden
        onClick={() => !locked && onClose()}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{ opacity: open ? 1 : 0, transition: `opacity ${DURATION}ms ease-out` }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto ${width === "xl" ? "max-w-xl" : "max-w-md"}`}
        style={{
          opacity: open ? 1 : 0,
          transform: open ? "none" : "translateY(8px) scale(0.98)",
          transition: `opacity ${DURATION}ms ease-out, transform ${DURATION}ms cubic-bezier(0.2, 0, 0, 1)`,
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
