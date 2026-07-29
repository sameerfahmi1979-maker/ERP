import { describe, it, expect } from "vitest";
import {
  extractVariableTokens,
  validateVariableAllowlist,
  findUnresolvedTokens,
  getVariableAllowlist,
} from "../variable-allowlist";

describe("variable allowlist validation", () => {
  it("extracts unique {{tokens}} with whitespace tolerance", () => {
    const src = "Dear {{employee.employee_name}}, code {{ employee.employee_code }} — {{employee.employee_name}}";
    expect(extractVariableTokens(src).sort()).toEqual([
      "employee.employee_code",
      "employee.employee_name",
    ]);
  });

  it("accepts sources whose tokens are all allowlisted", () => {
    const res = validateVariableAllowlist(
      "{{employee.employee_name}} at {{company.company_name}}",
      getVariableAllowlist("HR_EXPERIENCE_LETTER")
    );
    expect(res.ok).toBe(true);
    expect(res.disallowed).toEqual([]);
  });

  it("rejects tokens outside the per-output allowlist", () => {
    const res = validateVariableAllowlist(
      "{{employee.employee_name}} earns {{payroll.gross_salary}}",
      getVariableAllowlist("HR_EXPERIENCE_LETTER")
    );
    expect(res.ok).toBe(false);
    expect(res.disallowed).toEqual(["payroll.gross_salary"]);
  });

  it("payroll variables are allowlisted only for the salary-with-amount output", () => {
    expect(getVariableAllowlist("HR_SALARY_CERT_WITH_AMOUNT")).toContain("payroll.gross_salary");
    expect(getVariableAllowlist("HR_SALARY_CERT_GENERAL")).not.toContain("payroll.gross_salary");
  });

  it("unknown output codes get an empty allowlist (deny by default)", () => {
    const res = validateVariableAllowlist("{{a.b}}", getVariableAllowlist("UNKNOWN_OUTPUT"));
    expect(res.ok).toBe(false);
  });

  it("final HTML with unresolved tokens is flagged (issuance gate)", () => {
    expect(findUnresolvedTokens("<p>Hello John</p>")).toEqual([]);
    expect(findUnresolvedTokens("<p>Hello {{employee.employee_name}}</p>")).toEqual([
      "employee.employee_name",
    ]);
  });
});
