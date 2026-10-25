'use client';
import {useCallback,useMemo,useState} from 'react';
import dynamic from 'next/dynamic';
import {useQuery} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ERPCombobox} from '@/components/erp/combobox';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {useReadLifetime} from '@/hooks/use-read-lifetime';
import {readSubjectPhotos} from '@/server/actions/hr/subject-photo';
import {readPhotoDocumentTypes,readPhotoFramingSource,readSavedSubjectPhoto} from '@/server/actions/hr/photo-controls';
import {defaultPhotoCrop,parsePhotoFraming,type PhotoSource} from '@/lib/hr/photo-framing';
import type {SubjectPhotoDraft} from './use-subject-photo-draft';
import {PhotoThumbnail} from './photo-thumbnail';
const Editor=dynamic(()=>import('./photo-framing-editor'),{ssr:false,loading:()=> <p>Loading photo controls…</p>});
type Props={employee:number|null;dependent?:number|null;subject?:'employee'|'dependent';identity:string;value:number|null;disabled:boolean;onValue:(id:number|null)=>void;
 framing?:string;onFraming?:(frame:string,pending?:boolean)=>void;draft?:SubjectPhotoDraft};
export function SubjectPhoto(props:Props){return <Photo key={props.identity+':'+(props.subject??'employee')} {...props}/>;}
/** Read-only dependent cards hydrate private photos only on explicit opening. */
export function SubjectPhotoReadOnly(props:Pick<Props,'employee'|'dependent'|'subject'|'identity'>){
 const [open,setOpen]=useState(false);
 return <div className="mt-2"><Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'Hide photo':'View photo'}</Button>{open&&<ReadOnlyPhoto {...props}/>}</div>;
}
function ReadOnlyPhoto(props:Pick<Props,'employee'|'dependent'|'subject'|'identity'>){
 const life=useReadLifetime(props.identity+':readonly-photo:'+props.employee+':'+props.dependent);
 const read=useQuery({queryKey:['hr','readonly-photo',props.identity,props.employee,props.dependent],enabled:life.enabled,gcTime:0,staleTime:0,retry:false,queryFn:async()=>{const result=await readSavedSubjectPhoto({employee:props.employee,dependent:props.dependent??null});if(!life.active||!result.success)throw Error('Photo unavailable or restricted.');return result;}});
 if(!life.enabled)return null;
 if(read.isError)return <p role="alert">Photo unavailable or restricted.</p>;
 if(!read.isSuccess||read.isFetching)return <p role="status">Checking photo…</p>;
 return <SubjectPhoto {...props} disabled value={read.data.documentId} framing={read.data.framing?JSON.stringify(read.data.framing):''} onValue={()=>{}}/>;
}
function Photo({employee,dependent=null,subject,identity,value,disabled,onValue,framing='',onFraming,draft}:Props){
 const [search,setSearch]=useState(''),[after,setAfter]=useState(0),[failed,setFailed]=useState<string|null>(null),[error,setError]=useState('');
 const [editor,setEditor]=useState<{source:PhotoSource;url:string}|null>(null),life=useReadLifetime(identity+':'+employee+':'+dependent+':photo');
 const saved=!!employee&&(subject!=='dependent'||!!dependent),locked=disabled||draft?.busy||!!draft?.retained||draft?.blocked;
 const selected=useQuery({queryKey:['hr','subject-photo',identity,employee,dependent,value],enabled:life.enabled&&saved&&value!==null,gcTime:0,staleTime:0,retry:false,refetchOnWindowFocus:false,queryFn:async()=>{const r=await readSubjectPhotos({employee,dependent,document:value});if(!life.active)throw Error('Photo opening retired.');if(!r.success)throw Error(r.error);return r.rows.find(x=>x.document_id===value)??null;}});
 const choices=useQuery({queryKey:['hr','subject-photo-choices',identity,employee,dependent,search,after],enabled:life.enabled&&saved&&!disabled,gcTime:0,staleTime:0,retry:false,refetchOnWindowFocus:false,queryFn:async()=>{const r=await readSubjectPhotos({employee,dependent,document:null,search,after});if(!life.active)throw Error('Photo opening retired.');if(!r.success)throw Error(r.error);return r;}});
 const state=useQuery({queryKey:['hr','subject-photo-state',identity,employee,dependent,value,framing],enabled:life.enabled&&saved&&value!==null,gcTime:0,staleTime:0,retry:false,queryFn:async()=>{const r=await readSavedSubjectPhoto({employee,dependent});if(!life.active||!r.success)throw Error('Photo access unavailable.');return r;}});
 const types=useQuery({queryKey:['hr','photo-types',identity],enabled:life.enabled&&!!draft&&!disabled,gcTime:0,staleTime:0,retry:false,queryFn:async()=>{const r=await readPhotoDocumentTypes();if(!life.active||!r.success)throw Error(r.success?'Photo opening retired.':r.error);return r.rows;}});
 const options=(choices.data?.rows??[]).map(x=>({value:x.document_id,label:x.label}));
 if(value!==null&&!options.some(x=>x.value===value))options.unshift({value,label:!selected.isError?selected.data?.label??'Recorded photo #'+value+' (revalidation required)':'Recorded photo #'+value+' (revalidation required)'});
 const token=selected.isSuccess&&!selected.isFetching&&selected.data?[selected.data.document_id,selected.data.version_id,selected.data.file_id].join(':'):null;
 const label=subject==='dependent'||dependent!==null?'Dependent photo':'Employee photo';
 const preview=draft?.local?.url??(token&&token!==failed?'/api/dms/file?fileId='+selected.data!.file_id+'&disposition=inline':null);
 const previewFailed=useCallback(()=>setFailed(token??'local'),[token]);
 const parsedFrame=useMemo(()=>{try{return {frame:parsePhotoFraming(framing),invalid:false};}catch{return {frame:null,invalid:true};}},[framing]);
 const frame=parsedFrame.frame;
 const staleFrame=!!frame&&!draft?.local&&!!selected.data&&(frame.source.documentId!==selected.data.document_id||frame.source.versionId!==selected.data.version_id||frame.source.fileId!==selected.data.file_id);
 const download=saved&&!staleFrame&&!parsedFrame.invalid&&state.isSuccess&&!state.isFetching&&state.data.canDownload&&state.data.documentId===value;
 const url='/api/hr/subject-photo?employee='+employee+(dependent?'&dependent='+dependent:'');
 if(!life.enabled)return null;
 const act=async(work:()=>Promise<void>)=>{try{setError('');await work();}catch(e){if(life.active)setError(e instanceof Error?e.message:'Photo controls unavailable.');}};
 return <section className="space-y-2"><Label>{label}</Label><div className="flex flex-wrap items-start gap-3">
 {preview&&failed!=='local'?<PhotoThumbnail url={preview} frame={staleFrame?null:frame} label={label} onError={previewFailed}/>:<div className="flex h-28 w-24 items-center justify-center rounded border border-border text-center text-xs text-muted-foreground">{value===null?'No photo':selected.isFetching?'Checking photo…':'Photo unavailable'}</div>}
 <div className="min-w-0 flex-1 space-y-2">
 {!saved&&<p className="text-sm text-muted-foreground">{draft?'Choose a photo here. Save creates the person first, then finishes the photo.':'Save the person first to select a linked private photo.'}</p>}
 {saved&&!disabled&&<><ERPCombobox ariaLabel={label} value={value} options={options} allowClear disabled={!!locked||choices.isPending||choices.isError||!!draft?.local} filterFn={()=>true} onSearchQueryChange={v=>{setSearch(v);setAfter(0);}} onValueChange={v=>{if(life.active){onValue(v?Number(v):null);onFraming?.('');setFailed(null);setEditor(null);}}}/>
 {choices.data?.hasMore&&<Button type="button" variant="outline" onClick={()=>setAfter(choices.data.rows.at(-1)!.document_id)}>More photos</Button>}{after>0&&<Button type="button" variant="outline" onClick={()=>setAfter(0)}>First photos</Button>}</>}
 {draft&&!disabled&&<>
 <label className="block text-sm">{value?'Replace photo':'Upload photo'}<Input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled||draft.busy} onChange={e=>{const f=e.target.files?.[0];if(f)void act(async()=>{const source=await draft.choose(f);if(!life.active)return;setFailed(null);onFraming?.(JSON.stringify(draft.retained?.framing??{version:1,source,rotation:0,crop:defaultPhotoCrop(source)}),true);});e.target.value='';}}/></label>
 {(draft.local||draft.retained)&&<div className="space-y-2"><ERPCombobox ariaLabel="Photo document type" value={draft.typeId} options={(types.data??[]).map(t=>({value:t.id,label:t.type_code+' — '+t.name_en}))} disabled={!!locked||types.isError} onValueChange={v=>draft.setTypeId(v?Number(v):null)}/>
 {types.data?.find(t=>t.id===draft.typeId)?.requires_expiry_tracking&&<label className="block text-sm">Photo document expiry<Input type="date" required value={draft.expiry} disabled={!!locked} onChange={e=>draft.setExpiry(e.target.value)}/></label>}
 {types.isSuccess&&types.data.length===0&&<p role="alert">No permitted photo document type is configured. An administrator must configure a suitable type before upload.</p>}
 <p className="text-xs text-muted-foreground">{draft.retained?.receipt?'Photo uploaded; profile update pending. Retry Save.':draft.retained?'Upload retained. Retry Save with the same file to finish safely.':'Photo and framing are unsaved. Use the form’s Save button.'}</p></div>}
 {draft.details&&<div className="space-y-2"><p className="text-sm">Complete the required photo details, then use Save again.</p>{draft.details.definitions.filter(d=>d.is_required).map(def=>{
  const existing=draft.details!.values.find(v=>v.definition_id===def.id),old=existing?.value_text??existing?.value_number??existing?.value_date??existing?.value_datetime??existing?.value_boolean??existing?.value_json;
  const value=draft.detailsDraft[def.id]??(old==null?'':typeof old==='object'?JSON.stringify(old):String(old));
  const frozen=disabled||draft.busy||draft.blocked||!!draft.retained?.metadata;
  const options=Array.isArray(def.options_json)?def.options_json:(def.options_json as {values?:unknown;options?:unknown}|null)?.values??(def.options_json as {options?:unknown}|null)?.options;
  const choices=Array.isArray(options)?options.filter((x):x is string=>typeof x==='string'):[];
  const props={value,disabled:frozen,'aria-label':def.field_label_en,required:true,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>draft.setDetail(def.id,e.target.value)};
  return <label key={def.id} className="block text-sm">{def.field_label_en} *
   {def.field_type==='boolean'||def.field_type==='select'?<select {...props} className="w-full rounded-sm border border-input bg-background p-2 text-foreground"><option value="">Select…</option>{(def.field_type==='boolean'?['true','false']:choices).map(v=><option key={v} value={v}>{def.field_type==='boolean'?(v==='true'?'Yes':'No'):v}</option>)}</select>
   :['multiselect','multi_select'].includes(def.field_type)?<select disabled={frozen} aria-label={def.field_label_en} required multiple className="w-full rounded-sm border border-input bg-background p-2 text-foreground" value={(()=>{try{const v:unknown=JSON.parse(value||'[]');return Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];}catch{return [];}})()} onChange={e=>draft.setDetail(def.id,JSON.stringify(Array.from(e.target.selectedOptions,x=>x.value)))}>{choices.map(v=><option key={v}>{v}</option>)}</select>
   :['textarea','json'].includes(def.field_type)?<Textarea {...props}/>:<Input {...props} step="any" type={['number','decimal','currency'].includes(def.field_type)?'number':def.field_type==='date'?'date':def.field_type==='datetime'?'datetime-local':'text'}/>}
   {def.help_text_en&&<span className="block text-xs text-muted-foreground">{def.help_text_en}</span>}
  </label>;
 })}</div>}
 </>}
 <div className="flex flex-wrap gap-2">
 {onFraming&&!locked&&preview&&<Button type="button" variant="outline" onClick={()=>void act(async()=>{const source=draft?.local?.source??(await readPhotoFramingSource({employee,dependent,document:value}));if(!life.active)return;if('success' in source){if(!source.success)throw Error(source.error);setEditor({source:source.source,url:preview});}else setEditor({source,url:preview});})}>Adjust framing</Button>}
 {!locked&&(value!==null||draft?.local)&&<Button type="button" variant="outline" onClick={()=>void act(async()=>{draft?.discard();onValue(null);onFraming?.('',false);setEditor(null);setFailed(null);})}>Remove photo</Button>}
 {download&&<><a className="text-sm text-primary underline" href={url+'&mode=download'}>Download saved photo</a><a className="text-sm text-primary underline" href={url+'&mode=original'}>Download original</a></>}
 {saved&&<Button type="button" variant="outline" size="sm" onClick={()=>{setFailed(null);void selected.refetch();if(value!==null)void state.refetch();if(!disabled)void choices.refetch();}}>Refresh permitted photos</Button>}
 </div>
 <p className="text-xs text-muted-foreground">Saved with this form. Removing a photo does not delete its original document. Downloads use the last saved photo.</p>
 {staleFrame&&<p role="alert" className="text-sm text-destructive">The original photo version changed. Review its framing before saving or downloading.</p>}
 {parsedFrame.invalid&&<p role="alert" className="text-sm text-destructive">The retained framing is invalid. Adjust the current photo before saving.</p>}
 {(selected.isError||choices.isError||state.isError||types.isError||token===failed&&token!==null||error||draft?.blocked)&&<p role="alert" className="text-sm text-destructive">{error||'Photo unavailable or restricted. The recorded selection is retained.'}</p>}
 </div></div>
 {editor&&!locked&&<Editor url={editor.url} source={editor.source} initial={frame?.source.sha256===editor.source.sha256?frame:null} onCancel={()=>setEditor(null)} onApply={v=>{if(life.active){onFraming?.(JSON.stringify(v),!!draft?.local);setEditor(null);}}}/ >}
 </section>;
}
