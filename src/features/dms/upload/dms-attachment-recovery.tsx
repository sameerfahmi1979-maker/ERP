'use client';
import {useEffect,useRef,useState} from 'react';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {readOriginalAttachmentRequests,attachUploadToExistingDocument,cancelOriginalAttachmentRequest} from '@/server/actions/dms/document-upload-attach';
import {attachmentRecoverySchema,type AttachmentRecovery} from '@/lib/dms/attachment-recovery';
import {Button} from '@/components/ui/button';
type Props={open:boolean;uploadSessionId?:number;documentId?:number;onBlockingChange:(blocked:boolean)=>void;onRecovered:(documentId:number)=>void;onCancelled?:(uploadSessionId:number)=>void};
export function DmsAttachmentRecovery(props:Props){
 const owner=useReadCacheOwner(),live=!!owner?.identity&&owner.isLive()&&owner.admits(owner.identity);
 const identity=JSON.stringify([owner?.identity,owner?.generation,live,props.open,props.uploadSessionId,props.documentId]);
 return <RecoveryPanel key={identity} {...props} live={live} admits={()=>live&&!!owner?.identity&&owner.isLive()&&owner.admits(owner.identity)}/>;
}
function RecoveryPanel({open,uploadSessionId,documentId,onBlockingChange,onRecovered,onCancelled,live,admits}:Props&{live:boolean;admits:()=>boolean}){
 const [data,setData]=useState<AttachmentRecovery|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const [confirmCancel,setConfirmCancel]=useState<string|null>(null);
 const lease=useRef({active:true,flight:false}),callbacks=useRef({onBlockingChange,onRecovered,onCancelled});
 useEffect(()=>{callbacks.current={onBlockingChange,onRecovered,onCancelled};},[onBlockingChange,onRecovered,onCancelled]);
 const current=(activation=lease.current)=>lease.current===activation&&activation.active&&open&&admits();
 async function read(page=1){
  const activation=lease.current;
  if(!current(activation)||activation.flight)return;activation.flight=true;setBusy(true);setError(null);callbacks.current.onBlockingChange(true);
  try{
   const r=await readOriginalAttachmentRequests({...(uploadSessionId!==undefined?{uploadSessionId}:{documentId}),page});if(!current(activation))return;
   const p=r.success?attachmentRecoverySchema.safeParse(r.data):null;
   if(!p?.success||p.data.page!==page||p.data.rows.some(row=>uploadSessionId!==undefined?row.uploadSessionId!==uploadSessionId:!row.unavailable&&row.documentId!==documentId)){setError(r.error??'Original requests unavailable or do not match this selection');return;}
   setData(p.data);callbacks.current.onBlockingChange(p.data.pendingCount>0||uploadSessionId!==undefined&&p.data.totalCount>0);
  }catch{if(current(activation))setError('Original attachment requests could not be read. Do not submit a replacement.');}
  finally{activation.flight=false;if(current(activation))setBusy(false);}
 }
 useEffect(()=>{
  // Strict Mode setup gets a fresh activation; a callback carrying an old
  // activation must never publish into a new one or a different account.
  const activation={active:true,flight:false};lease.current=activation;callbacks.current.onBlockingChange(true);
  if(open&&live)void Promise.resolve().then(()=>{if(current(activation))void read();});
  return()=>{lease.current.active=false;};
  // identity is represented by the wrapper key; no request values are persisted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function retry(row:AttachmentRecovery['rows'][number]){
  const activation=lease.current;
  if(row.unavailable||row.closed||!current(activation)||activation.flight)return;
  activation.flight=true;setBusy(true);setError(null);callbacks.current.onBlockingChange(true);
  try{
   const r=await attachUploadToExistingDocument({uploadSessionId:row.uploadSessionId,documentId:row.documentId,
    changeNotes:row.changeNotes??undefined,versionLabel:row.versionLabel??undefined,allowDuplicate:false});
   if(!current(activation))return;
   const receipt='data' in r?r.data:null;
   if(!r.success||!receipt||receipt.operationId!==row.operationId||receipt.documentId!==row.documentId||receipt.uploadSessionId!==row.uploadSessionId){setError(r.error??'The original attachment remains unconfirmed. Retain this upload and retry the same request.');return;}
   callbacks.current.onRecovered(row.documentId);
  }catch{if(current(activation))setError('Original attachment outcome is unconfirmed. Its request and files are retained.');}
  finally{activation.flight=false;if(current(activation))setBusy(false);}
 }
 async function cancel(row:AttachmentRecovery['rows'][number]){
  const activation=lease.current;
  if(row.unavailable||row.closed||row.completed||confirmCancel!==row.operationId||!current(activation)||activation.flight)return;
  activation.flight=true;setBusy(true);setError(null);callbacks.current.onBlockingChange(true);
  let confirmed=false;
  try{
   const r=await cancelOriginalAttachmentRequest({uploadSessionId:row.uploadSessionId,documentId:row.documentId,operationId:row.operationId});
   if(!current(activation))return;
   if(!r.success||!r.data?.cancelled||r.data.operationId!==row.operationId||r.data.uploadSessionId!==row.uploadSessionId){setError(r.error??'Cancellation remains unconfirmed; read the original request again.');return;}
   confirmed=true;setConfirmCancel(null);callbacks.current.onCancelled?.(row.uploadSessionId);
  }catch{if(current(activation))setError('Cancellation remains unconfirmed. Keep the original request and read it again.');}
  finally{activation.flight=false;if(current(activation)){setBusy(false);if(confirmed)void read(data?.page??1);}}
 }
 if(!open)return null;
 return <section aria-label="Original attachment recovery" className="space-y-2 rounded-md border border-border p-3 text-sm">
  <p className="font-medium">Original attachment requests</p>
  {!live&&<p role="alert">Your account or access scope is changing. Recovery and new attachment are paused.</p>}
  {busy&&!data&&<p role="status">Checking original requests…</p>}
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  {error&&<Button type="button" variant="outline" size="sm" disabled={busy||!live} onClick={()=>void read(data?.page??1)}>Read original requests again</Button>}
  {data&&<>
   {data.pendingCount>0&&<p role="status">{data.pendingCount} original request(s) require reconciliation. New attachment is paused; retries use the original destination and wording.</p>}
   {data.totalCount===0&&<p className="text-muted-foreground">No original attachment request exists for this selection.</p>}
   {data.rows.map(row=><div key={row.operationId} className="space-y-1 border-t border-border pt-2">
    {row.unavailable?<p role="alert">An earlier {row.completed?'completed':'pending'} request is unavailable under your current access. Its wording and target are not disclosed.</p>:<>
     <p className="break-words">{row.originalFilename} — {row.closed?'uncommitted upload cancelled; bytes retained':row.completed?'completion recorded':'outcome not yet confirmed'}</p>
     <p className="whitespace-pre-wrap break-words text-muted-foreground">{row.versionLabel??'No version label'}{row.changeNotes?` · ${row.changeNotes}`:''}</p>
     {!row.closed&&<Button type="button" variant="outline" size="sm" disabled={busy||!live} onClick={()=>void retry(row)}>{row.completed?'Confirm original result':'Retry original attachment'}</Button>}
     {!row.closed&&!row.completed&&(confirmCancel===row.operationId?<div className="space-y-2"><p>This cancels only the uncommitted Inbox upload. The existing document is not archived, and no copied file or original history is deleted. A completed attachment cannot be cancelled here.</p><Button type="button" variant="destructive" size="sm" disabled={busy||!live} onClick={()=>void cancel(row)}>Confirm cancel uncommitted upload</Button><Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>setConfirmCancel(null)}>Keep original request</Button></div>:<Button type="button" variant="outline" size="sm" disabled={busy||!live} onClick={()=>setConfirmCancel(row.operationId)}>Cancel uncommitted request</Button>)}
    </>}
   </div>)}
   {data.totalCount>25&&<div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={busy||data.page<=1} onClick={()=>void read(data.page-1)}>Previous requests</Button><span>Page {data.page} of {Math.ceil(data.totalCount/25)}</span><Button type="button" variant="outline" size="sm" disabled={busy||data.page*25>=data.totalCount} onClick={()=>void read(data.page+1)}>Next requests</Button></div>}
  </>}
 </section>;
}
