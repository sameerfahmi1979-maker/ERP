// Pure regression: exact tracked server projection, synthetic values, no server/runtime import.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/master-data/party-finance-profiles", () => ({ upsertPartyFinanceProfile: vi.fn() }));
vi.mock("@/components/workspace/workspace-draft-provider", () => ({ useWorkspaceDraftStoreContext: vi.fn() }));
vi.mock("@/hooks/use-workspace-form-owner", () => ({ useWorkspaceFormOwner: vi.fn() }));
vi.mock("@/hooks/use-administration-save-session", () => ({ useAdministrationSaveSession: vi.fn() }));
import { financeReadSchema } from "@/features/master-data/parties/use-party-finance-editor";

it("accepts a valid existing finance profile with every field selected by getPartyFinanceProfile", () => {
  const source = fs.readFileSync(path.resolve("src/server/actions/master-data/party-finance-profiles.ts"), "utf8");
  const projection = source.match(/const profileFields = "([^"]+)";/)?.[1];
  expect(projection, "Bind this fixture to the actual server SELECT, not another abbreviated UI mock").toBeTruthy();
  const row = {
    id: 81, party_id: 4, workspace_revision: 3,
    default_currency_id: 1, default_payment_term_id: null, default_payment_method_id: null,
    credit_limit: 0, credit_currency_id: 1, finance_hold: false, finance_hold_reason: null,
    finance_hold_by: null, finance_hold_at: null, finance_remarks: "Synthetic saved profile",
    created_at: "2026-10-05T00:00:00.000Z", updated_at: "2026-10-05T00:00:00.000Z",
  };
  expect(Object.keys(row).sort()).toEqual(projection!.split(",").sort());
  const parsed = financeReadSchema.safeParse(row);
  expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues)).toBe(true);
  if (parsed.success) expect(parsed.data).toMatchObject({ id: 81, party_id: 4, workspace_revision: 3, credit_limit: 0, finance_hold: false });
});

// The read transport is strict before projection. These metadata fields are
// required on server rows, but must never enter the existing editor output.
const metadataKeys = ["finance_hold_by", "finance_hold_at", "created_at", "updated_at"] as const;
const editorKeys = [
  "id", "party_id", "workspace_revision", "default_currency_id", "default_payment_term_id",
  "default_payment_method_id", "credit_limit", "credit_currency_id", "finance_hold",
  "finance_hold_reason", "finance_remarks",
] as const;

function fullRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 81, party_id: 4, workspace_revision: 3,
    default_currency_id: 1, default_payment_term_id: null, default_payment_method_id: null,
    credit_limit: 0, credit_currency_id: 1, finance_hold: false, finance_hold_reason: null,
    finance_hold_by: null, finance_hold_at: null, finance_remarks: "Synthetic saved profile",
    created_at: "2026-10-05T00:00:00.000Z", updated_at: "2026-10-05T00:00:00.000Z",
    ...overrides,
  };
}

function expectEditorProjection(row: Record<string, unknown>) {
  const before = { ...row };
  const parsed = financeReadSchema.safeParse(Object.freeze(row));
  expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues)).toBe(true);
  if (!parsed.success) return;
  expect(Object.keys(parsed.data).sort()).toEqual([...editorKeys].sort());
  expect(parsed.data).toEqual(Object.fromEntries(editorKeys.map(key => [key, row[key]])));
  for (const key of metadataKeys) expect(parsed.data).not.toHaveProperty(key);
  expect(row, "Parsing/projecting must not delete or rewrite the server response").toEqual(before);
  expect(Object.keys(row)).toHaveLength(15);
}

