'use client';
import {useEffect,useState} from 'react';
import {ERPCombobox} from '@/components/erp/combobox';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {readDmsUploadScopes} from '@/server/actions/dms/upload-scope';
import type {UploadOwningScope} from '@/lib/dms/single-upload-admission';
type Choice=UploadOwningScope&{label:string};
const key=(v:UploadOwningScope)=>v.companyId+':'+(v.branchId??0);
export function DmsUploadScopePicker({value,onChange,disabled=false}:{value:UploadOwningScope|null;onChange:(value:UploadOwningScope)=>void;disabled?:boolean}){
 const owner=useReadCacheOwner();
 const [search,setSearch]=useState(''),[cursors,setCursors]=useState<Array<{companyId:number;branchId:number}|null>>([null]),[retry,setRetry]=useState(0);
 const after=cursors[cursors.length-1];
 const [result,setResult]=useState<{owner:typeof owner;search:string;after:typeof after;retry:number;rows:Choice[];hasMore:boolean;error:string|null}|null>(null);
 const [selected,setSelected]=useState<{owner:typeof owner;choice:Choice}|null>(null);
 const active=!!owner?.identity&&owner.isLive()&&owner.admits(owner.identity);
 const current=active&&result?.owner===owner&&result.search===search&&result.after===after&&result.retry===retry?result:null;
 useEffect(()=>{let live=true;if(!active)return;
  const timer=setTimeout(()=>{void readDmsUploadScopes(search,after).then(r=>{if(live&&owner?.identity&&owner.isLive()&&owner.admits(owner.identity))setResult({owner,search,after,retry,rows:r.success?r.rows:[],hasMore:r.success&&r.hasMore,error:r.success?null:r.error});}).catch(()=>{if(live)setResult({owner,search,after,retry,rows:[],hasMore:false,error:'Permitted upload companies could not be loaded. Retry.'});});},150);
  return()=>{live=false;clearTimeout(timer);};
 },[owner,active,search,after,retry]);
 const rows=current?.rows??[];
 const options=!active?[]:selected?.owner===owner&&value&&key(selected.choice)===key(value)&&!rows.some(r=>key(r)===key(value))?[selected.choice,...rows]:rows;
 return <div className="mb-3 max-w-xl space-y-2" role="group" aria-label="Upload owning company">
  <p className="text-sm font-medium">Owning company / branch <span aria-hidden="true">*</span></p>
  <Input aria-label="Search upload companies" placeholder="Search permitted companies or branches" value={search} maxLength={100} disabled={disabled||!active} onChange={e=>{setSearch(e.target.value);setCursors([null]);}}/>
  <ERPCombobox ariaLabel="Owning company / branch" required value={value?key(value):null} options={options.map(r=>({value:key(r),label:r.label}))} placeholder="Choose the company for this file" disabled={disabled||!current||!!current.error} loading={active&&!current} onValueChange={v=>{const row=rows.find(r=>key(r)===v);if(row&&!disabled&&active){setSelected({owner,choice:row});onChange({companyId:row.companyId,branchId:row.branchId});}}}/>
  {current?.error&&<p role="alert">{current.error} <Button variant="outline" size="sm" onClick={()=>setRetry(n=>n+1)}>Retry companies</Button></p>}
  {current&&!current.error&&!rows.length&&<p className="text-sm text-muted-foreground">No permitted companies match this search.</p>}
  {(cursors.length>1||current?.hasMore)&&<div className="flex gap-2"><Button variant="outline" size="sm" disabled={disabled||cursors.length===1} onClick={()=>setCursors(v=>v.slice(0,-1))}>Previous companies</Button><Button variant="outline" size="sm" disabled={disabled||!current?.hasMore} onClick={()=>{const last=rows.at(-1);if(last)setCursors(v=>[...v,{companyId:last.companyId,branchId:last.branchId??0}]);}}>More companies</Button></div>}
  <p className="text-xs text-muted-foreground">Select the company responsible for this document.</p>
 </div>;
}
