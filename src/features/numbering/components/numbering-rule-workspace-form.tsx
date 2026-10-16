"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {createNumberingRuleSchema, type NumberingRule} from "@/features/numbering/numbering-types";
import {formatReference, NUMBERING_TOKENS} from '@/lib/numbering/format';
import {effectiveTimeInput,effectiveTimeValue} from '@/lib/numbering/effective-time';
import { createNumberingRule, updateNumberingRule } from "@/server/actions/numbering";
import { RequiredLabel } from "@/components/erp/required-label";
import { useWorkspaceFormDirty as useFormDirty } from "@/hooks/use-workspace-form-dirty";
import { Binary, FileCode2, Hash, Settings, Shield, ScrollText, Info, Sparkles } from "lucide-react";
import type {AuthContext} from "@/lib/rbac/check";
import {hasGlobalPermission} from '@/lib/rbac/scope';
import {useWorkspaceSaveSession} from '@/hooks/use-workspace-save-session';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import type {WorkspaceSaveContract,WorkspaceSaveReceipt} from '@/lib/workspace/save-contract';
import {z} from 'zod';
import {createSaveAdmission} from '@/lib/workspace/save-admission';
import {reportWorkspaceFieldErrors,workspaceValidationFailure} from '@/lib/workspace/field-errors';
import {useRouter} from 'next/navigation';
import { useWorkspaceFormNavigation as useWorkspace } from "@/hooks/use-workspace-form-navigation";
import { useWorkspaceFormSection } from "@/hooks/use-workspace-form-section";
import {
  ERPRecordWorkspaceForm,
  ERPRecordSectionPanel,
} from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type NumberingRuleWorkspaceFormProps = {
  rule?: NumberingRule | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "numbering-rule-workspace-form";
const numberingReceipt=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()}).strict();

