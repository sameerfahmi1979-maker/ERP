import {z} from "zod";
export {hrReadIdentity as dmsBrowserIdentity} from "./hr-read-identity";

const id = z.number().int().positive().refine(Number.isSafeInteger);
const count = z.number().int().nonnegative().refine(Number.isSafeInteger);
const text = z.string().nullable();
const paging = {offset: count.max(1000000).default(0), limit: z.number().int().min(1).max(100).default(25)};
const date = z.union([z.literal(""), z.iso.date()]).default("");
export const dmsBrowserSearchCriteria = z.object({operation: z.literal("search"), query: z.string().trim().max(200).default(""),
  documentTypeIds: z.array(id).max(100).default([]).transform(ids => [...new Set(ids)].sort((a, b) => a - b)),
  status: z.string().max(64).regex(/^[a-z_]*$/).default(""), issueDateFrom: date, issueDateTo: date,
  linkedEntityType: z.enum(["", "employee", "employee_dependent", "party", "vendor"]).default(""), ...paging,
}).strict();
export const dmsBrowserFilesCriteria = z.object({operation: z.literal("files"), documentId: id, ...paging}).strict();
export const dmsBrowserTypesCriteria = z.object({operation: z.literal("types")}).strict();
export const dmsBrowserCriteriaSchema = z.discriminatedUnion("operation", [dmsBrowserSearchCriteria, dmsBrowserFilesCriteria, dmsBrowserTypesCriteria]);
export type DmsBrowserCriteria = z.infer<typeof dmsBrowserCriteriaSchema>;

export const dmsBrowserRowSchema = z.object({id, documentNo: z.string(), title: z.string(), typeNameEn: text, typeCode: text,
  status: z.string(), issueDate: z.iso.date().nullable(), expiryDate: z.iso.date().nullable(),
  matchSource: z.enum(["metadata", "content", "both"]), contentExcerpt: z.string().max(122).nullable(),
}).strict();
export const dmsBrowserFileSchema = z.object({id, fileName: z.string(), mimeType: text, fileSizeBytes: count.nullable()}).strict();
export const dmsBrowserTypeSchema = z.object({id, typeCode: z.string(), nameEn: z.string()}).strict();
const complete = (v: {criteria: {offset: number; limit: number}; totalCount: number; rows: {id: number}[]}) =>
  v.rows.length === Math.min(v.criteria.limit, Math.max(0, v.totalCount - v.criteria.offset)) && new Set(v.rows.map(r => r.id)).size === v.rows.length;
const metadata = {asOf: z.iso.datetime(), availability: z.literal("available"), totalCount: count};
export const dmsBrowserSearchPage = z.object({criteria: dmsBrowserSearchCriteria, ...metadata, rows: z.array(dmsBrowserRowSchema).max(100)}).strict().refine(complete);
export const dmsBrowserFilesPage = z.object({criteria: dmsBrowserFilesCriteria, ...metadata, document: dmsBrowserRowSchema,
  canPreview: z.boolean(), canDownload: z.boolean(), rows: z.array(dmsBrowserFileSchema).max(100),
}).strict().refine(v => complete(v) && v.document.id === v.criteria.documentId);
export const dmsBrowserFilesUnavailable = z.object({criteria: dmsBrowserFilesCriteria, asOf: z.iso.datetime(), availability: z.literal("unavailable")}).strict();
export const dmsBrowserTypesPage = z.object({criteria: dmsBrowserTypesCriteria, ...metadata, rows: z.array(dmsBrowserTypeSchema).max(5000)}).strict()
  .refine(v => v.rows.length === v.totalCount && new Set(v.rows.map(r => r.id)).size === v.rows.length);
// This is an execution-safety ceiling, not a business limit or a partial page.
export const dmsBrowserTooLarge = z.object({criteria: z.union([dmsBrowserSearchCriteria, dmsBrowserTypesCriteria]), asOf: z.iso.datetime(), availability: z.literal("too_large")}).strict();
export const dmsBrowserResponseSchema = z.union([dmsBrowserSearchPage, dmsBrowserFilesPage, dmsBrowserFilesUnavailable, dmsBrowserTypesPage, dmsBrowserTooLarge]);
export type DmsBrowserResponse = z.infer<typeof dmsBrowserResponseSchema>;
export type DmsBrowserRow = z.infer<typeof dmsBrowserRowSchema>;
