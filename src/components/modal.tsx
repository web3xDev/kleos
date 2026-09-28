"use client";

// Centered dialog over a blurred page. Fades and scales in, and out again
// (it stays mounted for the closing animation). Esc and a click on the
// backdrop close it, unless `locked` (e.g. while a transaction is in flight).

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const DURATION = 200;

export function Modal({
  open,
  onClose,
  locked = false,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  locked?: boolean;
  labelledBy?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  // Mount, then flip to visible on the next frame so the enter transition runs;
  // on close, fade out first and unmount after the transition.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(r);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), DURATION);
    return () => clearTimeout(t);
  }, [open]);

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

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        aria-hidden
        onClick={() => !locked && onClose()}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{ opacity: visible ? 1 : 0, transition: `opacity ${DURATION}ms ease-out` }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative w-full max-w-md"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "none" : "translateY(8px) scale(0.98)",
          transition: `opacity ${DURATION}ms ease-out, transform ${DURATION}ms cubic-bezier(0.2, 0, 0, 1)`,
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
