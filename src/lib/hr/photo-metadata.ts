import {z} from 'zod';
import {validateMetadataEntry} from '@/lib/dms/metadata/review-validation';
import type {DmsMetadataDefinitionRow,DmsMetadataValueInput,DmsMetadataValueRow} from '@/server/actions/dms/document-metadata-values';
export const photoMetadataRequest=z.object({requestId:z.uuid(),snapshot:z.string().regex(/^[a-f0-9]{64}$/),values:z.array(z.object({definition_id:z.number().int().positive().safe(),value_text:z.string().nullable().optional(),value_number:z.number().finite().nullable().optional(),value_date:z.string().nullable().optional(),value_datetime:z.string().nullable().optional(),value_boolean:z.boolean().nullable().optional(),value_json:z.unknown().optional()}).strict()).max(250)}).strict();
export type PhotoDetails={definitions:DmsMetadataDefinitionRow[];values:DmsMetadataValueRow[];snapshot:string};
export function photoMetadataValues(details:PhotoDetails,draft:Record<string,string>){
 return details.definitions.filter(d=>d.is_required).map(def=>{
  const saved=details.values.find(v=>v.definition_id===def.id);
  const old=saved?.value_text??saved?.value_number??saved?.value_date??saved?.value_datetime??saved?.value_boolean??saved?.value_json;
  const raw=draft[def.id];let value:unknown=old;
  if(raw!==undefined){
   if(!raw.trim())value=null;
   else if(['number','decimal','currency'].includes(def.field_type))value=Number(raw);
   else if(def.field_type==='boolean')value=raw==='true'?true:raw==='false'?false:null;
   else if(['json','multiselect','multi_select'].includes(def.field_type)){try{value=JSON.parse(raw);}catch{throw Error(def.field_label_en+': enter a valid value.');}}
   else if(def.field_type==='datetime'){const date=new Date(raw);value=Number.isNaN(date.getTime())?raw:date.toISOString();}
   else value=raw;
  }
  const error=validateMetadataEntry({...def,field_type:def.field_type==='decimal'?'number':def.field_type},value);
  if(error)throw Error(def.field_label_en+': '+error);
  const field=['number','decimal','currency'].includes(def.field_type)?'value_number':def.field_type==='boolean'?'value_boolean':def.field_type==='date'?'value_date':def.field_type==='datetime'?'value_datetime':['json','multiselect','multi_select'].includes(def.field_type)?'value_json':'value_text';
  return {definition_id:def.id,[field]:value??null} as DmsMetadataValueInput;
 });
}
