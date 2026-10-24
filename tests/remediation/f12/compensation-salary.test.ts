import {describe, expect, it} from "vitest";
import {payrollToday, salaryAsOf, salaryDate, salaryDecimal, salaryMinorUnits, type SalaryComponent} from "@/lib/hr/payroll/salary-as-of";

const row = (extra: Partial<SalaryComponent> = {}): SalaryComponent => ({id: 1, component_type_id: 1, amount: "1000.00", is_active: true, deleted_at: null, effective_from: "2026-10-01", effective_to: null, component_type: {component_kind: "earning", is_basic: true}, ...extra});
const asOf = (rows: SalaryComponent[], date = "2026-10-23", currency = "AED") => salaryAsOf(rows, date, currency);

describe("F12-04 exact salary-as-of contract", () => {
  it("uses Dubai calendar date at the UTC day boundary", () => expect(payrollToday(new Date("2026-10-22T20:00:00Z"))).toBe("2026-10-23"));
  it("keeps the previous Dubai date before midnight", () => expect(payrollToday(new Date("2026-10-22T19:59:59Z"))).toBe("2026-10-22"));
  it.each(["", "2026-02-29", "2026-13-01", "2026-10-32", "2026-1-01", "2026-10-23T00:00:00Z"])("rejects non-calendar date %s", value => expect(() => salaryDate(value)).toThrow());
  it("accepts leap-year dates", () => expect(salaryDate("2028-02-29")).toBe("2028-02-29"));
  it.each([null, -1, NaN, Infinity, "-0.01", "1.001", "1e3", " 1.00", "1.", "10000000000.00"])("rejects malformed/unsupported amount %s", value => expect(() => salaryMinorUnits(value)).toThrow());
  it.each([[0, "0.00"], ["0.1", "0.10"], ["9999999999.99", "9999999999.99"], ["0001.01", "1.01"]] as const)("preserves exact amount %s", (value, decimal) => expect(salaryDecimal(salaryMinorUnits(value))).toBe(decimal));
  it("adds 0.10 and 0.20 without floating arithmetic", () => {
    const result = asOf([row({amount: 0.1}), row({id: 2, component_type_id: 2, amount: 0.2})]);
    expect(result.gross).toBe("0.30"); expect(result.basic).toBe("0.30");
  });
  it("keeps earnings, deductions and net distinct", () => {
    const result = asOf([row(), row({id: 2, component_type_id: 2, amount: "150.01", component_type: {component_kind: "deduction", is_basic: false}})]);
    expect(result).toMatchObject({basic: "1000.00", gross: "1000.00", deductions: "150.01", net: "849.99", activeCount: 2});
  });
  it("does not invent a negative-net policy", () => expect(() => asOf([row(), row({id: 2, component_type_id: 2, amount: "1001.00", component_type: {component_kind: "deduction", is_basic: false}})])).toThrow());
  it("does not use future components", () => expect(asOf([row({effective_from: "2026-10-24"})]).gross).toBe("0.00"));
  it("starts exactly on the effective date", () => expect(asOf([row()], "2026-10-01").gross).toBe("1000.00"));
  it("includes the entire last effective date", () => expect(asOf([row({effective_to: "2026-10-23"})]).gross).toBe("1000.00"));
  it("excludes the day after the interval", () => expect(asOf([row({effective_to: "2026-10-22"})]).gross).toBe("0.00"));
  it("excludes deleted and undated inactive rows", () => expect(asOf([row({deleted_at: "2026-10-02"}), row({id: 2, component_type_id: 2, is_active: false})]).activeCount).toBe(0));
  it("does not guess inactive historical provenance", () => expect(() => asOf([row({is_active: false, effective_to: "2026-10-23"})])).toThrow("Historical"));
  it("uses explicitly verified superseded history", () => expect(asOf([row({is_active: false, effective_to: "2026-10-23", historical_verified: true})]).gross).toBe("1000.00"));
  it("rejects reversed intervals", () => expect(() => asOf([row({effective_to: "2026-09-30"})])).toThrow());
  it("rejects duplicate identities", () => expect(() => asOf([row(), row({component_type_id: 2})])).toThrow("Ambiguous"));
  it("rejects overlapping same-type amounts rather than summing twice", () => expect(() => asOf([row(), row({id: 2})])).toThrow("Overlapping"));
  it("supports a contiguous replacement without rewriting history", () => {
    const rows = [row({effective_to: "2026-10-22", is_active: false, historical_verified: true}), row({id: 2, amount: "1200.00", effective_from: "2026-10-23"})];
    const original = JSON.stringify(rows);
    expect(asOf(rows, "2026-10-22").basic).toBe("1000.00"); expect(asOf(rows).basic).toBe("1200.00"); expect(JSON.stringify(rows)).toBe(original);
  });
  it.each([null, {component_kind: "unknown", is_basic: false}, {component_kind: "deduction", is_basic: true}])("fails closed on missing or inconsistent component meaning", type => expect(() => asOf([row({component_type: type})])).toThrow());
  it.each(["", "aed", "US", "DOLLAR"])("does not silently replace missing/invalid currency %s", currency => expect(() => asOf([row()], "2026-10-23", currency)).toThrow());
  it("preserves nondefault currency without FX or new rounding rules", () => expect(asOf([row({amount: "1000.01"})], "2026-10-23", "USD")).toMatchObject({currency: "USD", precision: 2, gross: "1000.01"}));
  it("retains exact totals beyond the binary-number minor-unit limit", () => {
    const rows = Array.from({length: 10000}, (_, i) => row({id: i + 1, component_type_id: i + 1, amount: "9999999999.99"}));
    expect(asOf(rows).gross).toBe("99999999999900.00");
  });
});
