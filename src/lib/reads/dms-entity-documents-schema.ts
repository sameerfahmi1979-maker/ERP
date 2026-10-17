import {z} from "zod";
import {DMS_ENTITY_TYPE_CODES} from "@/lib/dms/dms-entity-types";
export {hrReadIdentity as dmsEntityDocumentsIdentity} from "./hr-read-identity";
const id=z.number().int().positive().refine(Number.isSafeInteger),count=z.number().int().nonnegative().refine(Number.isSafeInteger),text=z.string().nullable();
const parent={entityType:z.enum(DMS_ENTITY_TYPE_CODES),entityId:id};
const paging={offset:count.max(1000000).default(0),limit:z.number().int().min(1).max(100).default(25)};
export const entityDocumentsListCriteria=z.object({...parent,operation:z.literal("list"),...paging}).strict();
export const entityDocumentsAttachCriteria=z.object({...parent,operation:z.literal("attach"),search:z.string().trim().max(200).default(""),...paging}).strict();
export const entityDocumentsSelectedCriteria=z.object({...parent,operation:z.literal("selected"),documentIds:z.array(id).min(1).max(100).refine(v=>new Set(v).size===v.length).transform(v=>[...v].sort((a,b)=>a-b))}).strict();
export const entityDocumentsSummaryCriteria=z.object({...parent,operation:z.literal("summary")}).strict();
export const entityDocumentsCriteriaSchema=z.discriminatedUnion("operation",[entityDocumentsListCriteria,entityDocumentsAttachCriteria,entityDocumentsSelectedCriteria,entityDocumentsSummaryCriteria]);
export type EntityDocumentsCriteria=z.infer<typeof entityDocumentsCriteriaSchema>;
export const entityDocumentRowSchema=z.object({link_id:id,link_is_primary:z.boolean(),link_role:text,linked_at:z.string(),document_id:id,
  document_no:z.string(),legacy_document_code:text,title:z.string(),description:text,status:z.string(),confidentiality_level:z.string(),issue_date:text,expiry_date:text,migrated_from_table:text,
  document_type_name:text,document_type_code:text,has_files:z.boolean(),files_count:count,ai_summary:z.null(),ai_risk_level:text,ai_risk_score:z.number().finite().nullable(),completeness_score:z.number().finite().nullable(),created_at:z.string(),updated_at:z.string(),
}).strict();
// NULL means restricted/unknown, not evidence that extraction or OCR is absent.
export const entityDocumentOptionSchema=z.object({id,document_no:z.string(),title:z.string(),document_type_name:text,document_type_code:text,status:z.string(),issue_date:text,expiry_date:text,
  has_extraction:z.boolean().nullable(),has_ocr:z.boolean().nullable(),extracted_person_name:text,
}).strict().refine(v=>v.has_extraction===true||v.extracted_person_name===null);
export const entityDocumentSummarySchema=z.object({totalDocuments:count,expiredDocuments:count,expiringSoonDocuments:count,missingRequiredDocuments:count.nullable(),openComplianceFindings:count.nullable(),
  highRiskDocuments:count,criticalRiskDocuments:count,latestExpiryDate:text,scope:z.literal("visible_documents"),
}).strict().refine(v=>v.expiredDocuments+v.expiringSoonDocuments<=v.totalDocuments&&v.highRiskDocuments+v.criticalRiskDocuments<=v.totalDocuments);
const meta={asOf:z.iso.datetime(),availability:z.literal("available")};
const complete=(v:{criteria:{offset:number;limit:number};totalCount:number;rows:unknown[]})=>v.rows.length===Math.min(v.criteria.limit,Math.max(0,v.totalCount-v.criteria.offset));
export const entityDocumentsListPage=z.object({criteria:entityDocumentsListCriteria,...meta,totalCount:count,rows:z.array(entityDocumentRowSchema).max(100)}).strict().refine(v=>complete(v)&&new Set(v.rows.map(r=>r.link_id)).size===v.rows.length);
export const entityDocumentsAttachPage=z.object({criteria:entityDocumentsAttachCriteria,...meta,totalCount:count,rows:z.array(entityDocumentOptionSchema).max(100)}).strict().refine(v=>complete(v)&&new Set(v.rows.map(r=>r.id)).size===v.rows.length);
export const entityDocumentsSelectedPage=z.object({criteria:entityDocumentsSelectedCriteria,...meta,rows:z.array(entityDocumentOptionSchema).max(100)}).strict()
  .refine(v=>v.rows.length===v.criteria.documentIds.length&&new Set(v.rows.map(r=>r.id)).size===v.rows.length&&v.rows.every(r=>v.criteria.documentIds.includes(r.id)));
export const entityDocumentsSummaryPage=z.object({criteria:entityDocumentsSummaryCriteria,...meta,summary:entityDocumentSummarySchema}).strict();
export const entityDocumentsUnavailable=z.object({criteria:entityDocumentsCriteriaSchema,asOf:z.iso.datetime(),availability:z.enum(["unavailable","too_large"])}).strict();
export const entityDocumentsResponseSchema=z.union([entityDocumentsListPage,entityDocumentsAttachPage,entityDocumentsSelectedPage,entityDocumentsSummaryPage,entityDocumentsUnavailable]);
export type EntityDocumentsResponse=z.infer<typeof entityDocumentsResponseSchema>;
export type DmsEntityDocumentRow=z.infer<typeof entityDocumentRowSchema>;
export type AvailableDmsDocumentOption=z.infer<typeof entityDocumentOptionSchema>;
export type DmsEntityDocumentComplianceSummary=z.infer<typeof entityDocumentSummarySchema>;
