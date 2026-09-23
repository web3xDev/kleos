"use client";

// Small primitives on top of the tokens in globals.css. See DESIGN.md.

import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "secondary" | "ghost";
  size?: "md" | "lg";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  const base =
    "group/btn inline-flex items-center justify-center gap-2 rounded-[8px] font-medium disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-[15px]" };
  const variants = {
    primary: "bg-primary text-background hover:bg-white",
    accent: "bg-accent text-white hover:bg-accent-hover",
    secondary: "border border-border bg-transparent text-primary hover:border-border-hover hover:bg-surface-hover",
    ghost: "text-secondary hover:bg-surface-hover hover:text-primary",
  };
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "h-10 w-full rounded-[8px] border border-border bg-background px-3 text-sm text-primary placeholder:text-tertiary",
        "focus:border-border-hover focus:outline-none disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}

export function Card({ className, hover, ...rest }: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cx(
        "card rounded-[10px] border border-border bg-surface",
        hover && "hover:border-border-hover hover:bg-surface-hover",
        className,
      )}
      {...rest}
    />
  );
}

type BadgeProps = { tone?: "neutral" | "success" | "error" | "warning" | "accent"; children: ReactNode; className?: string };

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  const tones = {
    neutral: "border border-border text-secondary",
    success: "bg-success-muted text-success",
    error: "bg-error-muted text-error",
    warning: "bg-warning-muted text-warning",
    accent: "bg-accent-muted text-accent-text",
  };
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function VerifiedBadge({ children = "Verified" }: { children?: ReactNode }) {
  return (
    <Badge tone="success">
      <Check size={12} strokeWidth={2} />
      {children}
    </Badge>
  );
}

export function ActiveBadge({ children = "Active" }: { children?: ReactNode }) {
  return <Badge tone="success">{children}</Badge>;
}

export function TestnetBadge() {
  return <Badge tone="warning">TESTNET</Badge>;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("label", className)}>{children}</div>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[13px]", className)}>{children}</span>;
}

/**
 * Loading placeholder that takes exactly the space of the text it stands in
 * for: same font, same line height, text made transparent. Wrap sample text
 * of the right length inside the real element so nothing shifts on load.
 */
export function Shimmer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span aria-hidden className={cx("animate-pulse select-none rounded-[4px] bg-surface-elevated text-transparent", className)}>
      {children}
    </span>
  );
}

export function shortHex(hex: string, head = 6, tail = 4): string {
  if (hex.length <= head + tail + 2) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