export function NumberingRuleWorkspaceForm({ rule, mode, authContext }: NumberingRuleWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, updateTabRoute, isTabActive } = useWorkspace();
  const router=useRouter();
  const [admission]=useState(createSaveAdmission);
  const saveSession=useWorkspaceSaveSession(FORM_ID,rule?.id??null,rule?.workspace_revision);
  const recordId=useRef(saveSession.id);
  const [savedId,setSavedId]=useState(saveSession.id);
  const immutableCode=useRef(rule?.rule_code??null);
  const pendingSubmission=useRef<{entries:string;payload:z.infer<typeof createNumberingRuleSchema>}|null>(null);
  const canManage=hasGlobalPermission(authContext,'numbering.rules.manage');
  const canLock=hasGlobalPermission(authContext,'numbering.rules.lock');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const sections = [
    { id: "basic", label: "Basic Info", icon: Binary },
    { id: "module", label: "Module & Document", icon: FileCode2 },
    { id: "format", label: "Number Format", icon: Hash },
    { id: "sequence", label: "Sequence Settings", icon: Settings },
    { id: "policy", label: "Generation Policy", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
    { id: "notes", label: "Notes", icon: ScrollText },
  ];
  const [activeSection, setActiveSection] = useWorkspaceFormSection(FORM_ID, "basic", sections.map(section => section.id));

  const isEditing = savedId!==null;
  const isViewing = mode === "view" || !canManage;

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });
  const [previewPrefix, setPreviewPrefix] = useState(()=>getDraftDefault('document_prefix',rule?.document_prefix??'EMP'));
  const [previewTemplate, setPreviewTemplate] = useState(()=>getDraftDefault('format_template',rule?.format_template??'{DOC}-{SEQ4}'));
  const [previewLength, setPreviewLength] = useState(()=>Number(getDraftDefault('sequence_length',rule?.sequence_length??4)));
  const [previewPadding, setPreviewPadding] = useState(()=>getDraftDefault('padding_character',rule?.padding_character??'0'));
  const [previewNextSeq,setPreviewNextSeq] = useState(()=>Number(rule?.next_sequence_number??getDraftDefault('starting_sequence_number',1)));

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);


  const generateLivePreview = (): string => {
    try {
      return formatReference({document_prefix:previewPrefix,format_template:previewTemplate,
        sequence_length:previewLength,padding_character:previewPadding},previewNextSeq,new Date());
    } catch { return "Invalid format"; }
  };

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

 const inputId=rule?.id??null;

 // F04 owns the envelope/schema; this local witness verifies only its normalized
 // bytes and our own known transitions. No persisted key or shared API is added.
 const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner();
 const principal=authContext.profile?.id??null;
 const [recoveryStatus,setRecoveryStatus]=useState<string|null>(null);
 const [recovery]=useState(()=>{
  const key=owner? `draft:tab:${owner.id}:${FORM_ID}:save`:null;
  const scope={store,ownerId:owner?.id,principal,inputId:inputId,mode};
  let expected:string|undefined,pending=false,fingerprint:string|undefined;
  let stopped=!!saveSession.recoveryError||(inputId!==null&&saveSession.id!==inputId);
  let terminal:'confirmed'|'rejected'|null=null;
  let acknowledgedId:number|null=null;
  const capture=(ownWrite?:string)=>{
   const raw=key?store?.getViewState(key):ownWrite;
   if(typeof raw!=='string'||(ownWrite!==undefined&&raw!==ownWrite))throw Error('Unverified retained save');
   const value:unknown=JSON.parse(raw);
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Unverified retained save');
   expected=raw;pending=Object.hasOwn(value,'pending');
   fingerprint=pending?(value as {pending:{fingerprint:string}}).pending.fingerprint:undefined;
  };
  try{if(!stopped)capture(key?undefined:JSON.stringify({id:saveSession.id,revision:rule?.workspace_revision==null?null:String(rule?.workspace_revision)}));}catch{stopped=true;}
  const witness=()=>{if(stopped||(key&&(!store||store.getViewState(key)!==expected)))throw Error('Unverified retained save');};
  return {scope,get pending(){return pending;},get stopped(){return stopped;},get terminal(){return terminal;},get acknowledgedId(){return acknowledgedId;},
   stop(outcome:'confirmed'|'rejected'|null=null){stopped=true;if(outcome)terminal=outcome;},
   witness,
   begin(payload:unknown){
    witness();const exact=pending&&fingerprint===JSON.stringify(payload),recovering=pending;
    let contract:WorkspaceSaveContract;
    try{contract={...saveSession.begin(payload)};}catch{
     try{witness();if(!recovering||exact)stopped=true;}catch{stopped=true;}
     throw Error('The previous save is unconfirmed. Restore its submitted values and retry.');
    }
    try{capture(JSON.stringify({...JSON.parse(expected!),pending:{fingerprint:JSON.stringify(payload),contract}}));}catch{stopped=true;throw Error('Unverified pending write');}
    return contract;
   },
   accept(receipt:WorkspaceSaveReceipt){witness();saveSession.accept(receipt);capture(JSON.stringify({id:receipt.id,revision:receipt.revision}));pending=false;acknowledgedId=receipt.id;},
   rejected(){witness();saveSession.rejected();const value=JSON.parse(expected!);delete value.pending;capture(JSON.stringify(value));},
  };
 });
 const activation=useRef<{active:boolean}|null>(null),retired=useRef(false),promoted=useRef(false);
 const flight=useRef<{lease:{active:boolean};dispatch:object}|null>(null);
 const allowed=useRef(!isViewing);
 useLayoutEffect(()=>{allowed.current=!isViewing;});
 useLayoutEffect(()=>{
  // A sound own create may be adopted by the parent without replacing this
  // unkeyed form. Promote once; a wrong ID or failed acknowledgement cannot.
  if(!recovery.stopped&&recovery.scope.inputId===null&&recovery.scope.mode==='add'&&mode==='edit'&&inputId!==null&&inputId===recovery.acknowledgedId){
   promoted.current=true;
  }
  const sameRecord=inputId===(promoted.current?recovery.acknowledgedId:recovery.scope.inputId);
  const sameMode=mode===(promoted.current?'edit':recovery.scope.mode);
  if(store!==recovery.scope.store||owner?.id!==recovery.scope.ownerId||principal!==recovery.scope.principal||!sameRecord||!sameMode)retired.current=true;
  const lease={active:!retired.current};activation.current=lease;
  return ()=>{lease.active=false;if(flight.current?.lease===lease){flight.current=null;admission.leave();}};
 },[store,owner?.id,principal,inputId,mode,recovery,admission]);
 const notify=(message:string)=>{setRecoveryStatus(message);try{toast.error(message);}catch{/* Feedback cannot change a known outcome. */}};
 const blockedMessage=()=>recovery.terminal==='confirmed'?'Record saved, but local recovery could not finish. Reopen the saved record before continuing.':
  recovery.terminal==='rejected'?'The request was rejected, but local recovery could not finish. Reopen the record before continuing.':
  'The retained save request could not be verified. Reopen and reconcile the record before another change.';
  const handleSave = async (closeAfter=false): Promise<boolean> => {
    const lease=activation.current,current=()=>!!lease?.active&&!retired.current&&activation.current===lease;
    if(!current()||!allowed.current)return false;
    if(recovery.stopped){notify(blockedMessage());return false;}
    if(!admission.enter())return false;
    const dispatch={};flight.current={lease:lease!,dispatch};
    setIsSubmitting(true);setRecoveryStatus(null);
    const recovering=recovery.pending,dispatchId=recordId.current;let confirmed=false,rejected=false;
    try {
      recovery.witness();
      const form=document.getElementById(FORM_ID) as HTMLFormElement;
      const formData=new FormData(form),submitted=JSON.stringify(Array.from(formData.entries()));
      const data = {
        rule_code: immutableCode.current??String(formData.get("rule_code")??'').toUpperCase(),
        rule_name: formData.get("rule_name") as string,
        description: (formData.get("description") as string) || null,
        module_code: (formData.get("module_code") as string).toUpperCase(),
        module_name: formData.get("module_name") as string,
        document_type_code: (formData.get("document_type_code") as string).toUpperCase(),
        document_type_name: formData.get("document_type_name") as string,
        document_prefix: (formData.get("document_prefix") as string).toUpperCase(),
        separator: (formData.get("separator") as string) || "-",
        format_template: formData.get("format_template") as string,
        sequence_length: parseInt(formData.get("sequence_length") as string),
        padding_character: (formData.get("padding_character") as string) || "0",
        starting_sequence_number: parseInt(formData.get("starting_sequence_number") as string),
        reset_policy: (formData.get("reset_policy") as "never" | "yearly" | "monthly") || "never",
        reserve_on_draft: formData.get("reserve_on_draft") === "on",
        reserve_on_submit: formData.get("reserve_on_submit") === "on",
        allow_manual_override: formData.get("allow_manual_override") === "on",
        manual_override_requires_permission: formData.get("manual_override_requires_permission") === "on",
        allow_gaps: formData.get("allow_gaps") === "on",
        cancelled_number_policy: "never_reuse" as const,
        duplicate_prevention_scope: (formData.get("duplicate_prevention_scope") as string) || "document_type",
        is_active: formData.get("is_active") === "on",
        is_locked: canLock ? formData.get("is_locked") === "on" : rule?.is_locked??false,
        effective_from: effectiveTimeValue(String(formData.get("effective_from")??''),rule?.effective_from),
        effective_to: effectiveTimeValue(String(formData.get("effective_to")??''),rule?.effective_to),
        notes: (formData.get("notes") as string) || null,
      };

      const parsed=createNumberingRuleSchema.safeParse(data);
      if(!parsed.success){const failure=workspaceValidationFailure(parsed.error.issues);reportWorkspaceFieldErrors(form,failure.fieldErrors);notify(failure.error);return false;}
      const wasNew=dispatchId===null;
      // Disabled fields and original effective instants must not be rebuilt from
      // refreshed rule props while the exact visible submission is pending.
      const payload=structuredClone(pendingSubmission.current?.entries===submitted?pendingSubmission.current.payload:parsed.data);
      const contract=recovery.begin(payload);
      pendingSubmission.current??={entries:submitted,payload:structuredClone(payload)};
      if(!current())return false;
      const result=wasNew?await createNumberingRule(payload,contract):await updateNumberingRule({...payload,id:dispatchId},contract);
      if(!result.success){
        rejected=!recovering&&!result.uncertain;
        if(!current())return false;
        recovery.witness();
        if(rejected){recovery.rejected();pendingSubmission.current=null;reportWorkspaceFieldErrors(form,result.fieldErrors);notify(result.error??'The request was rejected. Check its values.');}
        else notify('The earlier save is still unconfirmed. Retry the same submitted values.');
        return false;
      }
      const receipt=numberingReceipt.safeParse(result.data);
      if(!receipt.success||(dispatchId!==null&&receipt.data.id!==dispatchId))throw Error('Incomplete receipt');
      confirmed=true;if(!current())return true;
      recordId.current=receipt.data.id;setSavedId(receipt.data.id);immutableCode.current=parsed.data.rule_code;
      recovery.accept(receipt.data);pendingSubmission.current=null;
      const unchanged=submitted===JSON.stringify(Array.from(new FormData(form).entries()));
      if(unchanged){clearDraft();resetDirty();}
      const route=`/admin/settings/numbering/record/${receipt.data.id}?mode=edit`;
      let displayFailed=false;
      const display=(effect:()=>void)=>{if(current())try{effect();}catch{displayFailed=true;}};
      if(activeTab){display(()=>markDirty(activeTab.id,!unchanged));display(()=>updateTabRoute(activeTab.id,route,receipt.data.id,'edit'));}
      display(()=>toast.success(receipt.data.changed===false?'No changes to save':wasNew?'Numbering rule created':'Numbering rule updated'));
      if(closeAfter&&unchanged&&activeTab)display(()=>closeTab(activeTab.id,{force:true}));
      else if(wasNew&&activeTab)display(()=>{if(isTabActive(activeTab.id))router.replace(route);});
      if(displayFailed&&current())notify('Numbering rule saved, but its display could not refresh. Reopen the record before continuing.');
      return true;
    }catch{
      if(!current())return confirmed;
      if(confirmed){recovery.stop('confirmed');notify(blockedMessage());return true;}
      if(rejected){recovery.stop('rejected');notify(blockedMessage());return false;}
      try{recovery.witness();}catch{recovery.stop();}
      notify(recovery.stopped?blockedMessage():'The previous save is unconfirmed. Restore its submitted values and retry.');
      return false;
    }finally{if(flight.current?.dispatch===dispatch){flight.current=null;admission.leave();if(current())setIsSubmitting(false);}}
  };

  const handleSaveAndClose = async () => {
    await handleSave(true);
  };

  return (
    <ERPRecordWorkspaceForm
      mode={isViewing?'view':isEditing?'edit':'add'}
      title={isViewing ? "View Numbering Rule" : isEditing ? "Edit Numbering Rule" : "New Numbering Rule"}
      subtitle={rule ? `Rule Code: ${rule.rule_code}` : "Define a new auto-numbering rule for document sequences"}
      recordCode={rule?.rule_code}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={isDirty}
      onSave={isViewing || recovery.stopped ? undefined : handleSave}
      onSaveAndClose={isViewing || recovery.stopped ? undefined : handleSaveAndClose}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
    >
      {recoveryStatus&&<p role="status">{recoveryStatus}</p>}
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); handleSaveAndClose(); }} onInput={syncDraft} onChange={syncDraft}>
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Basic Rule Information">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="rule_code">Rule Code</RequiredLabel>
              <Input id="rule_code" name="rule_code" required defaultValue={getDraftDefault("rule_code", rule?.rule_code ?? "")} disabled={isViewing || isEditing} placeholder="HR_EMPLOYEE" className="uppercase" maxLength={100} />
              <span className="text-[9px] text-muted-foreground">Unique identifier (uppercase, alphanumeric with underscores)</span>
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="rule_name">Rule Name</RequiredLabel>
              <Input id="rule_name" name="rule_name" required defaultValue={getDraftDefault("rule_name", rule?.rule_name ?? "")} disabled={isViewing} placeholder="Employee Number" maxLength={200} />
            </div>
            <div className="space-y-2 col-span-12">
              <Label htmlFor="description" className="text-muted-foreground text-xs">Description</Label>
              <Textarea id="description" name="description" defaultValue={getDraftDefault("description", rule?.description ?? "")} disabled={isViewing} placeholder="Human resources employee reference number" maxLength={500} rows={2} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Status</Label>
              <div className="flex items-center space-x-2">
                <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", rule?.is_active ?? true)} disabled={isViewing} />
                <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
              </div>
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Lock Status</Label>
              <div className="flex items-center space-x-2">
                <Checkbox id="is_locked" name="is_locked" defaultChecked={getDraftBoolean("is_locked", rule?.is_locked ?? false)} disabled={isViewing||!canLock} />
                <Label htmlFor="is_locked" className="text-sm font-normal cursor-pointer">Locked</Label>
              </div>
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="effective_from" className="text-muted-foreground text-xs">Effective From (UTC)</Label>
              <Input id="effective_from" name="effective_from" type="datetime-local" step="0.001" defaultValue={getDraftDefault("effective_from", effectiveTimeInput(rule?.effective_from))} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="effective_to" className="text-muted-foreground text-xs">Effective To (UTC)</Label>
              <Input id="effective_to" name="effective_to" type="datetime-local" step="0.001" defaultValue={getDraftDefault("effective_to", effectiveTimeInput(rule?.effective_to))} disabled={isViewing} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="module" activeId={activeSection} title="Module & Document Type">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="module_code">Module Code</RequiredLabel>
              <Input id="module_code" name="module_code" required defaultValue={getDraftDefault("module_code", rule?.module_code ?? "")} disabled={isViewing} placeholder="HR" className="uppercase" maxLength={50} />
              <span className="text-[9px] text-muted-foreground">e.g., HR, PROCUREMENT, FINANCE</span>
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="module_name">Module Name</RequiredLabel>
              <Input id="module_name" name="module_name" required defaultValue={getDraftDefault("module_name", rule?.module_name ?? "")} disabled={isViewing} placeholder="Human Resources" maxLength={200} />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="document_type_code">Document Type Code</RequiredLabel>
              <Input id="document_type_code" name="document_type_code" required defaultValue={getDraftDefault("document_type_code", rule?.document_type_code ?? "")} disabled={isViewing} placeholder="EMPLOYEE" className="uppercase" maxLength={100} />
              <span className="text-[9px] text-muted-foreground">e.g., EMPLOYEE, PURCHASE_ORDER, INVOICE</span>
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="document_type_name">Document Type Name</RequiredLabel>
              <Input id="document_type_name" name="document_type_name" required defaultValue={getDraftDefault("document_type_name", rule?.document_type_name ?? "")} disabled={isViewing} placeholder="Employee" maxLength={200} />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="document_prefix">Document Prefix</RequiredLabel>
              <Input id="document_prefix" name="document_prefix" required defaultValue={getDraftDefault("document_prefix", rule?.document_prefix ?? "")} disabled={isViewing} placeholder="EMP" className="uppercase font-mono" maxLength={20} onChange={(e) => setPreviewPrefix(e.target.value.toUpperCase())} />
              <span className="text-[9px] text-muted-foreground">Uppercase letters, numbers, underscores only</span>
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="format" activeId={activeSection} title="Number Format">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-4">
              <Label htmlFor="separator" className="text-muted-foreground text-xs">Separator</Label>
              <Input id="separator" name="separator" defaultValue={getDraftDefault("separator", rule?.separator ?? "-")} disabled={isViewing} placeholder="-" maxLength={5} className="font-mono" />
            </div>
            <div className="space-y-2 col-span-8">
              <RequiredLabel htmlFor="format_template">Format Template</RequiredLabel>
              <Input id="format_template" name="format_template" required defaultValue={getDraftDefault("format_template", rule?.format_template ?? "{DOC}-{SEQ4}")} disabled={isViewing} placeholder="{DOC}-{SEQ4}" maxLength={100} className="font-mono" onChange={(e) => setPreviewTemplate(e.target.value)} />
              <div className="text-[9px] text-muted-foreground space-y-1">
                <div className="flex flex-wrap gap-1">
                  {NUMBERING_TOKENS.map(t => <Badge key={t} variant="outline" className="text-[9px] font-mono">{`{${t}}`}</Badge>)}
                </div>
                <div className="text-amber-600 dark:text-amber-400">⚠ Do not use: {"{COMPANY}"}, {"{BRANCH}"}, {"{CITY}"}</div>
              </div>
            </div>
            <div className="col-span-12">
              <Card className="bg-indigo-500/5 border-indigo-500/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Format example (UTC) — not reserved</div>
                    <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">{generateLivePreview()}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="sequence" activeId={activeSection} title="Sequence Settings">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-4">
              <RequiredLabel htmlFor="sequence_length">Sequence Length</RequiredLabel>
              <Input id="sequence_length" name="sequence_length" type="number" required min={1} max={12} defaultValue={getDraftDefault("sequence_length", rule?.sequence_length ?? 4)} disabled={isViewing} onChange={(e) => setPreviewLength(Number(e.target.value))} />
              <span className="text-[9px] text-muted-foreground">Number of digits (1-12)</span>
            </div>
            <div className="space-y-2 col-span-4">
              <Label htmlFor="padding_character" className="text-muted-foreground text-xs">Padding Character</Label>
              <Input id="padding_character" name="padding_character" maxLength={1} defaultValue={getDraftDefault("padding_character", rule?.padding_character ?? "0")} disabled={isViewing} placeholder="0" className="font-mono" onChange={(e) => setPreviewPadding(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-4">
              <RequiredLabel htmlFor="starting_sequence_number">Starting Sequence</RequiredLabel>
              <Input id="starting_sequence_number" name="starting_sequence_number" type="number" required min={1} defaultValue={getDraftDefault("starting_sequence_number", rule?.starting_sequence_number ?? 1)} disabled={isViewing} onChange={e=>{if(!isEditing)setPreviewNextSeq(Number(e.target.value));}} />
            </div>
            <div className="space-y-2 col-span-4">
              <Label htmlFor="reset_policy" className="text-muted-foreground text-xs">Reset Policy</Label>
              <Select name="reset_policy" defaultValue={getDraftDefault("reset_policy", rule?.reset_policy ?? "never")} disabled={isViewing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never (Continuous)</SelectItem>
                  <SelectItem value="yearly">Yearly (UTC)</SelectItem>
                  <SelectItem value="monthly">Monthly (UTC)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(isViewing || isEditing) && rule && (
              <>
                <div className="space-y-2 col-span-6">
                  <Label className="text-muted-foreground text-xs">Current Sequence</Label>
                  <Input aria-label="Current Sequence" value={rule.current_sequence_number ?? 0} disabled className="font-mono font-bold" />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label className="text-muted-foreground text-xs">Next Sequence</Label>
                  <Input aria-label="Next Sequence" value={rule.next_sequence_number ?? 1} disabled className="font-mono font-bold" />
                </div>
              </>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="policy" activeId={activeSection} title="Generation Policy">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 space-y-3">
              {[
                { id: "reserve_on_draft", label: "Reserve On Draft", checked: rule?.reserve_on_draft ?? false },
                { id: "reserve_on_submit", label: "Reserve On Submit", checked: rule?.reserve_on_submit ?? true },
                { id: "allow_manual_override", label: "Allow Manual Override", checked: rule?.allow_manual_override ?? false },
                { id: "manual_override_requires_permission", label: "Manual Override Requires Permission", checked: rule?.manual_override_requires_permission ?? true },
                { id: "allow_gaps", label: "Allow Gaps in Sequence", checked: rule?.allow_gaps ?? true },
              ].map(({ id, label, checked }) => (
                <div key={id} className="flex items-center space-x-2">
                  <Checkbox id={id} name={id} defaultChecked={getDraftBoolean(id, checked)} disabled={isViewing} />
                  <Label htmlFor={id} className="text-sm font-normal cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="cancelled_number_policy" className="text-muted-foreground text-xs">Cancelled Number Policy</Label>
              <Select name="cancelled_number_policy" defaultValue={getDraftDefault("cancelled_number_policy", rule?.cancelled_number_policy ?? "never_reuse")} disabled={isViewing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never_reuse">Never Reuse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="duplicate_prevention_scope" className="text-muted-foreground text-xs">Duplicate Prevention Scope</Label>
              <Input id="duplicate_prevention_scope" name="duplicate_prevention_scope" defaultValue={getDraftDefault("duplicate_prevention_scope", rule?.duplicate_prevention_scope ?? "document_type")} disabled={isViewing} maxLength={100} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {rule ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input aria-label="Created At" value={new Date(rule.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input aria-label="Updated At" value={new Date(rule.updated_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created By</Label>
                <Input aria-label="Created By" value={rule.created_by ?? "—"} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated By</Label>
                <Input aria-label="Updated By" value={rule.updated_by ?? "—"} disabled className="text-xs" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Audit information will be available after saving</p>
          )}
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="notes" activeId={activeSection} title="Internal Notes">
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={getDraftDefault("notes", rule?.notes ?? "")} disabled={isViewing} placeholder="Internal notes about this numbering rule..." maxLength={1000} rows={4} />
          </div>
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
