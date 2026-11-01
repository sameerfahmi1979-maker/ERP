"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useReadCacheOwner} from "@/components/layout/read-cache-boundary";
import {ERPChildDialogForm} from "@/components/erp/erp-child-dialog-form";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {getDmsApprovalRouting,changeDmsApprovalRouting} from "@/server/actions/dms/document-preparation";
type Routing=NonNullable<Awaited<ReturnType<typeof getDmsApprovalRouting>>["data"]>;
type Request={documentId:number;approvalId:number;requestId:string;snapshot:string;action:"reassign"|"delegate";profileIds:number[];reason:string};
export function DmsApprovalRouting({documentId,onChanged}:{documentId:number;onChanged:()=>void}){
 const owner=useReadCacheOwner();
 if(!owner?.identity||!owner.isLive())return null;
 return <RoutingSession key={`${documentId}:${owner.identity.authUserId}:${owner.identity.scopeVersion}:${owner.generation}`} documentId={documentId} onChanged={onChanged}/>;
}
function RoutingSession({documentId,onChanged}:{documentId:number;onChanged:()=>void}){
 const owner=useReadCacheOwner(),mounted=useRef(true),pending=useRef(false),request=useRef<Request|null>(null);
 const [data,setData]=useState<Routing|null>(null),[open,setOpen]=useState(false),[ids,setIds]=useState<number[]>([]),[reason,setReason]=useState(""),[mode,setMode]=useState<"reassign"|"delegate">("reassign"),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState<string|null>(null);
 const live=useCallback(()=>mounted.current&&!!owner?.isLive(),[owner]);
 const read=useCallback(async()=>{try{const r=await getDmsApprovalRouting(documentId);if(!live())return;if(r.success&&r.data){setData(r.data);setMessage(null);}else{setData(null);setMessage(r.error??"Approval routing unavailable.");}}catch{if(live()){setData(null);setMessage("Approval routing unavailable.");}}},[documentId,live]);
 useEffect(()=>{mounted.current=true;let retired=false;
  void getDmsApprovalRouting(documentId).then(r=>{if(retired||!live())return;if(r.success&&r.data){setData(r.data);setMessage(null);}else{setData(null);setMessage(r.error??"Approval routing unavailable.");}},()=>{if(!retired&&live()){setData(null);setMessage("Approval routing unavailable.");}});
  return()=>{retired=true;mounted.current=false;};
 },[documentId,live]);
 const save=async()=>{
  if(!data?.snapshot||!data.approvalId||pending.current)return;pending.current=true;setBusy(true);
  request.current??={documentId,approvalId:data.approvalId,requestId:crypto.randomUUID(),snapshot:data.snapshot,action:mode,profileIds:ids,reason};
  try{const r=await changeDmsApprovalRouting(request.current);if(!live())return;if(r.success){request.current=null;setUncertain(false);setOpen(false);setIds([]);setReason("");await read();onChanged();}else{setUncertain(r.uncertain===true);if(!r.uncertain)request.current=null;setMessage(r.error??"Assignment was not changed.");}}
  catch{if(live()){setUncertain(true);setMessage("Assignment save is unconfirmed. Recover the same request before editing.");}}
  finally{pending.current=false;if(live())setBusy(false);}
 };
 return <div className="text-sm space-y-2">{message&&<p role="status">{message}</p>}{data&&data.state!=="not_pending"&&<><p>Named reviewers: {data.assignees.map(p=>`${p.label}${p.eligible?"":" (authority held)"}`).join(", ")||"Mapping review required"}.</p><p className="text-xs text-muted-foreground">{data.decisionRule==="all_assigned"?"Every assigned reviewer must approve.":"One assigned independent reviewer may approve."} Notification readiness: {data.notificationReadiness.replaceAll("_"," ")}.</p>{(data.canReassign||data.canDelegate)&&<Button type="button" size="sm" variant="outline" onClick={()=>{setMode(data.canReassign?"reassign":"delegate");setIds(data.canReassign?data.assignees.map(p=>p.id):[]);setOpen(true);}}>Change reviewer assignment</Button>}</>}
  <ERPChildDialogForm open={open} onOpenChange={setOpen} title="Change approval assignment" mode="edit" isDirty={reason.length>0} isSubmitting={busy} closeDisabled={busy||uncertain} onSubmit={save} submitLabel={uncertain?"Recover original assignment save":"Save assignment"} submitDisabled={busy||(!uncertain&&(!ids.length||reason.trim().length<5))} onCancel={()=>{setReason("");setIds([]);}}>
   <div className="space-y-3"><p className="text-xs text-muted-foreground">The original submitter, workflow, source and recorded votes remain unchanged. No user gains a role or additional document access.</p>{message&&<p role="status">{message}</p>}<fieldset disabled={busy||uncertain} className="space-y-3">{data?.canReassign&&data.canDelegate&&<label className="block">Action<select className="block rounded border bg-background text-foreground p-2" value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setIds([]);}}><option value="reassign">Reassign reviewers</option><option value="delegate">Delegate my pending decision</option></select></label>}
   <label className="block">Eligible named reviewers<select id="approval-reviewers" name="approval-reviewers" required aria-label="Eligible named reviewers" multiple={mode==="reassign"} className="block w-full rounded border bg-background text-foreground p-2 min-h-24" value={mode==="reassign"?ids.map(String):String(ids[0]??"")} onChange={e=>setIds(Array.from(e.target.selectedOptions).map(o=>Number(o.value)).filter(Boolean))}>{mode==="delegate"&&<option value="">Choose a delegate</option>}{data?.options.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
   <label className="block">Assignment change reason<Input id="assignment-reason" name="assignment-reason" required minLength={5} value={reason} onChange={e=>setReason(e.target.value)}/></label></fieldset></div>
  </ERPChildDialogForm>
 </div>;
}
