/**
 * OUTPUT.1 — Global Output Framework lifecycle state machine.
 *
 * Canonical recoverable lifecycle (v6.1):
 *   pending → rendering → uploaded → issued
 * Controlled states:
 *   failed_retryable, failed_terminal, cancelled, reconciliation_required
 *
 * Rules encoded here (pure — no I/O):
 *  - QR activation is LAST: a public token may only be activated from `issued`.
 *  - A reserved serial is never recycled: failure paths void the serial with a
 *    reason instead of releasing it.
 *  - Retries are only legal from failed_retryable or reconciliation_required.
 *  - Nothing transitions out of failed_terminal or cancelled except audit-only
 *    reconciliation marking.
 */

export const LIFECYCLE_STATES = [
  "pending",
  "rendering",
  "uploaded",
  "issued",
  "failed_retryable",
  "failed_terminal",
  "cancelled",
  "reconciliation_required",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/** Allowed transitions. Key = from, values = legal targets. */
const TRANSITIONS: Record<LifecycleState, readonly LifecycleState[]> = {
  pending: ["rendering", "failed_retryable", "failed_terminal", "cancelled"],
  rendering: ["uploaded", "failed_retryable", "failed_terminal", "cancelled"],
  uploaded: ["issued", "failed_retryable", "reconciliation_required", "cancelled"],
  issued: [], // terminal-success; revoke/expire/supersede are flags, not lifecycle states
  failed_retryable: ["rendering", "failed_terminal", "cancelled", "reconciliation_required"],
  failed_terminal: [],
  cancelled: [],
  reconciliation_required: ["issued", "failed_terminal", "cancelled"],
};

export function isLifecycleState(value: unknown): value is LifecycleState {
  return typeof value === "string" && (LIFECYCLE_STATES as readonly string[]).includes(value);
}

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: LifecycleState, to: LifecycleState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal output lifecycle transition: ${from} → ${to}`);
  }
}

/** States from which an automatic or operator retry is permitted. */
export function isRetryable(state: LifecycleState): boolean {
  return state === "failed_retryable" || state === "reconciliation_required";
}

/** States in which the record is finished and must never be mutated again. */
export function isTerminal(state: LifecycleState): boolean {
  return state === "issued" || state === "failed_terminal" || state === "cancelled";
}

/** QR activation is only legal once the issuance reached `issued`. */
export function canActivatePublicToken(state: LifecycleState): boolean {
  return state === "issued";
}

/**
 * Serial handling on failure: a reserved serial is NEVER released for reuse.
 * Returns the serial_status that must be written for the given lifecycle move.
 */
export function serialStatusOnTransition(
  to: LifecycleState,
  hasSerial: boolean
): "issued" | "voided" | "reserved" | null {
  if (!hasSerial) return null;
  if (to === "issued") return "issued";
  if (to === "failed_terminal" || to === "cancelled") return "voided";
  return "reserved";
}

/** Stage-timestamp column touched by each transition target. */
export function stageTimestampColumn(to: LifecycleState):
  | "rendering_started_at"
  | "uploaded_at"
  | "issued_at"
  | "failed_at"
  | "cancelled_at"
  | "reconciled_at"
  | null {
  switch (to) {
    case "rendering":
      return "rendering_started_at";
    case "uploaded":
      return "uploaded_at";
    case "issued":
      return "issued_at";
    case "failed_retryable":
    case "failed_terminal":
      return "failed_at";
    case "cancelled":
      return "cancelled_at";
    case "reconciliation_required":
      return "reconciled_at";
    default:
      return null;
  }
}
