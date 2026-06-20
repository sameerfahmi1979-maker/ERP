/**
 * HR.6 — Operational Block and Assignment Status Helpers
 */

export type BlockStatus = "active" | "released" | "expired" | "cancelled";
export type AssignmentStatus = "active" | "planned" | "completed" | "cancelled";

export interface BlockStatusBadge {
  label: string;
  variant: "destructive" | "secondary" | "outline" | "default";
}

export interface AssignmentStatusBadge {
  label: string;
  variant: "destructive" | "secondary" | "outline" | "default";
}

export function getBlockStatusBadge(status: BlockStatus): BlockStatusBadge {
  switch (status) {
    case "active":
      return { label: "Active", variant: "destructive" };
    case "released":
      return { label: "Released", variant: "secondary" };
    case "expired":
      return { label: "Expired", variant: "outline" };
    case "cancelled":
      return { label: "Cancelled", variant: "outline" };
    default:
      return { label: status, variant: "outline" };
  }
}

export function getAssignmentStatusBadge(status: AssignmentStatus): AssignmentStatusBadge {
  switch (status) {
    case "active":
      return { label: "Active", variant: "default" };
    case "planned":
      return { label: "Planned", variant: "secondary" };
    case "completed":
      return { label: "Completed", variant: "outline" };
    case "cancelled":
      return { label: "Cancelled", variant: "outline" };
    default:
      return { label: status, variant: "outline" };
  }
}

export function getReadinessStatusBadge(status: string): { label: string; variant: "default" | "destructive" | "secondary" | "outline" } {
  switch (status) {
    case "ready":
      return { label: "Ready", variant: "default" };
    case "not_ready":
      return { label: "Not Ready", variant: "destructive" };
    case "blocked":
      return { label: "Blocked", variant: "destructive" };
    case "expired":
      return { label: "Expired", variant: "destructive" };
    case "needs_review":
      return { label: "Needs Review", variant: "secondary" };
    default:
      return { label: status, variant: "outline" };
  }
}

export function isActiveBlock(block: { block_status: string; effective_from: string; effective_to?: string | null }): boolean {
  if (block.block_status !== "active") return false;
  const today = new Date().toISOString().slice(0, 10);
  if (block.effective_to && block.effective_to < today) return false;
  return true;
}

export function isCurrentAssignment(assignment: {
  assignment_status: string;
  effective_from: string;
  effective_to?: string | null;
}): boolean {
  if (assignment.assignment_status !== "active") return false;
  const today = new Date().toISOString().slice(0, 10);
  if (assignment.effective_to && assignment.effective_to < today) return false;
  return true;
}
