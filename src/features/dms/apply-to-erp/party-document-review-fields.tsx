'use client';
import {useId,useState} from 'react';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Label} from '@/components/ui/label';
import {APPLY_TARGET_REGISTRY} from '@/lib/dms/apply-to-erp/apply-target-registry';
import {resolvePartyChildRowProposals} from '@/lib/dms/apply-to-erp/apply-source-resolver';
import type {PartyApplyTargetKind,PartyLicenseRow,PartyTaxRow} from '@/lib/dms/apply-to-erp/types';
import {DmsApplyToErpPreview} from './dms-apply-to-erp-preview';

/** A party match proves identity, not licence terms or tax validity dates.
 * Never synthesize business values from today's date or match confidence. */
export function PartyDocumentReviewFields({documentId,partyId,partyName,kind,row,sourceId,reviewQueueItemId,onApplied}:{documentId:number;partyId:number;partyName:string|null;kind:PartyApplyTargetKind;row:PartyLicenseRow|PartyTaxRow;sourceId:number|null;reviewQueueItemId:number;onApplied:()=>void}){
 const uid=useId(),[field,setField]=useState(''),[value,setValue]=useState('');
 const fields=APPLY_TARGET_REGISTRY[kind].fields,selected=fields.find(f=>f.column===field);
 const current={...row,...('tax_registration_number_masked' in row?{tax_registration_number:row.tax_registration_number_masked}:{})};
 const proposals=selected&&value.trim()?resolvePartyChildRowProposals({documentId,partyId,targetKind:kind,targetRecordId:row.id,sourceType:'entity_match_candidate',sourceId,currentValues:current,proposedValues:{[field]:value}}):[];
 return <section className="space-y-3 rounded-md border border-border bg-card p-4 text-foreground" aria-label="Review values from the document">
  <p className="text-sm text-muted-foreground" id={`${uid}-help`}>The accepted match identifies the party only. Choose a field and enter its value from the source document. No dates or verification claims are filled automatically.</p>
  <div className="space-y-1"><Label htmlFor={`${uid}-field`}>Field to update</Label><select id={`${uid}-field`} value={field} onChange={e=>{setField(e.target.value);setValue('');}} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-describedby={`${uid}-help`}><option value="">Choose a field</option>{fields.map(f=><option key={f.column} value={f.column}>{f.label}</option>)}</select></div>
  {selected&&<div className="space-y-1"><Label htmlFor={`${uid}-value`}>{selected.label} from document</Label>{selected.valueType==='date'?<Input id={`${uid}-value`} type="date" value={value} onChange={e=>setValue(e.target.value)} required/>:<Textarea id={`${uid}-value`} value={value} onChange={e=>setValue(e.target.value)} maxLength={selected.maxLength??1000} required/>}</div>}
  <DmsApplyToErpPreview key={`${field}:${row.id}:${row.workspace_revision}`} documentId={documentId} partyId={partyId} partyName={partyName} targetModule="party" targetTable={kind} targetKind={kind} targetRecordId={row.id} sourceType="entity_match_candidate" sourceId={sourceId} reviewQueueItemId={reviewQueueItemId} proposals={proposals} label="Review selected change" onApplied={onApplied}/>
 </section>;
}