describe("strict finance read metadata and editor projection", () => {
  it("projects the complete nullable-metadata row to exactly 11 fields, preserving false, zero and null", () => {
    expectEditorProjection(fullRow());
  });

  it("accepts a held row with a positive actor and offset/microsecond timestamps", () => {
    expectEditorProjection(fullRow({
      finance_hold: true, finance_hold_reason: "Synthetic review hold", finance_hold_by: 42,
      finance_hold_at: "2026-10-05T11:12:13.123456+04:00",
      created_at: "2026-10-04T21:02:03.987654-03:30",
      updated_at: "2026-10-05T07:12:13.123456Z",
    }));
  });

  it("accepts the existing positive-safe-integer actor boundary", () => {
    expectEditorProjection(fullRow({ finance_hold_by: Number.MAX_SAFE_INTEGER }));
  });

  it("preserves null editable values without introducing a chronology or hold-metadata relationship rule", () => {
    expectEditorProjection(fullRow({
      default_currency_id: null, credit_currency_id: null, credit_limit: null, finance_remarks: null,
      finance_hold: false, finance_hold_by: 42, finance_hold_at: null,
      created_at: "2026-10-05T12:00:00+04:00", updated_at: "2026-10-04T00:00:00Z",
    }));
  });

  it.each([
    "2026-10-05T07:12:13Z",
    "2026-10-05T07:12:13.1Z",
    "2026-10-05T07:12:13.123456Z",
    "2026-10-05T11:12:13.123456+04:00",
    "2026-10-05T03:42:13.123456-03:30",
    "2024-02-29T23:59:59.999999+00:00",
  ])("accepts valid zoned timestamp %s in all three timestamp fields", timestamp => {
    expectEditorProjection(fullRow({ finance_hold_at: timestamp, created_at: timestamp, updated_at: timestamp }));
  });

  it.each(metadataKeys)("rejects missing required transport field %s", key => {
    const row = fullRow();
    delete row[key];
    expect(financeReadSchema.safeParse(row).success).toBe(false);
  });

  it.each(metadataKeys)("rejects explicit undefined transport field %s", key => {
    expect(financeReadSchema.safeParse(fullRow({ [key]: undefined })).success).toBe(false);
  });

  it("rejects the abbreviated legacy mock with all four metadata fields missing", () => {
    const row = fullRow();
    for (const key of metadataKeys) delete row[key];
    expect(financeReadSchema.safeParse(row).success).toBe(false);
  });

  it.each([
    { label: "zero", value: 0 }, { label: "negative", value: -1 },
    { label: "fractional", value: 1.5 }, { label: "unsafe integer", value: Number.MAX_SAFE_INTEGER + 1 },
    { label: "NaN", value: Number.NaN }, { label: "infinite", value: Number.POSITIVE_INFINITY },
    { label: "numeric string", value: "42" }, { label: "boolean", value: true },
    { label: "object", value: {} },
  ])("rejects $label finance hold actor IDs without coercion", ({ value }) => {
    expect(financeReadSchema.safeParse(fullRow({ finance_hold_by: value })).success).toBe(false);
  });

  const invalidTimestamps = [
    { label: "empty", value: "" }, { label: "arbitrary text", value: "not-a-timestamp" },
    { label: "date only", value: "2026-10-05" },
    { label: "missing zone", value: "2026-10-05T07:12:13.123456" },
    { label: "non-leap February 29", value: "2026-02-29T00:00:00Z" },
    { label: "February 30", value: "2024-02-30T00:00:00Z" },
    { label: "invalid month", value: "2026-13-05T00:00:00Z" },
    { label: "zero day", value: "2026-10-00T00:00:00Z" },
    { label: "invalid hour", value: "2026-10-05T25:00:00Z" },
    { label: "invalid minute", value: "2026-10-05T07:60:00Z" },
    { label: "invalid second", value: "2026-10-05T07:12:61Z" },
    { label: "invalid zone", value: "2026-10-05T07:12:13+25:00" },
    { label: "numeric epoch", value: 1791184333000 },
    { label: "boolean", value: false }, { label: "object", value: {} },
    { label: "Date object", value: new Date("2026-10-05T07:12:13Z") },
  ];
  for (const key of ["finance_hold_at", "created_at", "updated_at"] as const) {
    it.each(invalidTimestamps)(`rejects $label ${key} without normalization or coercion`, ({ value }) => {
      expect(financeReadSchema.safeParse(fullRow({ [key]: value })).success).toBe(false);
    });
  }

  it.each(["created_at", "updated_at"])("rejects null required timestamp %s", key => {
    expect(financeReadSchema.safeParse(fullRow({ [key]: null })).success).toBe(false);
  });

  it.each(["unexpected", "updated_by", "is_admin"])("rejects unknown transport field %s before projection", key => {
    expect(financeReadSchema.safeParse(fullRow({ [key]: "must-not-be-silently-stripped" })).success).toBe(false);
  });

  it.each(["id", "party_id", "workspace_revision"])("retains required positive identity validation for %s", key => {
    const missing = fullRow();
    delete missing[key];
    expect(financeReadSchema.safeParse(missing).success).toBe(false);
    for (const value of [null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"]) {
      expect(financeReadSchema.safeParse(fullRow({ [key]: value })).success).toBe(false);
    }
  });

  it.each([
    { key: "default_currency_id", value: 0 }, { key: "default_payment_term_id", value: "1" },
    { key: "default_payment_method_id", value: -1 }, { key: "credit_currency_id", value: 1.5 },
    { key: "credit_limit", value: -1 }, { key: "credit_limit", value: "0" },
    { key: "credit_limit", value: Number.POSITIVE_INFINITY }, { key: "finance_hold", value: "false" },
    { key: "finance_hold_reason", value: 42 }, { key: "finance_remarks", value: {} },
  ])("retains existing editable-read validation for $key", ({ key, value }) => {
    expect(financeReadSchema.safeParse(fullRow({ [key]: value })).success).toBe(false);
  });
});
