import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {HR_SEARCH_CATEGORY_ORDER, HR_SEARCH_CATEGORY_LABELS, type HrSearchCategory} from "@/lib/hr/search/types";
export {hrReadIdentity as hrSearchReadIdentity} from "./hr-read-identity";
export const hrSearchCategorySchema = z.enum(["employees", "candidates", "compliance", "time", "payroll", "operations", "actions", "onboarding"]);
const id = z.number().int().positive().refine(Number.isSafeInteger);
const date = z.string().refine(s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s);
export const hrSearchFullCriteriaSchema = z.object({mode: z.literal("results").default("results"), query: z.string().max(200).default(""),
  categories: z.array(hrSearchCategorySchema).max(8).refine(c => new Set(c).size === c.length).default([]),
  ownerCompanyId: id.optional(), branchId: id.optional(), departmentId: id.optional(), designationId: id.optional(), workSiteId: id.optional(),
  status: z.string().max(100).optional(), dateFrom: date.optional(), dateTo: date.optional(),
  page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(50)}).strict()
  .refine(p => !p.dateFrom || !p.dateTo || p.dateFrom <= p.dateTo, {message: "Date From must not be after Date To"});
export const hrSearchSuggestionCriteriaSchema = z.object({mode: z.literal("suggestions"), query: z.string().min(2).max(200)}).strict();
export const hrSearchReadRequestSchema = z.union([hrSearchFullCriteriaSchema, hrSearchSuggestionCriteriaSchema]);
export function hrSearchAllowedCategories(ctx: AuthContext): HrSearchCategory[] {
  const permission: Record<HrSearchCategory, string[]> = {employees: ["hr.employees.view"], candidates: ["hr.recruitment.view"], onboarding: ["hr.recruitment.view"],
    compliance: ["hr.compliance.view"], time: ["hr.attendance.view", "hr.leave.view"], payroll: ["hr.payroll.view"], operations: ["hr.assignments.view"], actions: ["hr.actions.view"]};
  return HR_SEARCH_CATEGORY_ORDER.filter(c => permission[c].some(code => hasPermission(ctx, code)));
}
export type HrSearchFullCriteria = z.infer<typeof hrSearchFullCriteriaSchema>;
/** Existing category applicability, made explicit instead of silently ignoring
 * selected controls. This is not a new cross-module business filter definition. */
export function hrSearchCriteriaIssue(p: HrSearchFullCriteria, allowed: HrSearchCategory[]): string | null {
  if (p.workSiteId) return "Work-site filtering is not implemented in HR Search. Remove it before searching.";
  const selected = p.categories.length ? p.categories : allowed;
  if (selected.some(c => !allowed.includes(c))) return "Some selected HR areas are not available to your account.";
  const unsupported = (supported: HrSearchCategory[]) => selected.filter(c => !supported.includes(c)).map(c => HR_SEARCH_CATEGORY_LABELS[c]).join(", ");
  const scope = p.ownerCompanyId || p.branchId || p.departmentId || p.designationId;
  if (scope && unsupported(["employees", "compliance", "time", "payroll", "operations", "actions"])) return "Company, branch, department and designation filters do not apply to Candidates or Onboarding. Select compatible areas or remove these filters.";
  if (p.status && unsupported(["employees", "candidates", "onboarding"])) return "Status filtering is currently supported only for Employees, Candidates and Onboarding. Select those areas or remove Status.";
  if ((p.dateFrom || p.dateTo) && unsupported(["candidates", "onboarding"])) return "Date filtering is currently supported only for candidate creation and onboarding due dates. Select those areas or remove the dates.";
  if (!p.query && unsupported(["candidates", "onboarding"])) return "Enter search text for the selected HR areas. Filter-only search is available for Candidates and Onboarding.";
  if (!p.query && !p.status && !p.dateFrom && !p.dateTo) return "Enter search text, Status or a date filter before searching.";
  return null;
}
export const hrSearchResultReadSchema = z.object({id: z.string().min(1), category: hrSearchCategorySchema, entityType: z.string().min(1), entityId: id,
  title: z.string(), subtitle: z.string().optional(), description: z.string().optional(), status: z.string().optional(),
  statusVariant: z.enum(["success", "warning", "danger", "muted"]).optional(), employeeId: id.optional(), employeeCode: z.string().optional(), employeeName: z.string().optional(),
  candidateId: id.optional(), candidateCode: z.string().optional(), date: z.string().optional(), href: z.string().regex(/^\/admin\/hr\//),
  matchedFields: z.array(z.string()), restricted: z.boolean().optional()}).strict();
const count = z.number().int().nonnegative().refine(Number.isSafeInteger);
export const hrSearchPageReadSchema = z.object({criteria: hrSearchFullCriteriaSchema, results: z.array(hrSearchResultReadSchema).max(100),
  totalCount: count, groupCounts: z.partialRecord(hrSearchCategorySchema, count), hasMore: z.boolean(),
  ordering: z.literal("category-entity-id-v1"), countScope: z.literal("authorized-matches")}).strict().refine(p =>
  p.results.length === Math.min(p.criteria.pageSize, Math.max(0, p.totalCount - (p.criteria.page - 1) * p.criteria.pageSize)) &&
  Object.values(p.groupCounts).reduce((sum, value) => sum + (value ?? 0), 0) === p.totalCount &&
  new Set(p.results.map(r => r.id)).size === p.results.length && p.hasMore === (p.criteria.page * p.criteria.pageSize < p.totalCount) &&
  Object.keys(p.groupCounts).every(c => !p.criteria.categories.length || p.criteria.categories.includes(c as HrSearchCategory)) &&
  p.results.every(r => (p.groupCounts[r.category] ?? 0) >= p.results.filter(other => other.category === r.category).length));
export const hrSearchSuggestionsReadSchema = z.object({criteria: hrSearchSuggestionCriteriaSchema, kind: z.literal("quick-suggestions"),
  limit: z.literal(8), complete: z.literal(false), rows: z.array(z.object({label: z.string(), sublabel: z.string().optional(), href: z.string().regex(/^\/admin\/hr\/(employees|recruitment\/candidates)\/record\/\d+$/),
    category: z.enum(["employees", "candidates"])}).strict()).max(8)}).strict();
export type HrSearchPageRead = z.infer<typeof hrSearchPageReadSchema>;
export type HrSearchSuggestionsRead = z.infer<typeof hrSearchSuggestionsReadSchema>;
