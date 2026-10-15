import {z} from "zod";
const id=z.number().int().positive().refine(Number.isSafeInteger);
export const hrLinkedDocumentCriteria=z.object({employeeId:id,dependentId:id.nullable().default(null)}).strict();
export const hrLinkedDocument=z.object({link_id:id,document_id:id,document_no:z.string(),title:z.string(),status:z.string().nullable(),expiry_date:z.string().nullable(),document_type_name:z.string().nullable()}).strip();
export const hrLinkedDocuments=z.object({employeeId:id,dependentId:id.nullable(),rows:z.array(hrLinkedDocument).max(2000)}).strict();
export type HrLinkedDocument=z.infer<typeof hrLinkedDocument>;
