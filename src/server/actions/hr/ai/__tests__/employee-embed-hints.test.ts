/**
 * WP1 regression guard — ambiguous owner_companies embeds.
 *
 * `employees` has TWO foreign keys to `owner_companies`
 * (`employees_owner_company_id_fkey` and `employees_sponsor_company_id_fkey`).
 * Any PostgREST embed of `owner_companies` sourced from `employees` that omits
 * an explicit FK hint fails at runtime with PGRST201 ("more than one
 * relationship was found") — which historically surfaced to users as the
 * misleading "Employee not found" error in the HR AI panel and silently broke
 * 16 HR analytical report fetchers.
 *
 * This test statically scans the affected server-action directories and fails
 * if an un-hinted `owner_company:owner_companies(` embed reappears.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SCAN_DIRS = [
  "src/server/actions/reports/hr",
  "src/server/actions/hr/ai",
];

// Files whose query source table is NOT `employees` (single-FK sources are
// legitimately un-hinted). Keep this list explicit and short.
const NON_EMPLOYEE_SOURCE_FILES = new Set([
  "requisitions-report.ts", // sourced from hr_job_requisitions (single FK)
]);

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("employees → owner_companies embeds carry explicit FK hints", () => {
  const files = SCAN_DIRS.flatMap((d) => collectTsFiles(join(process.cwd(), d)));

  it("finds files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const base = file.split(/[\\/]/).pop() ?? file;
    if (NON_EMPLOYEE_SOURCE_FILES.has(base)) continue;

    it(`${base} has no un-hinted owner_companies embed`, () => {
      const src = readFileSync(file, "utf8");
      // Match `owner_company:owner_companies(` NOT followed by a `!fkey` hint.
      const unhinted = src.match(/owner_company:owner_companies\(/g) ?? [];
      const hinted = src.match(/owner_company:owner_companies!employees_owner_company_id_fkey\(/g) ?? [];
      expect(
        unhinted.length,
        `Un-hinted owner_companies embed found in ${base}. ` +
          `Use owner_company:owner_companies!employees_owner_company_id_fkey(...) ` +
          `for queries sourced from employees.`
      ).toBe(0);
      // Sanity: files that reference owner_companies at all must use the hint.
      if (src.includes("owner_companies")) {
        expect(hinted.length + (src.includes("owner_company_id") ? 1 : 0)).toBeGreaterThan(0);
      }
    });
  }
});
