"use client";

// One quiet toast, bottom right. Used for state changes worth a sentence,
// never for decoration.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

type Toast = { id: number; title: string; body?: string };

type ToastContextValue = { notify: (title: string, body?: string, ms?: number) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 180);
  }, []);

  const notify = useCallback(
    (title: string, body?: string, ms = 8000) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: ++seq.current, title, body });
      // Next frame so the enter transition runs.
      requestAnimationFrame(() => setVisible(true));
      timer.current = setTimeout(dismiss, ms);
    },
    [dismiss],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-30 w-[calc(100%-2rem)] max-w-sm rounded-[10px] border border-border bg-surface-elevated p-4 transition-[opacity,transform] duration-[180ms] ${
            visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
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
