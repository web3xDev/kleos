"use client";

// One quiet toast, bottom right. Used for state changes worth a sentence,
// never for decoration.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

type Toast = { id: number; title: string; body?: string };

type ToastContextValue = { notify: (title: string, body?: string, ms?: number) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

// Exit is a touch faster than enter; both only animate opacity and transform
// (compositor-only, so they stay smooth even while the page is busy).
const ENTER_MS = 320;
const EXIT_MS = 220;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const frame = useRef(0);
  const seq = useRef(0);

  const clearAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cancelAnimationFrame(frame.current);
  };
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const show = (on: boolean) => {
    visibleRef.current = on;
    setVisible(on);
  };

  const dismiss = useCallback(() => {
    clearAll();
    show(false);
    later(() => setToast(null), EXIT_MS);
  }, []);

  const notify = useCallback(
    (title: string, body?: string, ms = 8000) => {
      clearAll();
      const enter = () => {
        setToast({ id: ++seq.current, title, body });
        // Two frames: the toast is painted hidden first, so the enter transition always runs.
        frame.current = requestAnimationFrame(() => {
          frame.current = requestAnimationFrame(() => show(true));
        });
        later(dismiss, ms);
      };
      // A toast already on screen leaves first instead of swapping its text in place.
      if (visibleRef.current) {
        show(false);
        later(enter, EXIT_MS);
      } else enter();
    },
    [dismiss],
  );

  useEffect(() => clearAll, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-30 w-[calc(100%-2rem)] max-w-sm rounded-[10px] border border-border bg-surface-elevated p-4"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "none" : "translateY(12px) scale(0.98)",
            transition: visible
              ? `opacity ${ENTER_MS}ms ease-out, transform ${ENTER_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
              : `opacity ${EXIT_MS}ms ease-in, transform ${EXIT_MS}ms ease-in`,
            willChange: "opacity, transform",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-primary">{toast.title}</div>
              {toast.body && <div className="mt-1 text-sm text-secondary">{toast.body}</div>}
            </div>
            <button
              className="-m-1 rounded-[6px] p-1 text-tertiary hover:bg-surface-hover hover:text-primary"
              onClick={dismiss}
              aria-label="Dismiss"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
