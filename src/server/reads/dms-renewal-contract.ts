import "server-only";
import {z} from "zod";
const id=z.number().int().positive();
export const renewalFilterSchema=z.object({documentId:id.optional(),status:z.string().trim().min(1).max(100).optional(),assignedToMe:z.boolean().optional(),includeCompleted:z.boolean().optional()}).strict();
export const renewalRowsSchema=z.array(z.object({
 id,document_id:id,renewal_no:z.string().nullable(),status:z.string(),priority:z.string(),
 requested_by:id.nullable(),assigned_to:id.nullable(),requested_at:z.string(),target_renewal_date:z.string().nullable(),
 old_expiry_date:z.string().nullable(),new_expiry_date:z.string().nullable(),replacement_document_id:id.nullable(),replacement_version_id:id.nullable(),
 notes:z.string().nullable(),completed_at:z.string().nullable(),cancelled_at:z.string().nullable(),created_by:id.nullable(),created_at:z.string(),updated_at:z.string(),
 document:z.object({id,document_no:z.string(),title:z.string(),expiry_date:z.string().nullable(),document_type_id:id}).nullable(),
 requester:z.object({full_name:z.string().nullable()}).nullable(),assignee:z.object({full_name:z.string().nullable()}).nullable(),
}));
