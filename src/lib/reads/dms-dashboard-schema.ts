import {z} from "zod";
export {hrReadIdentity as dmsDashboardIdentity} from "./hr-read-identity";
const count=z.number().int().nonnegative().refine(Number.isSafeInteger),id=count.refine(n=>n>0);
export const dmsDashboardCriteriaSchema=z.object({rangeDays:z.union([z.literal(7),z.literal(30),z.literal(90)]).default(30)}).strict();
export const dmsDashboardUnavailable=z.object({status:z.enum(["restricted","failed","too_large"])}).strict();
export const dmsDashboardMetric=z.union([z.object({status:z.literal("ready"),value:count}).strict(),dmsDashboardUnavailable]);
const day=z.object({date:z.iso.date(),count}).strict(),category=z.object({name:z.string(),count}).strict();
const pipeline=z.object({status:z.enum(["ocr_pending","ocr_done","ai_complete","pending_review"]),label:z.string(),count}).strict();
const expiry=z.object({label:z.string(),days:z.number().int().positive(),count}).strict();
export const dmsDashboardInboxRow=z.object({id,original_filename:z.string(),status:z.string(),intake_status:z.string().nullable(),created_at:z.iso.datetime({offset:true}),session_code:z.string()}).strict();
export const dmsDashboardExpiringRow=z.object({id,document_no:z.string(),title:z.string(),expiry_date:z.iso.date(),document_type_name:z.string().nullable()}).strict();
export const dmsDashboardRenewalRow=z.object({id,renewal_no:z.string(),document_title:z.string(),status:z.string(),priority:z.string().nullable(),assigned_to_name:z.string().nullable()}).strict();
const series=<S extends z.ZodType>(row:S,max:number)=>z.union([z.object({status:z.literal("ready"),items:z.array(row).max(max)}).strict(),dmsDashboardUnavailable]);
const panel=<S extends z.ZodType<{id:number}>>(row:S)=>z.union([z.object({status:z.literal("ready"),items:z.array(row).max(5),totalCount:count,limited:z.boolean()}).strict().refine(v=>v.items.length===Math.min(5,v.totalCount)&&v.limited===(v.totalCount>5)&&new Set(v.items.map(r=>r.id)).size===v.items.length),dmsDashboardUnavailable]);
export const dmsDashboardSchema=z.object({
  criteria:dmsDashboardCriteriaSchema,asOf:z.iso.datetime(),scope:z.literal("permitted_records"),
  total_documents:dmsDashboardMetric,added_this_month:dmsDashboardMetric,added_last_month:dmsDashboardMetric,inbox_pending:dmsDashboardMetric,
  expiring_30_days:dmsDashboardMetric,review_queue_pending:dmsDashboardMetric,storage_bytes:dmsDashboardMetric,
  // Legacy rolling range has no upper timestamp bound; future-dated rows are
  // not silently dropped or reclassified by this performance adoption.
  documents_by_day:series(day,5000),documents_by_category:series(category,8),ai_pipeline:series(pipeline,4),expiry_buckets:series(expiry,5),
  inbox_items:panel(dmsDashboardInboxRow),expiring_items:panel(dmsDashboardExpiringRow),renewal_items:panel(dmsDashboardRenewalRow),
}).strict().superRefine((v,c)=>{
  if(v.documents_by_day.status==="ready"&&new Set(v.documents_by_day.items.map(r=>r.date)).size!==v.documents_by_day.items.length)c.addIssue({code:"custom",message:"Duplicate day"});
  if(v.documents_by_category.status==="ready"&&new Set(v.documents_by_category.items.map(r=>r.name)).size!==v.documents_by_category.items.length)c.addIssue({code:"custom",message:"Duplicate category"});
  if(v.ai_pipeline.status==="ready"&&(v.ai_pipeline.items.length!==4||new Set(v.ai_pipeline.items.map(r=>r.status)).size!==4))c.addIssue({code:"custom",message:"Incomplete pipeline"});
  if(v.expiry_buckets.status==="ready"&&JSON.stringify(v.expiry_buckets.items.map(r=>r.days))!=="[7,14,30,60,90]")c.addIssue({code:"custom",message:"Incomplete expiry buckets"});
});
export type DmsDashboard=z.infer<typeof dmsDashboardSchema>;
export type DmsDashboardCriteria=z.infer<typeof dmsDashboardCriteriaSchema>;
export type DmsDashboardMetric=z.infer<typeof dmsDashboardMetric>;
export type DmsDashboardUnavailable=z.infer<typeof dmsDashboardUnavailable>;
export type DmsDocumentsByDay=z.infer<typeof day>;
export type DmsByCategory=z.infer<typeof category>;
export type DmsAiPipelineSlice=z.infer<typeof pipeline>;
export type DmsExpiryBucket=z.infer<typeof expiry>;
export type DmsInboxPendingRow=z.infer<typeof dmsDashboardInboxRow>;
export type DmsExpiringRow=z.infer<typeof dmsDashboardExpiringRow>;
export type DmsRenewalRow=z.infer<typeof dmsDashboardRenewalRow>;
