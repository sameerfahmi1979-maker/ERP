import "server-only";
import {z} from "zod";
import type {createClient} from "@/lib/supabase/server";
import {readAllPages} from "./all-pages";

const id=z.number().int().positive();
const date=z.iso.date();
export const expiryFilterSchema=z.object({
 view:z.enum(["expired","expiring","missing_expiry","all","ignored"]),
 // Compatibility callers may set a safety ceiling; truncation is never success.
 limit:z.number().int().min(1).max(10000).optional(),
 documentTypeId:id.optional(),categoryId:id.optional(),
 expiryDateFrom:date.optional(),expiryDateTo:date.optional(),
 daysRemainingMin:z.number().int().min(-365000).max(365000).optional(),
 daysRemainingMax:z.number().int().min(-365000).max(365000).optional(),
 entityType:z.string().trim().min(1).max(100).optional(),entityId:id.optional(),
 status:z.string().trim().min(1).max(100).optional(),searchText:z.string().trim().max(200).optional(),
}).strict().refine(p=>Boolean(p.entityType)===Boolean(p.entityId),"Choose an entity type and ID together")
 .refine(p=>!p.expiryDateFrom||!p.expiryDateTo||p.expiryDateFrom<=p.expiryDateTo,"Invalid date range")
 .refine(p=>p.daysRemainingMin===undefined||p.daysRemainingMax===undefined||p.daysRemainingMin<=p.daysRemainingMax,"Invalid days range");

export const expiryIdRowsSchema=z.array(z.object({id}));
export const expiryLinkRowsSchema=z.array(z.object({id,document_id:id}));
export const expiryDocumentRowsSchema=z.array(z.object({
 id,document_no:z.string(),title:z.string(),expiry_date:date.nullable(),issue_date:date.nullable(),
 status:z.string(),confidentiality:z.string(),expiry_tracking_override:z.string().nullable(),expiry_override_reason:z.string().nullable(),
 document_type:z.object({name_en:z.string(),is_renewable:z.boolean().nullable()}).nullable(),
 category:z.object({category:z.object({name_en:z.string()}).nullable()}).nullable(),
}));

/** Complete authorized exclusions, never an unchecked first backend page. */
export async function readNoExpiryTypeIds(db:Awaited<ReturnType<typeof createClient>>):Promise<number[]>{
 const rows=await readAllPages(async(from,to)=>{
  const result=await db.from("dms_document_types").select("id",{count:"exact"})
   .eq("requires_expiry_tracking",false).is("deleted_at",null).order("id",{ascending:true}).range(from,to);
  return {...result,data:expiryIdRowsSchema.parse(result.data)};
 },{identity:row=>row.id,maxRows:10000});
 return rows.map(row=>row.id);
}
