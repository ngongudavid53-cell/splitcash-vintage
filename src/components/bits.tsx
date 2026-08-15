import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PotIcon } from "./icons";

/** Initials-in-a-circle monogram, like a wax seal. */
export function Monogram({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  const sizes = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full border border-border bg-card font-display font-semibold text-foreground shadow-[0_1px_2px_rgba(56,43,29,0.18)]",
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/** A rubber-stamp badge: double border, small caps, ever so slightly crooked. */
export function Stamp({
  children,
  tone = "ink",
  className,
}: {
  children: ReactNode;
  tone?: "ink" | "accent" | "paid";
  className?: string;
}) {
  const tones = {
    ink: "text-foreground/70 border-foreground/40",
    accent: "text-accent border-accent/70",
    paid: "text-destructive border-destructive/70",
  };
  return (
    <span
      className={cn(
        "inline-flex rotate-[-3deg] items-center gap-1.5 border-2 px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.25em] outline outline-1 outline-offset-2 outline-current",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A dashed ruled line, optionally labelled like a ledger column header. */
export function Rule({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="h-px flex-1 border-t border-dashed border-foreground/25" />
      {label && (
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          {label}
        </span>
      )}
      <span className="h-px flex-1 border-t border-dashed border-foreground/25" />
    </div>
  );
}

/** A sheet of aged paper. */
export function Paper({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag
      className={cn(
        "paper-texture rounded-sm border border-border/80 bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_40px_-24px_rgba(56,43,29,0.4)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** The brand: a pot of coins and the wordmark. */
export function BrandMark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <PotIcon className="h-6 w-6 text-primary" strokeWidth={1.8} />
      <span
        className={cn(
          "font-display font-semibold tracking-tight text-foreground",
          compact ? "text-base" : "text-lg",
        )}
      >
        Common&nbsp;Pot
      </span>
    </span>
  );
}
