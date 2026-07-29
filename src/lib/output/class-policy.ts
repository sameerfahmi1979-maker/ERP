/**
 * OUTPUT.1 — Document class policy resolution (pure).
 *
 * Effective policy = per-output registry override ?? class default.
 * Class defaults live in erp_output_class_policies (seeded A–G per v6.1).
 */

export type DocumentClass = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type QrPolicy = "none" | "days" | "long_term" | "valid_until_revoked";
export type DisclosureLevel = "none" | "metadata" | "download";

export interface ClassPolicyRow {
  document_class: DocumentClass;
  qr_policy: QrPolicy;
  qr_validity_days: number | null;
  approval_required: boolean;
  allow_quick_print: boolean;
  public_disclosure_level: DisclosureLevel;
  requires_serial: boolean;
  official: boolean;
}

export interface RegistryPolicyOverrides {
  document_class: DocumentClass | null;
  qr_policy_override: QrPolicy | null;
  qr_validity_days_override: number | null;
  approval_required_override: boolean | null;
  allow_quick_print_override: boolean | null;
  public_disclosure_override: DisclosureLevel | null;
}

export interface EffectiveOutputPolicy {
  documentClass: DocumentClass;
  qrPolicy: QrPolicy;
  qrValidityDays: number | null;
  approvalRequired: boolean;
  allowQuickPrint: boolean;
  publicDisclosure: DisclosureLevel;
  requiresSerial: boolean;
  official: boolean;
}

export function resolveEffectivePolicy(
  registry: RegistryPolicyOverrides,
  classDefault: ClassPolicyRow
): EffectiveOutputPolicy {
  const qrPolicy = registry.qr_policy_override ?? classDefault.qr_policy;
  return {
    documentClass: registry.document_class ?? classDefault.document_class,
    qrPolicy,
    qrValidityDays:
      qrPolicy === "days"
        ? registry.qr_validity_days_override ?? classDefault.qr_validity_days
        : null,
    approvalRequired: registry.approval_required_override ?? classDefault.approval_required,
    allowQuickPrint: registry.allow_quick_print_override ?? classDefault.allow_quick_print,
    publicDisclosure: registry.public_disclosure_override ?? classDefault.public_disclosure_level,
    requiresSerial: classDefault.requires_serial,
    official: classDefault.official,
  };
}

/** Compute expires_at for a new public link under the effective policy. */
export function computeQrExpiry(policy: EffectiveOutputPolicy, issuedAt: Date): Date | null {
  if (policy.qrPolicy === "none") {
    throw new Error("Cannot compute QR expiry: policy forbids a public QR for this output.");
  }
  if (policy.qrPolicy === "days") {
    if (!policy.qrValidityDays || policy.qrValidityDays <= 0) {
      throw new Error("QR policy 'days' requires a positive qrValidityDays.");
    }
    const d = new Date(issuedAt);
    d.setUTCDate(d.getUTCDate() + policy.qrValidityDays);
    return d;
  }
  // long_term / valid_until_revoked → no automatic expiry
  return null;
}

export function qrAllowed(policy: EffectiveOutputPolicy): boolean {
  return policy.qrPolicy !== "none";
}
