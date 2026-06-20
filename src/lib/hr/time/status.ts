/**
 * ERP HR.4 — Time Foundation Status / Badge Utilities
 */

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export type StatusBadgeConfig = {
  label: string;
  variant: BadgeVariant;
};

// ── Attendance Approval Status ─────────────────────────────────────────────────

export function getAttendanceStatusBadge(status: string): StatusBadgeConfig {
  switch (status) {
    case "approved":
      return { label: "Approved", variant: "default" };
    case "queried":
      return { label: "Queried", variant: "secondary" };
    case "pending":
    default:
      return { label: "Pending", variant: "outline" };
  }
}

// ── Leave Approval Status ──────────────────────────────────────────────────────

export function getLeaveApprovalStatusBadge(status: string): StatusBadgeConfig {
  switch (status) {
    case "approved":
      return { label: "Approved", variant: "default" };
    case "rejected":
      return { label: "Rejected", variant: "destructive" };
    case "cancelled":
      return { label: "Cancelled", variant: "outline" };
    case "pending":
    default:
      return { label: "Pending", variant: "secondary" };
  }
}

// ── Overtime Approval Status ───────────────────────────────────────────────────

export function getOvertimeApprovalStatusBadge(status: string): StatusBadgeConfig {
  switch (status) {
    case "approved":
      return { label: "Approved", variant: "default" };
    case "rejected":
      return { label: "Rejected", variant: "destructive" };
    case "cancelled":
      return { label: "Cancelled", variant: "outline" };
    case "pending":
    default:
      return { label: "Pending", variant: "secondary" };
  }
}

// ── Punch Source Label ─────────────────────────────────────────────────────────

export function getPunchSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case "biometric":  return "Biometric";
    case "mobile":     return "Mobile";
    case "manual":     return "Manual";
    case "import":     return "Import";
    default:           return source ?? "—";
  }
}

// ── Punch Type Label ───────────────────────────────────────────────────────────

export function getPunchTypeLabel(type: string): string {
  switch (type) {
    case "in":          return "In";
    case "out":         return "Out";
    case "break_start": return "Break Start";
    case "break_end":   return "Break End";
    default:            return type;
  }
}

// ── Attendance Type Label ──────────────────────────────────────────────────────

export function getAttendanceTypeLabel(type: string): string {
  switch (type) {
    case "site":      return "Site";
    case "office":    return "Office";
    case "yard":      return "Yard";
    case "workshop":  return "Workshop";
    case "remote":    return "Remote";
    case "on_leave":  return "On Leave";
    case "absent":    return "Absent";
    case "holiday":   return "Holiday";
    default:          return type;
  }
}
