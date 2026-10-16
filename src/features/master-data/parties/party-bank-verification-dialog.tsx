'use client';
import {useState} from 'react';
import {toast} from 'sonner';
import {PartyChildSaveDialog} from './party-child-save-dialog';
import {verifyPartyBankDetail} from '@/server/actions/master-data/party-bank-details';
import type {PartyBankDetail} from './party-types';

/** Verification confirms the displayed opening revision, never a live-updated
 * account underneath the review. Existing F04 session owns retry identity. */
export function PartyBankVerificationDialog({record,onClose,onSaved}:{record:PartyBankDetail;onClose:()=>void;onSaved:()=>void}){
 const [opening]=useState(()=>({...record}));
 const [error,setError]=useState<string|null>(null),[uncertain,setUncertain]=useState(false);
 const hasRevision=Number.isSafeInteger(opening.workspace_revision)&&Number(opening.workspace_revision)>0;
 return <PartyChildSaveDialog<{reviewed:true}>
  formId={`bank-verification:${opening.party_id}`} record={opening} open title="Verify bank details"
  subtitle="Record your internal review of this account. This is not confirmation from the bank. Changes to its banking information require a new verification."
  mode="edit" size="sm" isDirty={false} submitLabel={uncertain?'Retry same verification':'Confirm verification'}
  submitDisabled={!hasRevision}
  onOpenChange={open=>{if(!open)onClose();}}
  createAction={async()=>({success:false,error:'Reopen an existing bank account to verify it.'})}
  updateAction={(input,contract)=>verifyPartyBankDetail(input.id,contract)}
  onSubmit={async save=>{
   setError(null);const result=await save({reviewed:true});setUncertain(result.uncertain===true);
   if(!result.success){setError(result.error??'Verification could not be confirmed.');return;}
   toast.success(result.data?.changed===false?'Bank details were already verified':'Bank details verified');
   try{onSaved();}catch{toast.warning('Verification saved. Reopen the list to refresh its display.');}
   onClose();
  }}>
  <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-3 text-sm">
   {[
    ['Record',opening.bank_detail_code],['Account holder',opening.account_holder_name],
    ['Bank',opening.bank_name??opening.bank_name_text??(opening.bank_id?'Configured bank name unavailable':null)],['Account number',opening.account_number],
    ['IBAN',opening.iban],['SWIFT',opening.swift_code],['Currency',opening.currency_code??(opening.currency_id?'Configured currency label unavailable':null)],
    ['Branch',opening.branch_name],['Country',opening.country_name??(opening.country_id?'Configured country label unavailable':null)],
    ['Status',opening.is_active?'Active':'Inactive'],
   ].map(([label,value])=><div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words">{value||'Not specified'}</dd></div>)}
  </dl>
  {!hasRevision&&<p role="alert" className="mt-4 text-sm text-destructive">Reopen these bank details to load their current revision before verifying.</p>}
  {error&&<p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
 </PartyChildSaveDialog>;
}
