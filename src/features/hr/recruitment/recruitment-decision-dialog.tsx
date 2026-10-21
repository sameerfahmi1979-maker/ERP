'use client';
import{useState,type ReactNode}from'react';
import{ERPChildDialogForm}from'@/components/erp/erp-child-dialog-form';
import{Textarea}from'@/components/ui/textarea';
import{RequiredLabel}from'@/components/erp/required-label';
import type{RecruitmentLifecycleRequest}from'@/lib/hr/recruitment-lifecycle-contract';
export function RecruitmentDecisionDialog({request,busy,locked,onClose,onConfirm,recovery}:{request:RecruitmentLifecycleRequest|null;busy:boolean;locked:boolean;onClose:()=>void;onConfirm:(reason:string)=>void;recovery?:ReactNode}){
 const [reason,setReason]=useState('');
 return <ERPChildDialogForm open={!!request}onOpenChange={()=>{if(!busy&&!locked){setReason('');onClose();}}}title={`${request?.action.replaceAll('-',' ')??''} — reviewed decision`}mode="edit"isSubmitting={busy}closeDisabled={locked}recoveryActions={recovery}submitDisabled={locked||!reason.trim()}onSubmit={()=>onConfirm(reason)}><RequiredLabel required>Decision reason / acceptance evidence</RequiredLabel><Textarea aria-label="Decision reason / acceptance evidence"required maxLength={2000}value={reason}onChange={e=>setReason(e.target.value)}disabled={locked}/><p className="text-sm text-muted-foreground">Record what was actually reviewed or received. Recording acceptance does not send an email or infer candidate consent.</p></ERPChildDialogForm>;
}
