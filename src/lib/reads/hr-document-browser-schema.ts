import {z} from "zod";
export {hrReadIdentity as hrDocumentBrowserIdentity} from "./hr-read-identity";

const id = z.number().int().positive().refine(Number.isSafeInteger);
const text = z.string().nullable(), count = z.number().int().nonnegative().refine(Number.isSafeInteger);
const page = {page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25)};
const search = z.string().trim().max(200).default("");
export const hrBrowserEntitySchema = z.object({entityType: z.enum(["employee", "employee_dependent"]), entityId: id}).strict();
export const hrBrowserEmployeesCriteria = z.object({operation: z.literal("employees"), ...page, search, status: z.enum(["all", "active", "inactive"]).default("all")}).strict();
export const hrBrowserDependentsCriteria = z.object({operation: z.literal("dependents"), employeeId: id, ...page}).strict();
export const HR_BROWSER_DOCUMENT_FIELDS = ["title", "typeNameEn", "source"] as const;
export const hrBrowserDocumentsCriteria = hrBrowserEntitySchema.extend({operation: z.literal("documents"), ...page, search,
  sortKey: z.enum(["expiryDate", ...HR_BROWSER_DOCUMENT_FIELDS]).default("expiryDate"), sortDir: z.enum(["asc", "desc"]).default("asc"),
  columnFilters: z.object({title: z.string().trim().max(200).optional(), typeNameEn: z.string().trim().max(200).optional(), source: z.string().trim().max(200).optional()}).strict().default({}),
}).strict();
export const hrBrowserFilesCriteria = hrBrowserEntitySchema.extend({operation: z.literal("files"), documentId: id, ...page}).strict();
export const hrDocumentBrowserCriteriaSchema = z.discriminatedUnion("operation", [hrBrowserEmployeesCriteria, hrBrowserDependentsCriteria, hrBrowserDocumentsCriteria, hrBrowserFilesCriteria]);
export type HrDocumentBrowserCriteria = z.infer<typeof hrDocumentBrowserCriteriaSchema>;

export const hrBrowserEmployeeSchema = z.object({id, employeeCode: text, fullNameEn: text, status: text}).strict();
export const hrBrowserDependentSchema = z.object({id, employeeId: id, name: text, relationship: text}).strict();
export const hrBrowserDocumentSchema = z.object({key: z.string().regex(/^(dms|identity):[1-9]\d*$/), id: id.nullable(), documentNo: text, title: z.string(),
  typeNameEn: text, status: text, issueDate: z.iso.date().nullable(), expiryDate: z.iso.date().nullable(), source: z.enum(["dms_link", "hr_identity", "dependent_link"])}).strict()
  .refine(row => row.id === null ? row.key.startsWith("identity:") && row.source === "hr_identity" : row.key === `dms:${row.id}`);
export const hrBrowserFileSchema = z.object({id, documentId: id, fileName: z.string(), mimeType: text, fileSizeBytes: count.nullable()}).strict();
const pageMetadata = {asOf: z.iso.datetime(), totalCount: count};
const completePage = (value: {criteria: {page: number; pageSize: number}; totalCount: number; rows: unknown[]}) =>
  value.rows.length === Math.min(value.criteria.pageSize, Math.max(0, value.totalCount - (value.criteria.page - 1) * value.criteria.pageSize));
export const hrBrowserEmployeesPage = z.object({criteria: hrBrowserEmployeesCriteria, ...pageMetadata, rows: z.array(hrBrowserEmployeeSchema).max(100)}).strict()
  .refine(value => completePage(value) && new Set(value.rows.map(r => r.id)).size === value.rows.length);
export const hrBrowserDependentsPage = z.object({criteria: hrBrowserDependentsCriteria, ...pageMetadata, rows: z.array(hrBrowserDependentSchema).max(100)}).strict()
  .refine(value => completePage(value) && new Set(value.rows.map(r => r.id)).size === value.rows.length && value.rows.every(row => row.employeeId === value.criteria.employeeId));
export const hrBrowserDocumentsPage = z.object({criteria: hrBrowserDocumentsCriteria, ...pageMetadata, rows: z.array(hrBrowserDocumentSchema).max(100)}).strict()
  .refine(value => completePage(value) && new Set(value.rows.map(r => r.key)).size === value.rows.length);
export const hrBrowserFilesPage = z.object({criteria: hrBrowserFilesCriteria, ...pageMetadata, rows: z.array(hrBrowserFileSchema).max(100), availability: z.literal("available"), canPreview: z.boolean(), canDownload: z.boolean()}).strict()
  .refine(value => completePage(value) && new Set(value.rows.map(r => r.id)).size === value.rows.length && value.rows.every(row => row.documentId === value.criteria.documentId));
// A missing/deleted/narrower-scope document is non-enumerating and contains no
// previous metadata. It is distinct from a temporarily failed file read.
export const hrBrowserFilesUnavailable = z.object({criteria: hrBrowserFilesCriteria, asOf: z.iso.datetime(), availability: z.literal("unavailable")}).strict();
export const hrBrowserTooLarge = z.object({criteria: z.union([hrBrowserEmployeesCriteria, hrBrowserDocumentsCriteria]), asOf: z.iso.datetime(), availability: z.literal("too_large")}).strict();
export const hrDocumentBrowserResponseSchema = z.union([hrBrowserEmployeesPage, hrBrowserDependentsPage, hrBrowserDocumentsPage, hrBrowserFilesPage, hrBrowserFilesUnavailable, hrBrowserTooLarge]);
export type HrDocumentBrowserResponse = z.infer<typeof hrDocumentBrowserResponseSchema>;
export type HrBrowserEmployee = z.infer<typeof hrBrowserEmployeeSchema>;
export type HrBrowserDependent = z.infer<typeof hrBrowserDependentSchema>;
export type HrBrowserDocument = z.infer<typeof hrBrowserDocumentSchema>;
export type HrBrowserFile = z.infer<typeof hrBrowserFileSchema>;
