'use client';
import{useState}from'react';import{useQuery}from'@tanstack/react-query';
import{ERPCombobox}from'@/components/erp/combobox';import{Button}from'@/components/ui/button';import{useReadLifetime}from'@/hooks/use-read-lifetime';
import{readClearanceEvidenceChoices,readClearanceHistory}from'@/server/actions/hr/clearance-evidence';
export function ClearanceEvidenceChoice({employee,identity,document,version,disabled,onValue,onDenied}:{employee:number;identity:string;document:string;version:string;disabled:boolean;onValue:(document:string,version:string)=>void;onDenied:()=>void}){
 const[search,setSearch]=useState(''),[after,setAfter]=useState(0),life=useReadLifetime(`${identity}:${employee}:clearance-evidence`);
 const q=useQuery({queryKey:['hr','f12-clearance-evidence',identity,employee,search,after],enabled:life.enabled&&!disabled,gcTime:0,retry:false,refetchOnWindowFocus:false,queryFn:async()=>{const r=await readClearanceEvidenceChoices({employee,search,after});if(!life.active)throw Error('Opening retired.');if(!r.success){if(r.denied)onDenied();throw Error(r.error);}return r;}});
 const options=(q.data?.rows??[]).map(row=>({value:String(row.id),label:row.label}));
 if(document&&!options.some(row=>row.value===document))options.unshift({value:document,label:`Recorded evidence #${document}, version ${version} — revalidation required`});
 return <div><ERPCombobox ariaLabel="Clearance evidence"value={document}options={options}allowClear disabled={disabled||!life.enabled||q.isPending||q.isError}filterFn={()=>true}onSearchQueryChange={text=>{setSearch(text);setAfter(0);}}onValueChange={value=>{if(!life.active||disabled)return;if(!value){onValue('','');return;}const row=q.data?.rows.find(row=>String(row.id)===String(value));if(row)onValue(String(row.id),String(row.version_id));}}/>
  {q.isError&&<><p role="alert">{q.error.message}</p><Button type="button"variant="outline"disabled={disabled||q.isFetching}onClick={()=>void q.refetch()}>Retry evidence choices</Button></>}
  {q.data?.hasMore&&<Button type="button"variant="outline"disabled={disabled}onClick={()=>setAfter(q.data.rows.at(-1)!.id)}>More evidence</Button>}{after>0&&<Button type="button"variant="outline"disabled={disabled}onClick={()=>setAfter(0)}>First evidence</Button>}
  <p className="text-xs text-muted-foreground">Optional while pending; required before HR completion. Saving binds the selected current file version. This is not a stock, IT or Finance confirmation.</p>
 </div>;
}
export function ClearanceHistory({employee,caseId,item,identity,onDenied}:{employee:number;caseId:number;item:number;identity:string;onDenied:()=>void}){
 const[after,setAfter]=useState(0),life=useReadLifetime(`${identity}:${employee}:${caseId}:${item}:clearance-history`);
 const q=useQuery({queryKey:['hr','f12-clearance-history',identity,employee,caseId,item,after],enabled:life.enabled,gcTime:0,retry:false,refetchOnWindowFocus:false,queryFn:async()=>{const r=await readClearanceHistory({employee,caseId,item,after});if(!life.active)throw Error('Opening retired.');if(!r.success){if(r.denied)onDenied();throw Error(r.error);}return r;}});
 if(!life.enabled)return null;
 return <section aria-label="Clearance history"className="space-y-2 text-sm"><h3 className="font-medium">Clearance history</h3>{q.isPending?<p role="status">Loading original history…</p>:q.isError?<><p role="alert">{q.error.message}</p><Button type="button"variant="outline"onClick={()=>void q.refetch()}>Retry clearance history</Button></>:<>
 <ol className="space-y-1">{q.data.rows.map(row=><li key={row.id}>Revision {row.revision} · {row.action} · {row.status} · user #{row.actor_profile_id} · {row.created_at}{row.document_id!==null?` · evidence #${row.document_id}, version ${row.version_id}`:''}</li>)}</ol>
 {!q.data.rows.length&&<p>No evidence history is recorded on this page. Earlier legacy proof has not been inferred.</p>}
 {q.data.hasMore&&<Button type="button"variant="outline"onClick={()=>setAfter(q.data.rows.at(-1)!.id)}>More clearance history</Button>}{after>0&&<Button type="button"variant="outline"onClick={()=>setAfter(0)}>First history</Button>}</>}
 </section>;
}
