import {z} from "zod";
const id=z.number().int().positive().refine(Number.isSafeInteger);
export const hrDocumentCriteria=z.object({employeeId:id,dependentId:id.nullable().default(null),target:z.enum(["employee","dependent"]).default("employee"),mode:z.enum(["library","wizard"]),
 search:z.string().trim().max(160).default(""),page:z.number().int().min(1).max(100000).default(1),pageSize:z.literal(50).default(50)}).strict();
export const hrDocumentChoice=z.object({id,document_no:z.string().nullable(),title:z.string(),status:z.string(),
 document_type_name:z.string().nullable(),document_type_code:z.string().nullable(),issue_date:z.string().nullable(),expiry_date:z.string().nullable(),
 has_extraction:z.boolean(),has_ocr:z.boolean(),extracted_person_name:z.string().nullable(),is_linked_to_employee:z.boolean()}).strip();
export const hrDocumentPage=z.object({employeeId:id,dependentId:id.nullable(),target:z.enum(["employee","dependent"]),mode:z.enum(["library","wizard"]),page:z.number().int().positive(),pageSize:z.literal(50),
 totalCount:z.number().int().nonnegative(),rows:z.array(hrDocumentChoice).max(50)}).strict().superRefine((p,c)=>{
 if(p.rows.length!==Math.min(50,Math.max(0,p.totalCount-(p.page-1)*50))||new Set(p.rows.map(r=>r.id)).size!==p.rows.length)c.addIssue({code:"custom",message:"Incomplete document choices"});
});
export type HrDocumentChoice=z.infer<typeof hrDocumentChoice>;
