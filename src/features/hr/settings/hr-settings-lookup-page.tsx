"use client";
import { RecordCollection } from "@/components/erp/table/record-collection";

import { useState, useCallback, useRef, useTransition, useEffect } from "react";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Search, Pencil, ToggleLeft, Settings2 } from "lucide-react";
import type { HrSettingsRow } from "@/server/actions/hr/settings";
import type { ActionResult } from "@/server/actions/hr/settings";
import { toast } from "sonner";
import {createWorkspaceSaveAttempt,type WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import {hrLookupSchemas,hrLookupSaveReceipt,type HrLookupTable,type HrLookupFormInput} from "@/lib/hr/settings-save-contract";
import {initialHrLookupOptions,hrLookupOptionPayload,type HrLookupOptionState} from "@/lib/hr/lookup-option-fields";
import {HrLookupOptionControls} from './hr-lookup-option-controls';
import {HrSettingsLifecycle,type HrArchiveTarget} from './hr-settings-lifecycle';

type LookupRecord = HrSettingsRow & {training_category_id?:number|null;training_category?:{id:number;name_en:string}|null};

export type HrSettingsLookupProps = {
  entity: HrLookupTable;
  principalId?: number;
  title: string;
  description: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
  initialData: LookupRecord[];
  canManage: boolean;
  onList: (params: { search?: string; is_active?: boolean; complete?: boolean }) => Promise<ActionResult<{ data: LookupRecord[]; total: number }>>;
  onCreate: (input: HrLookupFormInput, contract?: WorkspaceSaveContract) => Promise<ActionResult<{ id: number }>>;
  onUpdate: (id: number, input: Partial<HrLookupFormInput>, contract?: WorkspaceSaveContract) => Promise<ActionResult>;
  onToggle?: (id: number, is_active: boolean, contract?: WorkspaceSaveContract) => Promise<ActionResult>;
  /** Called after successful create, update, or toggle — e.g. invalidate TanStack Query caches. */
  onAfterMutate?: () => void;
};

type FormState = {
  code: string;
  name_en: string;
  name_ar: string;
  description: string;
  is_active: boolean;
  sort_order: string;
};

const blank: FormState = { code: "", name_en: "", name_ar: "", description: "", is_active: true, sort_order: "0" };

export function HrSettingsLookupPage(props:HrSettingsLookupProps) {
  return <HrSettingsLookupSession key={`${props.principalId??'unknown'}:${props.entity}:${props.canManage}`} {...props}/>;
}
function HrSettingsLookupSession({
  entity,
  title,
  description,
  breadcrumbs,
  initialData,
  canManage,
  onList,
  onCreate,
  onUpdate,
  onToggle,
  onAfterMutate,
}: HrSettingsLookupProps) {
  const [rows, setRows] = useState<LookupRecord[]>(initialData);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LookupRecord | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [options,setOptions]=useState<HrLookupOptionState>({});
  const [referenceReady,setReferenceReady]=useState(entity!=='hr_training_types');
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [uncertain,setUncertain] = useState(false);
  const [archiveTarget,setArchiveTarget]=useState<HrArchiveTarget|null>(null),[archiveBusy,setArchiveBusy]=useState(false);
  const attempt = useRef(createWorkspaceSaveAttempt());
  const retry = useRef<(()=>Promise<void>)|null>(null);
  const latestRead = useRef(0), mutation = useRef(false);
  const pending=useRef<{id:number|null;payload:HrLookupFormInput;toggle:boolean;contract:WorkspaceSaveContract;hadUnknown:boolean}|null>(null);
  const activation=useRef({retired:false});
  useEffect(()=>{const current={retired:false};activation.current=current;return()=>{current.retired=true;};},[]);

  const refresh = useCallback((s?: string) => {
    const request = ++latestRead.current;
    startTransition(async () => {
      const searchTerm = s !== undefined ? s : search;
      try {
      const res = await onList({ search: searchTerm || undefined, complete: true });
      if (request !== latestRead.current) return;
      if (res.success && res.data) { setRows(res.data.data); setReadFailed(false); }
      else setReadFailed(true);
      } catch { if (request === latestRead.current) setReadFailed(true); }
    });
  }, [onList, search]);

  const handleSearch = (v: string) => {
    setSearch(v);
    refresh(v);
  };

  const openAdd = () => {
    if (uncertain || mutation.current) return;
    setSaveFailure(null);
    setEditing(null);
    setForm(blank);
    setOptions(initialHrLookupOptions(entity));
    setReferenceReady(entity!=='hr_training_types');
    setDialogOpen(true);
  };

  const openEdit = (row: LookupRecord) => {
    if (uncertain || mutation.current) return;
    setSaveFailure(null);
    setEditing(row);
    setOptions(initialHrLookupOptions(entity,row));
    setReferenceReady(entity!=='hr_training_types');
    setForm({
      code: row.code,
      name_en: row.name_en,
      name_ar: row.name_ar ?? "",
      description: row.description ?? "",
      is_active: row.is_active,
      sort_order: String(row.sort_order),
    });
    setDialogOpen(true);
  };

  const run = async (row:LookupRecord|null,payload:Parameters<HrSettingsLookupProps['onCreate']>[0],toggle:boolean) => {
    if (!canManage || mutation.current || activation.current.retired) return;
    const active=activation.current;let confirmed=false;
    setIsSubmitting(true);
    setSaveFailure(null);
    mutation.current = true;
    retry.current=()=>run(row,payload,toggle);
    try {
      if(!pending.current&&row&&!/^[1-9]\d*$/.test(String(row.workspace_revision??''))){setSaveFailure('Reopen this record before saving. Its current revision is unavailable.');retry.current=null;return;}
      pending.current??={id:row?.id??null,payload:{...payload},toggle,contract:attempt.current.begin([entity,row?.id??null,toggle,payload],row?String(row.workspace_revision):null),hadUnknown:false};
      const request=pending.current;
      const updatedFields:Partial<HrLookupFormInput>={...request.payload};
      delete updatedFields.code;
      const res=request.toggle&&request.id!==null&&onToggle?await onToggle(request.id,request.payload.is_active,request.contract):request.id!==null?await onUpdate(request.id,updatedFields,request.contract):await onCreate(request.payload,request.contract);
      if(active.retired||pending.current!==request)return;
      if (res.success) {
        const receipt=hrLookupSaveReceipt.safeParse(res.data);
        if(!receipt.success||receipt.data.entity!==entity||(request.id!==null&&receipt.data.id!==request.id)){
          request.hadUnknown=true;
          setUncertain(true);setSaveFailure('Save response incomplete. Retry the same unchanged entries to recover the result.');return;
        }
        confirmed=true;attempt.current.resolved();pending.current=null;retry.current=null;setUncertain(false);
        if(request.id!==null)setRows(current=>current.map(item=>item.id===request.id?{...item,...updatedFields,workspace_revision:receipt.data.revision}:item));
        try{toast.success(!receipt.data.changed?'No changes to save':request.toggle?(request.payload.is_active?'Activated':'Deactivated'):request.id!==null?'Updated successfully':'Created successfully');}catch{setSaveFailure('Saved. The confirmation message could not be displayed.');}
        if(active.retired)return;
        if(!request.toggle)setDialogOpen(false);
        try{refresh();}catch{setSaveFailure('Saved. The list could not refresh; reopen it when the connection returns.');}
        if(active.retired)return;
        try{onAfterMutate?.();}catch{setSaveFailure('Saved. A related view could not refresh; reload that view when the connection returns.');}
      } else {
        request.hadUnknown ||= res.uncertain===true;
        setUncertain(request.hadUnknown);
        if(!request.hadUnknown){attempt.current.resolved();pending.current=null;retry.current=null;}
        // Only the server's known safe messages may cross this UI boundary.
        const safe=res.error&&/^(This HR record|This record changed|You no longer have permission|This HR code|A selected record|The change was rejected|Reopen this record|Global HR configuration)/.test(res.error);
        setSaveFailure(request.hadUnknown?'Save unconfirmed. Retry the same unchanged entries to recover the result.':safe?res.error!:"The record was not saved. Check your permissions and the entered values, then try again. Your entries are retained.");
      }
    } catch { if(active.retired)return;if(confirmed){setSaveFailure('Saved. Reopen the list to refresh the display.');return;}if(pending.current)pending.current.hadUnknown=true;setUncertain(true);setSaveFailure("Save unconfirmed. Retry the same unchanged entries to recover the result."); }
    finally {
      if(!active.retired&&activation.current===active){setIsSubmitting(false);mutation.current = false;}
    }
  };

  const handleSubmit=async()=>{
    if(uncertain){await retry.current?.();return;}
    if(readFailed||!referenceReady)return;
    const payload={...form,...hrLookupOptionPayload(entity,options),code:editing?.code??form.code.trim().toUpperCase(),name_ar:form.name_ar.trim()||null,description:form.description.trim()||null,sort_order:form.sort_order.trim()===''?NaN:Number(form.sort_order)};
    // Legacy codes are immutable, displayed unchanged and omitted from updates.
    const parsed=hrLookupSchemas[entity].safeParse({...payload,code:editing?'EXISTING':payload.code});
    if(!parsed.success){setSaveFailure('Check the required fields and configuration values. Your entries are retained.');return;}
    await run(editing,{...payload,name_en:payload.name_en.trim()},false);
  };

  const handleToggle = async (row: LookupRecord) => {
    if(!onToggle||!canManage||readFailed||uncertain||mutation.current)return;
    await run(row,{code:row.code,name_en:row.name_en,name_ar:row.name_ar,description:row.description,is_active:!row.is_active,sort_order:row.sort_order},true);
  };

  const f = (k: keyof FormState, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        actions={canManage ? (
          <Button size="sm" disabled={archiveBusy||uncertain||isSubmitting||readFailed} onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        ) : null}
      />

      {readFailed && <div role="alert" className="border border-destructive rounded-sm p-3 text-sm">Records could not be refreshed. Previous rows are retained; changes are paused. <Button type="button" variant="outline" onClick={() => refresh()}>Retry loading</Button></div>}
      {saveFailure&&!dialogOpen&&<div role="alert" className="rounded-sm border border-destructive p-3 text-sm">{saveFailure}{uncertain&&<Button variant="outline" disabled={isSubmitting} onClick={()=>retry.current?.()}>Retry same change</Button>}</div>}
      <div inert={archiveBusy || readFailed || isSubmitting || uncertain || undefined}><ERPSectionCard
        title="Records"
        description={`${rows.length} item${rows.length !== 1 ? "s" : ""}`}
        noPadding
        actions={
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input aria-label="Search"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search..."
              className="h-8 pl-7 text-xs"
            />
          </div>
        }
      >
        {rows.length === 0 ? (
          <ERPEmptyState icon={Settings2} title={`No ${title.toLowerCase()} yet`} description={canManage ? "Click Add to create the first entry." : "No records found."} />
        ) : (
          <div className="divide-y">
            <RecordCollection id="hr.hr-settings-lookup-page.HrSettingsLookupPage.rows" rows={rows} fields={[{"id":"code","path":"code","label":"Code"},{"id":"name_en","path":"name_en","label":"Name En"},{"id":"is_active","path":"is_active","label":"Is Active"}]} renderRecord={row => (
              <div key={row.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{row.name_en}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{row.code}</Badge>
                    {!row.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                  </div>
                  {row.name_ar && <p className="text-xs text-muted-foreground" dir="rtl">{row.name_ar}</p>}
                  {row.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{row.description}</p>}
                </div>
                {canManage && (
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    {onToggle && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleToggle(row)}>
                        <ToggleLeft className="h-3.5 w-3.5 mr-1" />
                        {row.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                    <Button aria-label="Edit record" variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(row)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button aria-label={`Archive ${row.code}`} variant="ghost" size="sm" onClick={()=>setArchiveTarget({id:row.id,code:row.code,name:row.name_en,revision:String(row.workspace_revision??'')})}>Archive</Button>
                  </div>
                )}
              </div>
            )} />
          </div>
        )}
      </ERPSectionCard></div>
      {canManage&&<HrSettingsLifecycle entity={entity} target={archiveTarget} onTargetChange={setArchiveTarget} onBusyChange={setArchiveBusy} disabled={dialogOpen||isSubmitting||uncertain||readFailed} onChanged={()=>{refresh();onAfterMutate?.();}}/>}

      {!canManage && <p role="note" className="text-sm text-muted-foreground">Read-only: these HR settings are shared across companies. Changing them requires global HR configuration permission; company or branch access alone does not allow changes.</p>}
      {isPending && <p className="text-xs text-muted-foreground text-center">Loading...</p>}

      {canManage && (
        <ERPChildDialogForm
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={editing ? `Edit ${title.replace(/ies$/, "y").replace(/s$/, "")}` : `Add ${title.replace(/ies$/, "y").replace(/s$/, "")}`}
          subtitle={editing ? "Update the record details below" : "Enter details to create a new record"}
          mode={editing ? "edit" : "add"}
          size="md"
          isSubmitting={isSubmitting}
          submitDisabled={(readFailed||!referenceReady)&&!uncertain}
          closeDisabled={uncertain}
          submitLabel={uncertain?'Retry same save':undefined}
          onSubmit={handleSubmit}
        >
          {saveFailure && <div role="alert" className="rounded-sm border border-destructive p-3 text-sm text-destructive">{saveFailure}</div>}
          <fieldset disabled={isSubmitting||uncertain} className="grid grid-cols-12 gap-4 min-w-0">
            <div className="col-span-4">
              <Label className="text-xs font-medium mb-1 block">Code <span className="text-destructive">*</span></Label>
              <Input aria-label="Code" required
                disabled={!!editing}
                pattern="(?:[A-Z0-9_]|-){1,50}"
                value={form.code}
                onChange={e => f("code", e.target.value.toUpperCase())}
                placeholder="e.g. STAFF"
                className="uppercase"
                maxLength={50}
              />
            </div>
            <div className="col-span-8">
              <Label className="text-xs font-medium mb-1 block">Name (English) <span className="text-destructive">*</span></Label>
              <Input aria-label="Name (English)" required pattern=".*\S.*" value={form.name_en} onChange={e => f("name_en", e.target.value)} placeholder="Enter English name" maxLength={200} />
            </div>
            <div className="col-span-12">
              <Label className="text-xs font-medium mb-1 block">Name (Arabic)</Label>
              <Input aria-label="Name (Arabic)" value={form.name_ar} onChange={e => f("name_ar", e.target.value)} placeholder="Enter Arabic name" dir="rtl" maxLength={200} />
            </div>
            <div className="col-span-9">
              <Label className="text-xs font-medium mb-1 block">Description</Label>
              <Input aria-label="Description" value={form.description} onChange={e => f("description", e.target.value)} placeholder="Optional description" maxLength={1000} />
            </div>
            <div className="col-span-3">
              <Label className="text-xs font-medium mb-1 block">Sort Order</Label>
              <Input aria-label="Sort Order" type="number" required step={1} value={form.sort_order} onChange={e => f("sort_order", e.target.value)} min={0} max={9999} />
            </div>
            <div className="col-span-12 flex items-center gap-3">
              <Switch id="is_active" checked={form.is_active} onCheckedChange={v => f("is_active", v)} />
              <Label htmlFor="is_active" className="text-sm cursor-pointer">Active</Label>
            </div>
            {dialogOpen&&<HrLookupOptionControls entity={entity} values={options} disabled={isSubmitting||uncertain} existingTrainingCategoryId={editing?.training_category_id} existingTrainingCategoryName={editing?.training_category?.name_en} onReferenceReady={setReferenceReady} onChange={(key,value)=>setOptions(current=>({...current,[key]:value}))}/>}
          </fieldset>
        </ERPChildDialogForm>
      )}
    </div>
  );
}
