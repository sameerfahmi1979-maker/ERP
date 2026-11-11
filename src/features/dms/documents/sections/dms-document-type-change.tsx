"use client";
import {forwardRef,useId,useImperativeHandle,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {readDocumentTypeChange} from '@/server/actions/dms/document-type-change';
import type {DmsMetadataDefinitionRow,DmsMetadataValueInput,DmsMetadataValueRow} from '@/server/actions/dms/document-metadata-values';
import {initialMetadata,MetadataField} from './dms-document-metadata-section';
import {validateMetadataEntry} from '@/lib/dms/metadata/review-validation';
import {Button} from '@/components/ui/button';

export type TypeChangeReview={snapshot:string;values:DmsMetadataValueInput[]};
export type TypeChangeHandle={review:()=>TypeChangeReview|null};
type Props={documentId:number;documentTypeId:number;disabled:boolean;onDirty:()=>void;draft:string;onDraft:(value:string)=>void};
export const DmsDocumentTypeChange=forwardRef<TypeChangeHandle,Props>(function DmsDocumentTypeChange(props,ref){
 const query=useQuery({queryKey:['dms','type-change',props.documentId,props.documentTypeId],queryFn:async()=>{
  const r=await readDocumentTypeChange(props.documentId,props.documentTypeId);if(!r.success||!r.data)throw new Error(r.error);return r.data;
 },staleTime:0,retry:false,refetchOnWindowFocus:false});
 if(!query.data)return <div role="status" className="space-y-3"><p>{query.isPending?'Loading fields for the selected document type…':'The new document type fields could not be loaded. Your existing document is unchanged.'}</p>{query.isError&&<Button type="button" variant="outline" onClick={()=>void query.refetch()}>Retry loading fields</Button>}</div>;
 return <div className="space-y-3">
  {query.isError&&<p role="alert">The latest field review could not be loaded. Your entries are retained; retry before saving.</p>}
  <TypeChangeFields key={`${props.documentId}:${props.documentTypeId}:${query.data.snapshot}`} ref={ref} {...props} disabled={props.disabled||query.isFetching||query.isError} data={query.data}/>
  <Button type="button" variant="outline" disabled={props.disabled||query.isFetching} onClick={()=>void query.refetch()}>Reload field review</Button>
 </div>;
});

const TypeChangeFields=forwardRef<TypeChangeHandle,Props&{data:{snapshot:string;definitions:DmsMetadataDefinitionRow[];values:DmsMetadataValueRow[]}}>(function TypeChangeFields({data,disabled,onDirty,draft,onDraft},ref){
 const prefix=useId(),body=useRef<HTMLFieldSetElement>(null);
 const [values,setValues]=useState(()=>{
  const initial=initialMetadata(data.definitions,data.values);
  try{const parsed:unknown=JSON.parse(draft);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))for(const id of Object.keys(initial)){const value=(parsed as Record<string,unknown>)[id];if(typeof value==='string')initial[Number(id)]=value;}}catch{/* No valid retained draft. */}
  return initial;
 });
 const [errors,setErrors]=useState<{id:number;label:string;message:string}[]>([]);
 useImperativeHandle(ref,()=>({review(){
  if(disabled)return null;
  const invalid:typeof errors=[];
  const rows=data.definitions.map(def=>{
   const raw=values[def.id]??'',row:DmsMetadataValueInput={definition_id:def.id};
   if(['json','multiselect','multi_select'].includes(def.field_type)){
    try{row.value_json=raw.trim()?JSON.parse(raw):null;}catch{invalid.push({id:def.id,label:def.field_label_en,message:'Enter valid JSON or clear the optional field.'});}
   }else if(['number','currency'].includes(def.field_type))row.value_number=raw.trim()?Number(raw):null;
   else if(def.field_type==='boolean')row.value_boolean=raw==='true';
   else if(def.field_type==='date')row.value_date=raw||null;
   else if(def.field_type==='datetime')row.value_datetime=raw&&!Number.isNaN(new Date(raw).getTime())?new Date(raw).toISOString():raw||null;
   else row.value_text=raw||null;
   const message=validateMetadataEntry(def,row.value_text??row.value_number??row.value_date??row.value_datetime??row.value_boolean??row.value_json);
   if(message)invalid.push({id:def.id,label:def.field_label_en,message});return row;
  });
  setErrors(invalid);
  if(invalid.length){body.current?.querySelector<HTMLElement>(`[data-metadata-id="${invalid[0].id}"]`)?.focus();return null;}
  return {snapshot:data.snapshot,values:rows};
 }}));
 return <div className="space-y-4">
  <p className="font-medium">Complete metadata for the new document type</p>
  <p className="text-sm text-muted-foreground">Enter the required fields, then save. The document type and these values will be saved together. Existing files and metadata history are retained.</p>
  {errors.length>0&&<div role="alert" className="rounded-md border border-destructive p-3">{errors.map(error=><p key={error.id}>{error.label}: {error.message}</p>)}</div>}
  <fieldset ref={body} disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
   {data.definitions.map(def=><MetadataField key={def.id} id={`${prefix}-${def.id}`} def={def} value={values[def.id]??''} onChange={value=>{if(disabled)return;const next={...values,[def.id]:value};setValues(next);onDraft(JSON.stringify(next));setErrors(old=>old.filter(e=>e.id!==def.id));onDirty();}}/>)}
  </fieldset>
 </div>;
});
