"use server";

import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {reviewedCall,reviewHash} from '@/server/dms-reviewed-updates';
import {documentTypeChangeSchema} from '@/lib/dms/document-type-change';
import {mapMetadataDefinitionRow} from '@/lib/dms/metadata/metadata-definition-shared';
import type {DmsMetadataValueInput,DmsMetadataValueRow} from './document-metadata-values';

const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export async function readDocumentTypeChange(documentId:number,documentTypeId:number){
 if(!id.safeParse(documentId).success||!id.safeParse(documentTypeId).success)return {success:false as const,error:'Document type unavailable.'};
 const r=await reviewedCall('dms_type_change',{p_action:'review',p_data:{documentId,documentTypeId}},z.object({
  documentId:z.literal(documentId),documentTypeId:z.literal(documentTypeId),snapshot:reviewHash,
  definitions:z.array(z.object({id,document_type_id:z.literal(documentTypeId),field_code:z.string(),field_label_en:z.string(),field_type:z.string(),is_required:z.boolean()}).passthrough()).max(250),
  values:z.array(z.object({id,document_id:z.literal(documentId),definition_id:id,value_text:z.string().nullable(),value_number:z.number().nullable(),value_date:z.string().nullable(),value_datetime:z.string().nullable(),value_boolean:z.boolean().nullable(),value_json:z.unknown()}).passthrough()).max(250),
 }).strict());
 if(!r.success||!r.data)return {success:false as const,error:'The document type review could not be loaded. Keep your draft and retry; no changes were saved.'};
 return {success:true as const,data:{...r.data,definitions:r.data.definitions.map(mapMetadataDefinitionRow),values:r.data.values as DmsMetadataValueRow[]}};
}

export async function saveDocumentTypeChange(input:{documentId:number;documentTypeId:number;document:unknown;values:DmsMetadataValueInput[];snapshot:string;requestId:string}){
 const parsed=documentTypeChangeSchema.safeParse(input);
 if(!parsed.success||parsed.data.document.document_type_id!==input.documentTypeId)return {success:false as const,error:'Review the document fields and required metadata before saving.'};
 const r=await reviewedCall('dms_type_change',{p_action:'save',p_data:parsed.data},z.object({documentId:z.literal(input.documentId),documentTypeId:z.literal(input.documentTypeId),requestId:z.literal(input.requestId)}).strict());
 if(r.success){try{revalidatePath('/dms/documents');revalidatePath(`/dms/documents/record/${input.documentId}`);}catch{/* Confirmed transaction remains committed. */}}
 return r;
}
