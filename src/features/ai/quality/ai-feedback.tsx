'use client';
import {useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {ERPChildDialogForm} from '@/components/erp/erp-child-dialog-form';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {submitAiFeedback} from '@/server/actions/ai/quality';
import {feedbackCategories,type QualitySource} from '@/lib/ai/quality/contracts';
export function AiFeedback({source}:{source:QualitySource}){
 const owner=useReadCacheOwner();if(!owner?.identity||!owner.isLive())return null;
 return <FeedbackSession key={`${source.kind}:${source.id}:${source.documentId}:${owner.identity.authUserId}:${owner.generation}`} source={source} live={()=>owner.isLive()}/>;
}
function FeedbackSession({source,live}:{source:QualitySource;live:()=>boolean}){
 const [open,setOpen]=useState(false),[category,setCategory]=useState<typeof feedbackCategories[number]>('incorrect_value'),[correction,setCorrection]=useState(''),[shared,setShared]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState('');
 const request=useRef<Parameters<typeof submitAiFeedback>[0]|null>(null),pending=useRef(false);
 const save=async()=>{if(pending.current)return;pending.current=true;setBusy(true);request.current??={source,requestId:crypto.randomUUID(),category,correction,shareForReview:shared};
  try{const r=await submitAiFeedback(request.current);if(!live())return;if(r.success){request.current=null;setUncertain(false);setCorrection('');setMessage(`Feedback AI-FB-${String(r.data.id).padStart(6,'0')} retained for review. Business records and AI rules were not changed.`);setOpen(false);}else{setUncertain(r.uncertain);if(!r.uncertain)request.current=null;setMessage(r.error);}}
  catch{if(live()){setUncertain(true);setMessage('Feedback is unconfirmed. Recover this same request before editing.');}}finally{pending.current=false;if(live())setBusy(false);}
 };
 return <div className="mt-2 space-y-1"><Button type="button" variant="ghost" size="sm" onClick={()=>setOpen(true)}>Report an AI issue</Button>{message&&!open&&<p role="status" className="text-xs text-muted-foreground">{message}</p>}
 <ERPChildDialogForm open={open} onOpenChange={setOpen} title="Report an AI issue" mode="add" isDirty={!!correction} isSubmitting={busy} closeDisabled={busy||uncertain} onCancel={()=>setOpen(false)} onSubmit={save} submitLabel={uncertain?'Recover original feedback':'Submit feedback'} submitDisabled={busy||!correction.trim()}>
  <fieldset disabled={busy||uncertain} className="space-y-3"><label className="block text-sm">Issue<select className="block w-full rounded border bg-background text-foreground p-2" value={category} onChange={e=>setCategory(e.target.value as typeof category)}>{feedbackCategories.map(c=><option key={c} value={c}>{c.replaceAll('_',' ')}</option>)}</select></label>
  <label className="block text-sm">What should be reviewed?<textarea required maxLength={1000} className="block w-full rounded border bg-background text-foreground p-2" rows={4} value={correction} onChange={e=>setCorrection(e.target.value)}/></label>
  <label className="flex gap-2 text-sm"><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/>Share this correction with authorised reviewers who currently have access to every referenced record.</label>
  <p className="text-xs text-muted-foreground">Feedback stays attached to this original result. Do not enter passwords or keys. Accepting feedback does not change employee data, train a model or publish new AI rules.</p></fieldset>{message&&<p role="status" className="text-sm">{message}</p>}
 </ERPChildDialogForm></div>;
}
