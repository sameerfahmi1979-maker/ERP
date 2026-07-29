import { describe, it, expect } from "vitest";
import {
  resolveEffectivePolicy,
  computeQrExpiry,
  qrAllowed,
  type ClassPolicyRow,
  type RegistryPolicyOverrides,
} from "../class-policy";

const CLASS_A: ClassPolicyRow = {
  document_class: "A",
  qr_policy: "days",
  qr_validity_days: 90,
  approval_required: true,
  allow_quick_print: true,
  public_disclosure_level: "metadata",
  requires_serial: true,
  official: true,
};

const CLASS_B: ClassPolicyRow = {
  document_class: "B",
  qr_policy: "valid_until_revoked",
  qr_validity_days: null,
  approval_required: false,
  allow_quick_print: true,
  public_disclosure_level: "metadata",
  requires_serial: true,
  official: true,
};

const CLASS_G: ClassPolicyRow = {
  document_class: "G",
  qr_policy: "none",
  qr_validity_days: null,
  approval_required: false,
  allow_quick_print: false,
  public_disclosure_level: "none",
  requires_serial: false,
  official: false,
};

const NO_OVERRIDES: RegistryPolicyOverrides = {
  document_class: null,
  qr_policy_override: null,
  qr_validity_days_override: null,
  approval_required_override: null,
  allow_quick_print_override: null,
  public_disclosure_override: null,
};

describe("class policy resolution", () => {
  it("class A default: 90-day QR + approval required (v6.1)", () => {
    const p = resolveEffectivePolicy(NO_OVERRIDES, CLASS_A);
    expect(p.qrPolicy).toBe("days");
    expect(p.qrValidityDays).toBe(90);
    expect(p.approvalRequired).toBe(true);
    expect(p.requiresSerial).toBe(true);
  });

  it("class B default: valid-until-revoked, no expiry", () => {
    const p = resolveEffectivePolicy(NO_OVERRIDES, CLASS_B);
    expect(p.qrPolicy).toBe("valid_until_revoked");
    expect(p.qrValidityDays).toBeNull();
    expect(computeQrExpiry(p, new Date())).toBeNull();
  });

  it("registry override wins over class default (stricter template policy)", () => {
    const p = resolveEffectivePolicy(
      { ...NO_OVERRIDES, qr_validity_days_override: 30, approval_required_override: true },
      CLASS_A
    );
    expect(p.qrValidityDays).toBe(30);
    expect(p.approvalRequired).toBe(true);
  });

  it("computes day-based expiry from issuance date", () => {
    const p = resolveEffectivePolicy(NO_OVERRIDES, CLASS_A);
    const issued = new Date("2026-07-26T10:00:00Z");
    const exp = computeQrExpiry(p, issued);
    expect(exp?.toISOString().slice(0, 10)).toBe("2026-10-24");
  });

  it("class G (AI draft): no QR at all", () => {
    const p = resolveEffectivePolicy(NO_OVERRIDES, CLASS_G);
    expect(qrAllowed(p)).toBe(false);
    expect(() => computeQrExpiry(p, new Date())).toThrow(/forbids/);
    expect(p.allowQuickPrint).toBe(false);
    expect(p.official).toBe(false);
  });

  it("qr policy 'days' without validity days is rejected", () => {
    const broken = resolveEffectivePolicy(
      { ...NO_OVERRIDES, qr_policy_override: "days" },
      { ...CLASS_B, qr_validity_days: null }
    );
    expect(() => computeQrExpiry(broken, new Date())).toThrow(/positive/);
  });
});
