'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import type {SubjectPhotoDraft} from './use-subject-photo-draft';
export function PhotoRecoveryNotice({draft,onOpenDependent}:{draft:SubjectPhotoDraft;onOpenDependent?:(id:number)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const r=draft.recovered;
 if(!r)return null;
 const openEmployee=r.employee&&r.scope==='employee:new';
 const personSaved=r.scope.startsWith('dependent:')?!!r.dependent:!!r.employee;
 return <div role="status" className="rounded border border-border p-3 text-sm space-y-2">
  <p>{r.complete?'The original photo save is confirmed. Reopen the saved person to see the latest details.':r.savePending?'An interrupted photo save was found. Resume its original request before entering another.':personSaved?'An earlier photo upload is retained. Continue in the saved person’s form; reselect the original file only if it has not finished uploading.':'The photo request is retained. Review the person’s fields and Save. Reselect the original file if requested.'}</p>
  {r.savePending&&<Button type="button" variant="outline" disabled={busy||draft.busy} onClick={()=>{setBusy(true);setError('');void draft.resume().catch(e=>setError(e instanceof Error?e.message:'Photo recovery unavailable')).finally(()=>setBusy(false));}}>Resume original save</Button>}
  {openEmployee&&!r.savePending&&<a className="block text-primary underline" href={`/admin/hr/employees/record/${r.employee}?mode=edit`}>Open saved employee</a>}
  {r.dependent&&onOpenDependent&&!r.savePending&&<Button type="button" variant="outline" disabled={busy} onClick={()=>onOpenDependent(r.dependent!)}>Open saved dependent</Button>}
  {error&&<p role="alert" className="text-destructive">{error}</p>}
 </div>;
}
