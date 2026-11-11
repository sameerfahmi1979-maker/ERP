import {z} from 'zod';
import {dmsDocumentCreateSchema} from './numbered-document-create';
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const documentTypeChangeSchema=z.object({documentId:id,documentTypeId:id,
 document:dmsDocumentCreateSchema.omit({originContext:true,owner_user_id:true,reminder_policy_id:true,legacy_document_code:true}).strict(),
 values:z.array(z.object({definition_id:id,value_text:z.string().nullable().optional(),value_number:z.number().finite().nullable().optional(),value_date:z.string().nullable().optional(),value_datetime:z.string().nullable().optional(),value_boolean:z.boolean().nullable().optional(),value_json:z.unknown().optional()}).strict()).max(250),
 snapshot:z.string().regex(/^[a-f0-9]{64}$/),requestId:z.uuid(),
}).strict();
export type DocumentTypeChangeRequest=z.infer<typeof documentTypeChangeSchema>;
export function restoreTypeChangeRequest(raw:string,documentId:number|null){
 if(!raw)return {pending:null,invalid:false};
 try{const p=documentTypeChangeSchema.parse(JSON.parse(raw));if(p.documentId!==documentId)throw Error('Wrong document');return {pending:p,invalid:false};}
 catch{return {pending:null,invalid:true};}
}
