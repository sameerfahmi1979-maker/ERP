import { describe, it, expect } from "vitest";
import { deterministicPlan, questionSearchText, expiryStatus, dateRange, dubaiDate } from "@/lib/ai/assistant-guidance/planner";
import { questionSchema, questionPlanSchema, policyLibrarySchema } from "@/lib/ai/assistant-guidance/contracts";
import { reviewedFieldCandidates } from "@/lib/ai/assistant-guidance/form-review";
describe("Typed questions, dates, policy and form boundaries", () => {
  it.each([
    ["When does Sameer Fahmi's CICPA pass expire?", "expiry"], ["Give me Sameer's Emirates ID document link", "documents"],
    ["Who are Sameer's dependents?", "dependents"], ["Show ISO certificates", "documents"], ["What about his passport?", "documents"],
    ["How many documents expire next month grouped by type?", "report"], ["Show my daily work briefing", "briefing"],
    ["Who will approve this document?", "approval"], ["How do I correct this record?", "guidance"], ["What is our leave policy?", "policy"],
  ])("routes %s to its owning adapter", (q, tool) => expect(deterministicPlan(q)?.tool).toBe(tool));
  it("retains full names and identifiers while removing question syntax", () => {
    expect(questionSearchText("Give me Sameer Fahmi's Emirates ID document link?")).toBe("Sameer Fahmi Emirates ID");
    expect(questionSearchText("What about his passport?")).toBe("passport");
    expect(questionSearchText("Show ISO 9001 certificates")).toContain("ISO 9001");
  });
  it("uses Dubai midnight rather than the host timezone", () => expect(dubaiDate(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01"));
  it.each([[null, "Expiry is not recorded"], ["2026-10-30", "Expired 1 day(s) ago"], ["2026-10-31", "Expires today"], ["2026-11-01", "Expires in 1 day(s)"], ["garbage", "Recorded expiry needs review"]])("handles expiry %s without guessing", (v, result) => expect(expiryStatus(v, "2026-10-31")).toBe(result));
  it("retains leap-year and year-boundary periods", () => {
    expect(dateRange("next_month", "2026-12-31")).toEqual({ from: "2027-01-01", to: "2027-01-31" });
    expect(dateRange("this_month", "2028-02-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
  it.each([{ question: "x", sql: "select *" }, { question: "x", context: { entityType: "employee", entityId: -1 } }, { question: "x", context: { entityType: "vehicle", entityId: 1 } }, { question: "x".repeat(1001) }])("rejects unknown or malformed public inputs", p => expect(questionSchema.safeParse(p).success).toBe(false));
  it.each([{ tool: "approve" }, { tool: "documents", query: "invented person" }, { tool: "documents", entityId: 99 }, { tool: "report", groupBy: "salary" }])("rejects model authority or unsupported instructions", p => expect(questionPlanSchema.safeParse(p).success).toBe(false));
  const policy = { documentId: 1, companyId: 1, branchIds: [], businessCode: "SYN-POLICY", revision: "v1", sourceVersionId: 1, effectiveFrom: "2026-01-01", effectiveTo: null, state: "approved" };
  it("rejects duplicate policy revisions and invalid scope/date", () => {
    expect(policyLibrarySchema.safeParse({ version: 1, policies: [policy, policy] }).success).toBe(false);
    expect(policyLibrarySchema.safeParse({ version: 1, policies: [{ ...policy, branchIds: [1, 1] }] }).success).toBe(false);
    expect(policyLibrarySchema.safeParse({ version: 1, policies: [{ ...policy, effectiveTo: "2025-01-01" }] }).success).toBe(false);
  });
  it("admits real branch/site fields and excludes protected fields", () => {
    expect(reviewedFieldCandidates("site", {}, [{ code: "access_notes", value: "SYNTHETIC gate A" }, { code: "site_code", value: "HACK" }, { code: "owner_company_id", value: "99" }]).map(f => f.field)).toEqual(["access_notes"]);
    expect(reviewedFieldCandidates("branch", {}, [{ code: "opening_date", value: "not a date" }])).toEqual([]);
  });
  it("holds conflicting evidence and forbidden replacements", () => {
    expect(reviewedFieldCandidates("branch", { trade_license_branch_ref: "OLD" }, [{ code: "trade_license_branch_ref", value: "NEW" }])).toEqual([]);
    expect(reviewedFieldCandidates("site", {}, [{ code: "site_name", value: "A" }, { code: "site_name", value: "B" }])).toEqual([]);
  });
});
