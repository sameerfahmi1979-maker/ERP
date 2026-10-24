/** F12-04: exact two-decimal salary facts, not statutory payroll calculations. */
export type SalaryComponent = {
  id?: number;
  component_type_id?: number;
  amount: number | string | null;
  is_active: boolean;
  deleted_at: string | null;
  effective_from: string;
  effective_to: string | null;
  historical_verified?: boolean;
  component_type: { component_kind: string; is_basic: boolean } | null;
};

export class SalaryUnavailable extends Error {
  constructor(message: string) { super(message); this.name = "SalaryUnavailable"; }
}

/** Only immutable rows from the applied-effects table, never pending proposals. */
export type SalaryEffect = {id: number; revision_id: number; effective_date: string; new_basic: number | string; currency: string};

export function salaryDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new SalaryUnavailable("Invalid salary date");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new SalaryUnavailable("Invalid salary date");
  return value;
}

export function payrollToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit"}).format(now);
}

/** Operational readiness only, not a determination of statutory pay entitlement. */
export function payrollEmploymentEligible(employee: {employee_status: string; joining_date: string}, asOf: string): boolean {
  salaryDate(asOf);salaryDate(employee.joining_date);
  if (!["active","on_leave","probation","inactive","suspended","terminated","archived"].includes(employee.employee_status)) throw new SalaryUnavailable("Employment context unavailable");
  return ["active","on_leave","probation"].includes(employee.employee_status) && employee.joining_date <= asOf;
}

/** Matches the existing NUMERIC(12,2) storage contract; never round input silently. */
export function salaryMinorUnits(value: number | string | null): bigint {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== "string" || !/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) throw new SalaryUnavailable("Invalid salary amount");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

export function salaryDecimal(value: bigint): string {
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  return `${sign}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}

/** Bridge for existing numeric UI contracts only; exports retain decimal strings. */
export function salaryDisplayNumber(value: string): number {
  if (!/^\d+\.\d{2}$/.test(value)) throw new SalaryUnavailable("Invalid salary total");
  const [whole, fraction] = value.split(".");
  const minor = BigInt(whole) * BigInt(100) + BigInt(fraction);
  // Above 2^45 currency units a double can merge adjacent exact cents even
  // while the integer minor-unit value itself remains a safe integer.
  if (minor >= (BigInt(2) ** BigInt(45)) * BigInt(100)) throw new SalaryUnavailable("Salary exceeds numeric display precision");
  return Number(minor) / 100;
}

export function salaryAsOf(components: readonly SalaryComponent[], asOf: string, currency: string, effects: readonly SalaryEffect[] = []) {
  salaryDate(asOf);
  // No FX conversion or arbitrary precision policy is invented. Existing storage is 2dp.
  if (!/^[A-Z]{3}$/.test(currency)) throw new SalaryUnavailable("Salary currency unavailable");
  let gross = BigInt(0), basic = BigInt(0), deductions = BigInt(0);
  const seenIds = new Set<number>(), seenTypes = new Set<number>();
  const current: SalaryComponent[] = [];
  for (const component of components) {
    if (component.deleted_at !== null) continue;
    const from = salaryDate(component.effective_from);
    const to = component.effective_to === null ? null : salaryDate(component.effective_to);
    if (to !== null && to < from) throw new SalaryUnavailable("Invalid salary interval");
    // Closed legacy intervals are not proof of approved historical pay. A native
    // immutable application ledger may explicitly verify a superseded row.
    if (from > asOf || to !== null && to < asOf || !component.is_active && to === null) continue;
    if (!component.is_active && component.historical_verified !== true) throw new SalaryUnavailable("Historical salary provenance needs review");
    if (component.id !== undefined) {
      if (!Number.isSafeInteger(component.id) || component.id <= 0 || seenIds.has(component.id)) throw new SalaryUnavailable("Ambiguous salary source");
      seenIds.add(component.id);
    }
    if (component.component_type_id !== undefined) {
      if (!Number.isSafeInteger(component.component_type_id) || component.component_type_id <= 0 || seenTypes.has(component.component_type_id)) throw new SalaryUnavailable("Overlapping salary components");
      seenTypes.add(component.component_type_id);
    }
    const type = component.component_type;
    if (!type || !["earning", "deduction"].includes(type.component_kind) || typeof type.is_basic !== "boolean" || type.is_basic && type.component_kind !== "earning") throw new SalaryUnavailable("Salary component meaning unavailable");
    const amount = salaryMinorUnits(component.amount);
    if (type.component_kind === "earning") gross += amount; else deductions += amount;
    if (type.is_basic) basic += amount;
    current.push(component);
  }
  const effectIds = new Set<number>(), dates = new Set<string>();
  let latest: SalaryEffect | undefined;
  for (const effect of effects) {
    salaryDate(effect.effective_date); salaryMinorUnits(effect.new_basic);
    if (!Number.isSafeInteger(effect.id) || effect.id <= 0 || !Number.isSafeInteger(effect.revision_id) || effect.revision_id <= 0 || effectIds.has(effect.id) || dates.has(effect.effective_date)) throw new SalaryUnavailable("Ambiguous applied salary history");
    effectIds.add(effect.id); dates.add(effect.effective_date);
    if (effect.effective_date <= asOf && (!latest || effect.effective_date > latest.effective_date)) latest = effect;
  }
  if (latest) {
    if (latest.currency !== currency) throw new SalaryUnavailable("Applied salary currency changed");
    const appliedBasic = salaryMinorUnits(latest.new_basic);
    gross = gross - basic + appliedBasic; basic = appliedBasic;
  }
  if (deductions > gross) throw new SalaryUnavailable("Salary deductions exceed earnings");
  return {asOf, currency, precision: 2 as const, basic: salaryDecimal(basic), gross: salaryDecimal(gross), deductions: salaryDecimal(deductions), net: salaryDecimal(gross - deductions), activeCount: latest && current.length === 0 ? 1 : current.length};
}
