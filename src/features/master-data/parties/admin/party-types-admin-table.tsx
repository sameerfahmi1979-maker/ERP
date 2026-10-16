"use client";

import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useRef, useState, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { PlusCircle, Pencil, Power, Layers } from "lucide-react";
import { toast } from "sonner";
import { RequiredLabel } from "@/components/erp/required-label";
import {createPartyTypeAttempt} from "@/lib/master-data/party-type-attempt";
import {partyTypeSchema} from "@/lib/master-data/party-type-contract";
import {hasGlobalPermission} from "@/lib/rbac/scope";
import type { PartyTypeAdminRow } from "@/server/actions/master-data/party-admin-masters";
import type { AuthContext } from "@/lib/rbac/check";
import { useRouter } from "next/navigation";

type Props = {
  rows: PartyTypeAdminRow[];
  authContext: AuthContext;
};

type FormState = {
  type_code: string;
  type_name: string;
  type_name_ar: string;
  description: string;
  icon_name: string;
  color_token: string;
  is_active: boolean;
  sort_order: string;
};

const emptyForm: FormState = {
  type_code: "",
  type_name: "",
  type_name_ar: "",
  description: "",
  icon_name: "",
  color_token: "",
  is_active: true,
  sort_order: "0",
};

export function PartyTypesAdminTable(props:Props){
 return <PartyTypesSession key={props.authContext.profile?.id??'anonymous'} {...props}/>;
}
function PartyTypesSession({rows,authContext}:Props){
 const router=useRouter(),canManage=hasGlobalPermission(authContext,"master_data.parties.manage_types");
 const [isDialogOpen,setIsDialogOpen]=useState(false),[editing,setEditing]=useState<PartyTypeAdminRow|null>(null);
 const [form,setForm]=useState<FormState>({...emptyForm}),[isSubmitting,setIsSubmitting]=useState(false);
 const [uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null);
 const [savedRows,setSavedRows]=useState<Record<number,PartyTypeAdminRow>>({});
 const attempt=useRef(createPartyTypeAttempt());
 const flight=useRef<{lease:{active:boolean}}|null>(null),activation=useRef<{active:boolean}|null>(null),allowed=useRef(canManage);
 const retry=useRef<{row:PartyTypeAdminRow|null;payload:Parameters<ReturnType<typeof createPartyTypeAttempt>['run']>[1];close:boolean}|null>(null);
 const localBlocked=useRef(false);
 const [reloadOnly,setReloadOnly]=useState(false),[recoveryBlocked,setRecoveryBlocked]=useState(false);
 useLayoutEffect(()=>{allowed.current=canManage;});
 useLayoutEffect(()=>{const lease={active:true};activation.current=lease;return()=>{lease.active=false;if(flight.current?.lease===lease)flight.current=null;};},[]);
 const displayRows=[...rows.map(row=>savedRows[row.id]&&(savedRows[row.id].workspace_revision??0)>(row.workspace_revision??0)?savedRows[row.id]:row),
  ...Object.values(savedRows).filter(row=>!rows.some(existing=>existing.id===row.id))];
 const openAdd=()=>{if(!activation.current?.active||!allowed.current||localBlocked.current||flight.current||attempt.current.pending())return;setEditing(null);setForm({...emptyForm});setError(null);setIsDialogOpen(true);};
 const openEdit=(row:PartyTypeAdminRow)=>{
  if(!activation.current?.active||!allowed.current||localBlocked.current||flight.current||attempt.current.pending())return;
  setEditing(row);setForm({type_code:row.type_code,type_name:row.type_name,type_name_ar:row.type_name_ar??"",
   description:row.description??"",icon_name:row.icon_name??"",color_token:row.color_token??"",is_active:row.is_active,sort_order:String(row.sort_order)});
  setError(null);setIsDialogOpen(true);
 };
 const run=async(row:PartyTypeAdminRow|null,payload:Parameters<ReturnType<typeof createPartyTypeAttempt>['run']>[1],close:boolean)=>{
  const lease=activation.current;
  if(!lease?.active||!allowed.current||localBlocked.current||flight.current)return;
  const dispatch={lease};flight.current=dispatch;
  const current=()=>lease.active&&activation.current===lease&&flight.current===dispatch;
  setIsSubmitting(true);setError(null);
  if(!attempt.current.pending())retry.current={row:row?structuredClone(row):null,payload:structuredClone(payload),close};
  let knownSaved=false;
  try{
   const result=await attempt.current.run(row,payload,current);
   if(!current())return;
   knownSaved=true;
   let localFailure=false,feedbackFailure=false,refreshFailure=false;
   try{setSavedRows(existing=>({...existing,[result.row.id]:result.row}));}catch{localFailure=true;}
   if(!current())return;
   try{attempt.current.acknowledged();}catch{localFailure=true;}
   if(!current())return;
   retry.current=null;setUncertain(false);setReloadOnly(false);
   if(localFailure){localBlocked.current=true;setRecoveryBlocked(true);}
   try{toast.success(result.receipt.changed===false?'No changes to save':row?'Party type updated':'Party type created');}catch{feedbackFailure=true;}
   if(!current())return;
   try{if(close)setIsDialogOpen(false);}catch{localFailure=true;localBlocked.current=true;setRecoveryBlocked(true);}
   if(!current())return;
   try{router.refresh();}catch{refreshFailure=true;}
   if(current()){
    if(localFailure)setError('Saved. Local confirmation could not finish. Reopen this catalogue before another change.');
    else if(refreshFailure)setError('Saved. The list refresh is unavailable; the confirmed row is shown. Refresh the list when the connection returns.');
    else if(feedbackFailure)setError('Saved. Local feedback is unavailable; the confirmed record is shown.');
   }
  }catch(e){
   if(current()){
    if(knownSaved){localBlocked.current=true;setRecoveryBlocked(true);retry.current=null;setUncertain(false);setReloadOnly(false);setError('Saved. Local confirmation could not finish. Reopen this catalogue before another change.');}
    else{setUncertain(attempt.current.pending());setReloadOnly(attempt.current.saved());setError(e instanceof Error?e.message:'The change could not be confirmed. Retry the same entries.');}
   }
  }finally{if(current()){flight.current=null;setIsSubmitting(false);}}
 };
 const handleSubmit=async()=>{if(!activation.current?.active||!allowed.current||localBlocked.current)return;
  if(attempt.current.pending()){const target=retry.current;if(target)await run(target.row,target.payload,target.close);return;}
  const parsed=partyTypeSchema.safeParse({...form,type_name_ar:form.type_name_ar||null,description:form.description||null,
   icon_name:form.icon_name||null,color_token:form.color_token||null,sort_order:form.sort_order.trim()===""?NaN:Number(form.sort_order)});
  if(!parsed.success){setError(parsed.error.issues.map(issue=>issue.message).join(" "));return;}
  await run(editing,parsed.data,true);
 };
 const handleToggle=async(row:PartyTypeAdminRow)=>{
  if(!activation.current?.active||!allowed.current||localBlocked.current||attempt.current.pending()||flight.current)return;
  await run(row,{type_code:row.type_code,type_name:row.type_name,type_name_ar:row.type_name_ar,description:row.description,
   icon_name:row.icon_name,color_token:row.color_token,is_active:!row.is_active,sort_order:row.sort_order},false);
 };
  const columns: ColumnDef<PartyTypeAdminRow>[] = [
    {accessorKey:"type_code",header:"Code",cell:({row:tableRow})=>{const row=tableRow.original;return <>{row.type_code}</>; }},
    {accessorKey:"type_name",header:"Name",cell:({row:tableRow})=>{const row=tableRow.original;return <>
                  <div>{row.type_name}</div>
                  {row.type_name_ar && <div className="text-xs text-muted-foreground">{row.type_name_ar}</div>}
                </>; }},
    {accessorKey:"description",header:"Description",cell:({row:tableRow})=>{const row=tableRow.original;return <>{row.description ?? "—"}</>; }},
    {accessorKey:"is_system",header:"System",cell:({row:tableRow})=>{const row=tableRow.original;return <>
                  {row.is_system && <Badge variant="outline" className="text-xs">System</Badge>}
                </>; }},
    {accessorKey:"is_active",header:"Status",cell:({row:tableRow})=>{const row=tableRow.original;return <>
                  <Badge className={row.is_active ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-muted text-muted-foreground"}>
                    {row.is_active ? "Active" : "Inactive"}
                  </Badge>
                </>; }},
    {accessorKey:"sort_order",header:"Order",cell:({row:tableRow})=>{const row=tableRow.original;return <>{row.sort_order}</>; }},
    ...(canManage ? [{id:"actions",header:"Actions",enableSorting:false,cell:({row:tableRow})=>{const row=tableRow.original;return <>
                    <div className="flex items-center gap-1 justify-end">
                      <Button aria-label="Edit record" size="icon" variant="ghost" disabled={isSubmitting||uncertain||recoveryBlocked||!row.workspace_revision} onClick={() => openEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button aria-label={row.is_active ? "Deactivate record" : "Activate record"} size="icon" variant="ghost" disabled={isSubmitting||uncertain||recoveryBlocked||!row.workspace_revision} onClick={() => handleToggle(row)} title={row.is_active ? "Deactivate" : "Activate"}>
                        <Power className="h-4 w-4" />
                      </Button>
                    </div>
                  </>;}} satisfies ColumnDef<PartyTypeAdminRow>] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Party Types</h2>
          <p className="text-sm text-muted-foreground">{displayRows.length} types</p>
        </div>
        {canManage && (
          <Button disabled={isSubmitting||uncertain||recoveryBlocked||!canManage} onClick={openAdd} size="sm">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Type
          </Button>
        )}
      </div>

      {error&&!isDialogOpen&&<div role="alert" className="text-sm text-destructive">{error}</div>}
      {uncertain&&!isDialogOpen&&<Button disabled={isSubmitting||!canManage} onClick={()=>void handleSubmit()}>{reloadOnly?'Reload saved record':'Retry pending change'}</Button>}
      <div className="rounded-md border">
        <ERPDataTable tableId="admin.party-types" resultsLabel="party types" data={displayRows} columns={columns} enableRowSelection={false} />
      </div>

      <ERPChildDialogForm
        open={isDialogOpen}
        onOpenChange={open=>{if(activation.current?.active&&!flight.current&&!attempt.current.pending())setIsDialogOpen(open);}}
        title={editing ? "Edit Party Type" : "Add Party Type"}
        subtitle="Define a party classification type"
        icon={<Layers className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        submitDisabled={recoveryBlocked||!canManage||Boolean(editing&&!editing.workspace_revision)}
        closeDisabled={uncertain}
        submitLabel={uncertain?(reloadOnly?'Reload saved record':'Retry pending save'):undefined}
      >
        {error&&<div role="alert" className="mb-3 text-sm text-destructive">{error}</div>}
        <fieldset disabled={isSubmitting||uncertain||recoveryBlocked||!canManage} className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <RequiredLabel required>Code</RequiredLabel>
            <Input
              required maxLength={100} pattern="[A-Z0-9_]+" aria-label="Code" name="type_code" value={form.type_code}
              onChange={(e) => setForm((f) => ({ ...f, type_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. CUSTOMER"
              disabled={!!editing}
              className="font-mono"
            />
          </div>
          <div className="col-span-6">
            <Label>Sort Order</Label>
            <Input required name="sort_order" aria-label="Sort Order" type="number" min={0} max={2147483647} step={1} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order:e.target.value }))} />
          </div>
          <div className="col-span-6">
            <RequiredLabel required>Name (English)</RequiredLabel>
            <Input required maxLength={200} aria-label="Name" name="type_name" value={form.type_name} onChange={(e) => setForm((f) => ({ ...f, type_name: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Name (Arabic)</Label>
            <Input maxLength={200} aria-label="Name (Arabic)" value={form.type_name_ar} onChange={(e) => setForm((f) => ({ ...f, type_name_ar: e.target.value }))} dir="rtl" />
          </div>
          <div className="col-span-12">
            <Label>Description</Label>
            <Textarea maxLength={2000} aria-label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          </div>
          <div className="col-span-6 flex items-center gap-3">
            <Switch aria-label="Active" checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            <Label>Active</Label>
          </div>
        </fieldset>
      </ERPChildDialogForm>
    </div>
  );
}
