/**
 * OUTPUT.4 — Pure helpers for the Letters & Forms experience.
 *
 * Kept out of the server-action modules so they can be unit-tested.
 */

import type { DocumentClass } from "@/lib/output/class-policy";

/** Derived user-facing status (lifecycle + revoke/supersede/expiry flags). */
export type IssuanceDisplayStatus =
  | "issued"
  | "revoked"
  | "superseded"
  | "expired"
  | "failed"
  | "in_progress"
  | "cancelled";

export function deriveIssuanceDisplayStatus(
  row: {
    lifecycle_state: string | null;
    revoked_at: string | null;
    superseded_by_id: number | null;
    expires_at: string | null;
  },
  now: Date = new Date()
): IssuanceDisplayStatus {
  if (row.revoked_at) return "revoked";
  if (row.superseded_by_id) return "superseded";
  if (row.expires_at && new Date(row.expires_at) < now) return "expired";
  switch (row.lifecycle_state) {
    case "issued":
      return "issued";
    case "failed_retryable":
    case "failed_terminal":
    case "reconciliation_required":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "in_progress";
  }
}

export type CatalogGroup = "official" | "form" | "card";

/** UI grouping bucket for a catalog entry. */
export function groupForClass(documentClass: DocumentClass, category: string): CatalogGroup {
  if (documentClass === "A" || documentClass === "B") return "official";
  if (documentClass === "D" || category === "badge") return "card";
  return "form";
}