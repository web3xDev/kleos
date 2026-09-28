"use client";

// A row of options with one selected, where the selection is a pill that
// slides to the chosen option instead of jumping. The pill is measured from
// the active button, so labels of any width work.

import { useLayoutEffect, useRef, useState } from "react";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  label,
  className = "",
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  const buttons = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = buttons.current.get(value);
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value]);

  return (
    <div role="tablist" aria-label={label} className={`relative inline-flex gap-1 rounded-[10px] border border-border bg-surface p-1 ${className}`}>
      {pill && (
        <span
          aria-hidden
          className="absolute bottom-1 top-1 rounded-[8px] bg-surface-elevated"
          style={{ left: pill.left, width: pill.width, transition: "left 280ms cubic-bezier(0.2, 0, 0, 1), width 280ms cubic-bezier(0.2, 0, 0, 1)" }}
        />
      )}
      {options.map(([v, text]) => (
        <button
          key={v}
          ref={(el) => {
            if (el) buttons.current.set(v, el);
          }}
          role="tab"
          aria-selected={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={`relative h-9 rounded-[8px] px-3 text-sm transition-colors duration-[280ms] disabled:cursor-not-allowed ${
            value === v ? "text-primary" : "text-secondary hover:text-primary"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
