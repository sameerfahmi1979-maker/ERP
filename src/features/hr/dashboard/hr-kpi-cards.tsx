"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Accent = "blue" | "emerald" | "amber" | "red" | "violet" | "teal" | "slate";

const ACCENT_BAR: Record<Accent, string> = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
  slate: "bg-slate-300",
};

const ACCENT_ICON: Record<Accent, string> = {
  blue: "text-blue-600",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
  violet: "text-violet-600",
  teal: "text-teal-600",
  slate: "text-slate-400",
};

export type HrKpiCard = {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  icon: LucideIcon;
  accent: Accent;
};

type Props = {
  cards: HrKpiCard[];
};

export function HrKpiCards({ cards }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const inner = (
          <>
            <span className={cn("absolute inset-y-0 left-0 w-1", ACCENT_BAR[card.accent])} />
            <div className="flex flex-1 flex-col gap-2 p-4 pl-5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </span>
                <Icon className={cn("h-4 w-4 shrink-0", ACCENT_ICON[card.accent])} />
              </div>
              <p className="text-2xl font-bold tracking-tight tabular-nums leading-none">
                {card.value}
              </p>
              {card.sub && <p className="text-[11px] text-muted-foreground/80">{card.sub}</p>}
            </div>
          </>
        );

        const className = cn(
          "group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm",
          card.href && "hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        );

        return card.href ? (
          <Link key={card.label} href={card.href} className={className}>
            {inner}
          </Link>
        ) : (
          <div key={card.label} className={className}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
