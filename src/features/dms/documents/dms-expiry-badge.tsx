"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO } from "date-fns";

export type ExpiryState = "expired" | "expiring_7" | "expiring_30" | "valid" | "no_expiry";

export function getExpiryState(expiryDate: string | null): ExpiryState {
  if (!expiryDate) return "no_expiry";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = parseISO(expiryDate);
  const days = differenceInDays(expiry, today);
  if (days < 0) return "expired";
  if (days <= 7) return "expiring_7";
  if (days <= 30) return "expiring_30";
  return "valid";
}

export function getDaysRemaining(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return differenceInDays(parseISO(expiryDate), today);
}

const EXPIRY_STYLES: Record<ExpiryState, string> = {
  expired: "bg-red-100 text-red-700 border-red-200",
  expiring_7: "bg-orange-100 text-orange-700 border-orange-200",
  expiring_30: "bg-amber-100 text-amber-700 border-amber-200",
  valid: "bg-green-50 text-green-700 border-green-200",
  no_expiry: "bg-slate-50 text-slate-500 border-slate-200",
};

const EXPIRY_LABELS: Record<ExpiryState, string> = {
  expired: "Expired",
  expiring_7: "Expiring ≤ 7 days",
  expiring_30: "Expiring ≤ 30 days",
  valid: "Valid",
  no_expiry: "No Expiry",
};

interface DmsExpiryBadgeProps {
  expiryDate: string | null;
  className?: string;
}

export function DmsExpiryBadge({ expiryDate, className }: DmsExpiryBadgeProps) {
  const state = getExpiryState(expiryDate);
  const style = EXPIRY_STYLES[state];
  const label = EXPIRY_LABELS[state];

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium px-1.5 py-0.5 border", style, className)}
    >
      {label}
    </Badge>
  );
}
