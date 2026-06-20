/**
 * ERP HR.3 — Compliance Expiry and Status Utilities
 *
 * Pure, side-effect-free helpers for computing expiry state and badge variants
 * for compliance child records (identity docs, medical insurance, access cards,
 * training certificates, medical records).
 *
 * Default expiring-soon threshold: 60 days.
 */

export type ExpiryStatus =
  | "no_expiry"
  | "valid"
  | "expiring_soon"
  | "expired"
  | "missing";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "danger"
  | "muted";

export type StatusBadgeConfig = {
  label: string;
  variant: BadgeVariant;
};

// ── Expiry Status ─────────────────────────────────────────────────────────────

/**
 * Returns expiry status relative to today.
 * @param expiryDate ISO date string or null
 * @param thresholdDays Days before expiry considered "expiring soon" (default 60)
 */
export function getExpiryStatus(
  expiryDate: string | Date | null | undefined,
  thresholdDays = 60
): ExpiryStatus {
  if (!expiryDate) return "no_expiry";

  const expiry = typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate;
  if (isNaN(expiry.getTime())) return "missing";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "expired";
  if (diffDays <= thresholdDays) return "expiring_soon";
  return "valid";
}

/**
 * Returns days until expiry (negative = already expired).
 */
export function getDaysUntilExpiry(
  expiryDate: string | Date | null | undefined
): number | null {
  if (!expiryDate) return null;
  const expiry = typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate;
  if (isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = expiry.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ── Badge Configs ─────────────────────────────────────────────────────────────

export function getExpiryStatusBadge(status: ExpiryStatus): StatusBadgeConfig {
  switch (status) {
    case "valid":         return { label: "Valid",           variant: "success" };
    case "expiring_soon": return { label: "Expiring Soon",   variant: "warning" };
    case "expired":       return { label: "Expired",         variant: "destructive" };
    case "no_expiry":     return { label: "No Expiry",       variant: "secondary" };
    case "missing":       return { label: "Missing",         variant: "destructive" };
  }
}

export function getComplianceStatusBadge(status: string | null | undefined): StatusBadgeConfig {
  switch (status) {
    case "active":    return { label: "Active",    variant: "success" };
    case "valid":     return { label: "Valid",     variant: "success" };
    case "expired":   return { label: "Expired",   variant: "destructive" };
    case "cancelled": return { label: "Cancelled", variant: "muted" };
    case "pending":   return { label: "Pending",   variant: "warning" };
    case "suspended": return { label: "Suspended", variant: "danger" };
    case "in_application": return { label: "In Application", variant: "secondary" };
    case "in_progress": return { label: "In Progress", variant: "warning" };
    default:          return { label: status ?? "Unknown", variant: "outline" };
  }
}

export function getVerificationStatusBadge(status: string | null | undefined): StatusBadgeConfig {
  switch (status) {
    case "verified":   return { label: "Verified",   variant: "success" };
    case "unverified": return { label: "Unverified", variant: "secondary" };
    case "failed":     return { label: "Failed",     variant: "destructive" };
    default:           return { label: "Unknown",    variant: "outline" };
  }
}

export function getRenewalStatusBadge(status: string | null | undefined): StatusBadgeConfig {
  switch (status) {
    case "not_required": return { label: "Not Required", variant: "muted" };
    case "pending":      return { label: "Pending",      variant: "warning" };
    case "in_progress":  return { label: "In Progress",  variant: "secondary" };
    case "complete":     return { label: "Complete",     variant: "success" };
    default:             return { label: "Unknown",      variant: "outline" };
  }
}

export function getMedicalResultBadge(result: string | null | undefined): StatusBadgeConfig {
  switch (result) {
    case "fit":               return { label: "Fit",               variant: "success" };
    case "unfit":             return { label: "Unfit",             variant: "destructive" };
    case "conditionally_fit": return { label: "Conditionally Fit", variant: "warning" };
    case "under_review":      return { label: "Under Review",      variant: "secondary" };
    default:                  return { label: "Unknown",            variant: "outline" };
  }
}

// ── Compliance Summary Types ──────────────────────────────────────────────────

export type ComplianceSectionSummary = {
  total: number;
  active: number;
  expiringSoon: number;
  expired: number;
};

/**
 * Compute a summary from a list of records that have expiry_date and status fields.
 */
export function computeComplianceSummary(
  rows: Array<{ expiry_date?: string | null; status?: string | null }>,
  thresholdDays = 60
): ComplianceSectionSummary {
  const total = rows.length;
  let active = 0;
  let expiringSoon = 0;
  let expired = 0;

  for (const row of rows) {
    const st = row.status;
    if (st === "expired") {
      expired++;
      continue;
    }
    if (st === "active" || st === "valid") {
      const expiryStatus = getExpiryStatus(row.expiry_date, thresholdDays);
      if (expiryStatus === "expired") {
        expired++;
      } else if (expiryStatus === "expiring_soon") {
        expiringSoon++;
        active++;
      } else {
        active++;
      }
    }
  }

  return { total, active, expiringSoon, expired };
}
