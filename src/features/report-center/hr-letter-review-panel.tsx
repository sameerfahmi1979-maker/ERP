'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {hrLetterReview} from '@/server/actions/output/hr-letter-reviews';
import {LETTER_REVIEW_FIELDS,letterReviewRequest,type LetterReviewRequest,type LetterReviewRow} from '@/lib/official-documents/hr-source-review';
import {HrLetterSourceSelector} from './hr-letter-source-selector';
type Code=LetterReviewRequest['code'];
type Option={id:number;label:string;version?:number};

/** No local storage of confidential facts. The database retains accepted requests;
 * unknown replies lock this form to its original identity until reconciled. */
export function HrLetterReviewPanel({employeeId,code,value,disabled,onChange,onPending,onDirty}:{employeeId:number;code:Code;value:string;disabled:boolean;onChange:(id:string)=>void;onPending:(pending:boolean)=>void;onDirty:(dirty:boolean)=>void}){
 const owner=useReadCacheOwner(),identity=JSON.stringify([owner?.identity,owner?.generation]),lifetime=useRef(identity),ownerRef=useRef(owner);useLayoutEffect(()=>{lifetime.current=identity;ownerRef.current=owner;},[identity,owner]);
 const [rows,setRows]=useState<LetterReviewRow[]>([]),[after,setAfter]=useState(0),[refresh,setRefresh]=useState(0),[more,setMore]=useState(false);
 const [evidence,setEvidence]=useState<Option[]>([]),[receivers,setReceivers]=useState<Option[]>([]);
 const [evidenceAfter,setEvidenceAfter]=useState(0),[receiverAfter,setReceiverAfter]=useState(0);
 const [source,setSource]=useState(''),[doc,setDoc]=useState<Option|null>(null),[receiver,setReceiver]=useState<Option|null>(null),[facts,setFacts]=useState<Record<string,string>>({});
 const [pending,setPending]=useState<Parameters<typeof hrLetterReview>[0]|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[attested,setAttested]=useState(false);
 const inFlight=useRef(false),alive=useRef(false),[loadedKey,setLoadedKey]=useState('');
 const queryKey=JSON.stringify([employeeId,code,after,refresh,identity]),ready=loadedKey===queryKey;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{onDirty(!!source||!!doc||!!receiver||Object.keys(facts).length>0);},[source,doc,receiver,facts,onDirty]);
 useEffect(()=>{onPending(busy||pending!==null);},[busy,pending,onPending]);
 useEffect(()=>{
  let active=true;
  void hrLetterReview({employeeId,code,action:'list',after}).then(r=>{if(!active||ownerRef.current?.isLive()===false||lifetime.current!==identity)return;if(r.success&&'rows'in r){setRows(r.rows!.slice(0,25));setMore(r.rows!.length>25);setLoadedKey(queryKey);}else setMessage('Reviews could not be loaded. Retry before continuing.');});
  return()=>{active=false;};
 },[employeeId,code,after,refresh,identity,queryKey]);
 useEffect(()=>{
  let active=true;void hrLetterReview({employeeId,code,action:'options',kind:'evidence',after:evidenceAfter}).then(r=>{if(!active||ownerRef.current?.isLive()===false||lifetime.current!==identity)return;if(r.success&&'options'in r)setEvidence(r.options!);else setMessage('Evidence could not be loaded. Use Refresh to retry.');});return()=>{active=false;};
 },[employeeId,code,evidenceAfter,refresh,identity]);
 useEffect(()=>{
  let active=true;if(code==='HR_HANDOVER_FORM')void hrLetterReview({employeeId,code,action:'options',kind:'receiver',after:receiverAfter}).then(r=>{if(!active||ownerRef.current?.isLive()===false||lifetime.current!==identity)return;if(r.success&&'options'in r)setReceivers(r.options!);else setMessage('Receiving employees could not be loaded. Use Refresh to retry.');});return()=>{active=false;};
 },[employeeId,code,receiverAfter,refresh,identity]);
 async function send(command:Parameters<typeof hrLetterReview>[0]){
  if(inFlight.current||disabled||!alive.current||ownerRef.current?.isLive()===false||lifetime.current!==identity)return;inFlight.current=true;setBusy(true);setPending(command);setMessage('Saving the original source review…');
  try{const r=await hrLetterReview(command);if(!alive.current||ownerRef.current?.isLive()===false||lifetime.current!==identity)return;
   if(!r.success){if(!r.uncertain)setPending(null);setMessage(r.error);return;}
   setPending(null);setRefresh(v=>v+1);setMessage('Source review recorded. Approved reviews can be selected for the letter.');setAttested(false);
  }catch{if(alive.current&&ownerRef.current?.isLive()!==false&&lifetime.current===identity)setMessage('Response unconfirmed. Retry this original request; its values are retained.');}
  finally{inFlight.current=false;if(alive.current&&ownerRef.current?.isLive()!==false&&lifetime.current===identity)setBusy(false);}
 }
 function submit(){
  const parsed=letterReviewRequest.safeParse({employeeId,code,sourceId:code==='HR_HANDOVER_FORM'?employeeId:Number(source),receiverId:receiver?.id??null,documentId:doc?.id,versionId:doc?.version,facts,operationId:crypto.randomUUID()});
  if(!parsed.success||!attested){setMessage('Select the original record and evidence, complete all particulars and confirm they match the evidence.');return;}
  void send({employeeId,code,action:'submit',submission:parsed.data});
 }
 const locked=disabled||busy||pending!==null;
 return <div className="space-y-3 rounded-sm border p-3 text-sm">
  <p className="font-semibold">Verified letter particulars</p>
  <p>Choose an approved review, or prepare particulars from the linked evidence for a different authorised reviewer. This does not clear stock or financial obligations.</p>
  {message&&<p role="status">{message}</p>}
  {pending&&<Button type="button" disabled={busy||disabled} onClick={()=>void send(pending)}>Retry original review request</Button>}
  <div className="space-y-2">{(ready?rows:[]).map(row=><details key={row.id} className="rounded-sm border p-2">
   <summary>Review {row.id} · {row.status} · {new Date(row.created_at).toLocaleDateString()}</summary>
   <p>Source {row.source_id} · Evidence record {row.document_id}, version {row.version_id}</p>
   <dl>{Object.entries(row.facts).map(([key,text])=><div key={key}><dt className="font-medium">{LETTER_REVIEW_FIELDS[code].find(f=>f.key===key)?.labelEn??key}</dt><dd dir={key.endsWith('_ar')?'rtl':undefined} className="whitespace-pre-wrap break-words">{text}</dd></div>)}</dl>
   {row.status==='approved'?<Button type="button" disabled={locked||!ready} onClick={()=>onChange(String(row.id))}>{value===String(row.id)?'Selected':'Use reviewed particulars'}</Button>:row.status==='pending'&&<div className="flex flex-wrap gap-2"><Button type="button" disabled={locked} onClick={()=>void send({employeeId,code,action:'approve',id:row.id})}>Approve evidence match</Button><Button type="button" variant="outline" disabled={locked} onClick={()=>void send({employeeId,code,action:'reject',id:row.id})}>Reject</Button></div>}
  </details>)}</div>
  <p>{value?`Selected review ${value}`:'No approved review selected.'}</p>
  <div className="flex gap-2"><Button type="button" variant="outline" disabled={locked||after===0} onClick={()=>setAfter(0)}>First reviews</Button><Button type="button" variant="outline" disabled={locked||!ready||!more} onClick={()=>setAfter(rows.at(-1)!.id)}>More reviews</Button><Button type="button" variant="outline" disabled={locked} onClick={()=>setRefresh(v=>v+1)}>Refresh</Button></div>
  <details><summary>Prepare a source review</summary><fieldset disabled={locked} className="mt-3 space-y-3">
   {code!=='HR_HANDOVER_FORM'&&<HrLetterSourceSelector employeeId={employeeId} code={code} value={source} disabled={locked} onChange={setSource}/>}
   <label className="block">Linked evidence<select aria-label="Linked evidence" value={doc?.id??''} onChange={e=>setDoc(evidence.find(o=>o.id===Number(e.target.value))??null)} className="w-full border bg-background p-2"><option value="">Choose evidence</option>{doc&&!evidence.some(o=>o.id===doc.id)&&<option value={doc.id}>{doc.label}</option>}{evidence.slice(0,25).map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
   <div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>setEvidenceAfter(0)}>First evidence</Button><Button type="button" variant="outline" disabled={evidence.length<=25} onClick={()=>setEvidenceAfter(evidence[24].id)}>More evidence</Button></div>
   {code==='HR_HANDOVER_FORM'&&<><label className="block">Receiving employee<select aria-label="Receiving employee" value={receiver?.id??''} onChange={e=>setReceiver(receivers.find(o=>o.id===Number(e.target.value))??null)} className="w-full border bg-background p-2"><option value="">Choose receiver</option>{receiver&&!receivers.some(o=>o.id===receiver.id)&&<option value={receiver.id}>{receiver.label}</option>}{receivers.slice(0,25).map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label><div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>setReceiverAfter(0)}>First employees</Button><Button type="button" variant="outline" disabled={receivers.length<=25} onClick={()=>setReceiverAfter(receivers[24].id)}>More employees</Button></div></>}
   {LETTER_REVIEW_FIELDS[code].map(field=><label key={field.key} className="block">{field.labelEn}<Input type={field.type} maxLength={field.maxLength} value={facts[field.key]??''} dir={field.key.endsWith('_ar')?'rtl':undefined} onChange={e=>setFacts(v=>({...v,[field.key]:e.target.value}))}/></label>)}
   <label className="flex gap-2"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/>These particulars match the retained evidence. They do not infer any unrecorded approval or payment.</label>
   <Button type="button" onClick={submit}>Submit for independent source review</Button>
  </fieldset></details>
 </div>;
}
