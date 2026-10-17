"use client";
import { RecordCollection } from "@/components/erp/table/record-collection";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Building } from "lucide-react";
import { toast } from "sonner";
import { useOwnerCompaniesQuery } from "@/hooks/lookups/use-org-queries";
import { useEmiratesQuery } from "@/hooks/lookups/use-geography-queries";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import {createWorkspaceSaveAttempt,type WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {hrLookupSaveReceipt} from '@/lib/hr/settings-save-contract';
import {hrSpecializedSchemas} from '@/lib/hr/specialized-settings-contract';
import {HrSettingsLifecycle,type HrArchiveTarget} from './hr-settings-lifecycle';
import type {
  createHrMohreEstablishment,
  updateHrMohreEstablishment,
  listHrMohreEstablishments,
  ActionResult,
} from "@/server/actions/hr/settings";

type ListResult = Awaited<ReturnType<typeof listHrMohreEstablishments>>;
type MohreRow = NonNullable<NonNullable<ListResult["data"]>["data"]>[number];

type FormState = {
  owner_company_id: number | null;
  establishment_number: string;
  establishment_name: string;
  emirate_id: number | null;
  status: "active" | "inactive";
  notes: string;
};

const blank: FormState = {
  owner_company_id: null,
  establishment_number: "",
  establishment_name: "",
  emirate_id: null,
  status: "active",
  notes: "",
};

/** MOHRE establishment name must match the owner company's legal English name. */
function companyLegalNameEn(
  companyId: number | null,
  options: ERPComboboxOption[]
): string {
  if (!companyId) return "";
  const opt = options.find((c) => c.value === companyId);
  if (!opt) return "";
  const raw = opt.raw as { legal_name_en?: string } | undefined;
  return raw?.legal_name_en ?? opt.description ?? opt.label ?? "";
}

type Props = {
  principalId?: number;
  initialData: MohreRow[];
  canManage: boolean;
  onCreate: (input: Parameters<typeof createHrMohreEstablishment>[0],contract?:WorkspaceSaveContract) => Promise<ActionResult<{ id: number }>>;
  onUpdate: (id: number, input: Parameters<typeof updateHrMohreEstablishment>[1],contract?:WorkspaceSaveContract) => Promise<ActionResult>;
};

export function HrMohreEstablishmentsPage(props:Props){return <MohreSession key={`${props.principalId??'unknown'}:${props.canManage}`} {...props}/>;}
function MohreSession({ initialData, canManage, onCreate, onUpdate }: Props) {
  const router = useRouter();
  const rows = initialData;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MohreRow | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError,setSaveError]=useState<string|null>(null),[uncertain,setUncertain]=useState(false);
  const [archiveTarget,setArchiveTarget]=useState<HrArchiveTarget|null>(null),[archiveBusy,setArchiveBusy]=useState(false);
  const attempt=useRef(createWorkspaceSaveAttempt()),flight=useRef(false),retry=useRef<(()=>Promise<void>)|null>(null);
  const pending=useRef<{id:number|null;payload:Parameters<typeof createHrMohreEstablishment>[0];contract:WorkspaceSaveContract;hadUnknown:boolean}|null>(null),activation=useRef({retired:false});
  useEffect(()=>{const current={retired:false};activation.current=current;return()=>{current.retired=true;};},[]);

  const companies = useOwnerCompaniesQuery();
  const emirates = useEmiratesQuery();
  const companyOptions=companies.options,emirateOptions=emirates.options;
  const lookupFailed=!!(companies.error||emirates.error);
  const currentCompanies=editing&&!companyOptions.some(o=>o.value===editing.owner_company_id)?[...companyOptions,{value:editing.owner_company_id,label:editing.owner_company?.legal_name_en??editing.establishment_name}]:companyOptions;
  const currentEmirates=editing?.emirate_id&&!emirateOptions.some(o=>o.value===editing.emirate_id)?[...emirateOptions,{value:editing.emirate_id,label:editing.emirate?.name_en??'Existing emirate (details unavailable)'}]:emirateOptions;

  function openAdd() {
    if(!canManage||flight.current||uncertain)return;
    setSaveError(null);attempt.current.resolved();
    setEditing(null);
    setForm(blank);
    setDialogOpen(true);
  }

  function openEdit(row: MohreRow) {
    if(!canManage||flight.current||uncertain)return;
    setSaveError(null);attempt.current.resolved();
    setEditing(row);
    const companyId = row.owner_company_id ?? null;
    setForm({
      owner_company_id: companyId,
      establishment_number: row.establishment_number ?? "",
      establishment_name: row.establishment_name,
      emirate_id: row.emirate_id ?? null,
      status: (row.status as "active" | "inactive") ?? "active",
      notes: row.notes??"",
    });
    setDialogOpen(true);
  }

  function handleCompanyChange(value: string | number | null) {
    const companyId = value ? Number(value) : null;
    const legalName = companyLegalNameEn(companyId, companyOptions);
    setForm((f) => ({
      ...f,
      owner_company_id: companyId,
      establishment_name: legalName,
    }));
  }

  async function run(payload:Parameters<typeof createHrMohreEstablishment>[0]){
    if(!canManage||flight.current||activation.current.retired)return;
    const active=activation.current;let confirmed=false;
    flight.current=true;setIsSubmitting(true);setSaveError(null);retry.current=()=>run(payload);
    try{
      if(!pending.current&&editing&&!/^[1-9]\d*$/.test(String(editing.workspace_revision??''))){setSaveError('Reopen this record before saving. Its current revision is unavailable.');retry.current=null;return;}
      pending.current??={id:editing?.id??null,payload:{...payload},contract:attempt.current.begin(['hr_mohre_establishments',editing?.id??null,payload],editing?String(editing.workspace_revision):null),hadUnknown:false};const request=pending.current;
      const patch:Partial<typeof payload>={...request.payload};delete patch.owner_company_id;delete patch.establishment_number;
      const result=request.id!==null?await onUpdate(request.id,patch,request.contract):await onCreate(request.payload,request.contract);
      if(active.retired||pending.current!==request)return;
      if(!result.success){
        request.hadUnknown ||= result.uncertain===true;setUncertain(request.hadUnknown);
        if(!request.hadUnknown){attempt.current.resolved();pending.current=null;retry.current=null;}
        const safe=result.error&&/^(This HR record|This record changed|You no longer have permission|This HR record identity|A selected record|The change was rejected|Reopen this record|Global HR configuration)/.test(result.error);
        setSaveError(request.hadUnknown?'Save unconfirmed. Retry the same unchanged entries.':safe?result.error!:'The establishment was not saved. Check your permissions and entries. Your entries are retained.');return;
      }
      const receipt=hrLookupSaveReceipt.safeParse(result.data);
      if(!receipt.success||receipt.data.entity!=='hr_mohre_establishments'||(request.id!==null&&receipt.data.id!==request.id)){request.hadUnknown=true;setUncertain(true);setSaveError('Save response incomplete. Retry the same unchanged entries.');return;}
      confirmed=true;attempt.current.resolved();pending.current=null;retry.current=null;setUncertain(false);setDialogOpen(false);
      try{toast.success(!receipt.data.changed?'No changes to save':request.id!==null?'Establishment updated':'Establishment created');}catch{setSaveError('Saved. The confirmation message could not be displayed.');}
      if(active.retired)return;
      try{router.refresh();}catch{setSaveError('Saved. The list could not refresh; reopen it when the connection returns.');}
    }catch{if(active.retired)return;if(confirmed){setSaveError('Saved. Reopen the list to refresh the display.');return;}if(pending.current)pending.current.hadUnknown=true;setUncertain(true);setSaveError('Save unconfirmed. Retry the same unchanged entries.');}
    finally{if(!active.retired&&activation.current===active){flight.current=false;setIsSubmitting(false);}}
  }
  async function handleSubmit(){
    if(uncertain){await retry.current?.();return;}
    if(lookupFailed)return;
    const parsed=hrSpecializedSchemas.hr_mohre_establishments.safeParse({...form,notes:form.notes.trim()||null});
    if(!parsed.success){setSaveError('Check the company, establishment number and required details. Your entries are retained.');return;}
    await run(parsed.data);
  }

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="MOHRE Establishments"
        description="Ministry of Human Resources & Emiratisation registered establishment numbers per company"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "HR Settings", href: "/admin/hr/settings" },
          { label: "MOHRE Establishments" },
        ]}
        actions={canManage ? (
          <Button size="sm" disabled={archiveBusy||isSubmitting||uncertain} onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add Establishment
          </Button>
        ) : undefined}
      />
      {!canManage&&<p className="text-sm text-muted-foreground">Read-only: global HR configuration permission is required to change shared establishments.</p>}
      {!dialogOpen&&saveError&&<p role="alert" className="text-sm text-destructive">{saveError}</p>}

      <ERPSectionCard
        title="Registered Establishments"
        description={`${rows.length} establishment${rows.length !== 1 ? "s" : ""}`}
        noPadding
      >
        {rows.length === 0 ? (
          <ERPEmptyState
            icon={Building}
            title="No MOHRE establishments configured"
            description={canManage
              ? "Click 'Add Establishment' above to register your first MOHRE establishment number."
              : "Contact your HR administrator to configure MOHRE establishment numbers."}
            actionLabel={canManage ? "Add Establishment" : undefined}
            onAction={canManage ? openAdd : undefined}
          />
        ) : (
          <div className="divide-y">
            <RecordCollection id="hr.hr-mohre-establishments-page.HrMohreEstablishmentsPage.rows" rows={rows} fields={[{"id":"establishment_name","path":"establishment_name","label":"Establishment Name"},{"id":"establishment_number","path":"establishment_number","label":"Establishment Number"}]} renderRecord={(row) => (
              <div key={row.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {(row.owner_company as { legal_name_en?: string } | null)?.legal_name_en ??
                        row.establishment_name}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {row.establishment_number}
                    </Badge>
                    <Badge
                      variant={row.status === "active" ? "secondary" : "destructive"}
                      className="text-[10px]"
                    >
                      {row.status}
                    </Badge>
                  </div>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2"><Button disabled={archiveBusy||isSubmitting||uncertain} aria-label="Edit record" size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(row)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button><Button disabled={archiveBusy||isSubmitting||uncertain} variant="ghost" size="sm" aria-label={`Archive ${row.establishment_number}`} onClick={()=>setArchiveTarget({id:row.id,code:row.establishment_number,name:row.establishment_name,revision:String(row.workspace_revision??'')})}>Archive</Button></div>
                )}
              </div>
            )} />
          </div>
        )}
      </ERPSectionCard>
      {canManage&&<HrSettingsLifecycle entity="hr_mohre_establishments" target={archiveTarget} onTargetChange={setArchiveTarget} onBusyChange={setArchiveBusy} disabled={dialogOpen||isSubmitting||uncertain} onChanged={()=>router.refresh()}/>}

      {/* Add / Edit Dialog */}
      {canManage&&<ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit MOHRE Establishment" : "Add MOHRE Establishment"}
        subtitle="Enter MOHRE (Ministry of Human Resources) registered establishment details"
        icon={<Building className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isSubmitting}
        closeDisabled={uncertain}
        submitDisabled={lookupFailed&&!uncertain}
        submitLabel={uncertain?'Retry same save':undefined}
        onSubmit={handleSubmit}
      >
        {saveError&&<p role="alert" className="rounded-sm border border-destructive p-3 text-sm text-destructive">{saveError}</p>}
        {lookupFailed&&<div role="alert" className="text-sm text-destructive">Reference choices could not load. Your entries are retained. <Button variant="outline" size="sm" onClick={()=>{companies.refetch();emirates.refetch();}}>Retry choices</Button></div>}
        <fieldset disabled={isSubmitting||uncertain} className="grid min-w-0 grid-cols-12 gap-4">

          {/* Company — establishment name follows company legal name */}
          <div className="col-span-12">
            <Label>Company <span className="text-destructive">*</span></Label>
            <ERPCombobox ariaLabel="Company" name="owner_company_id"
              value={form.owner_company_id}
              onValueChange={handleCompanyChange}
              options={currentCompanies}
              disabled={!!editing||uncertain||isSubmitting}
              placeholder="Select company..."
              required
            />
            {form.owner_company_id && form.establishment_name && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                MOHRE establishment name:{" "}
                <span className="font-medium text-foreground">{form.establishment_name}</span>
                {editing?' (saved establishment name)':' (same as company legal name)'}
              </p>
            )}
          </div>

          {/* Establishment Number */}
          <div className="col-span-12 sm:col-span-6">
            <Label>MOHRE Establishment Number <span className="text-destructive">*</span></Label>
            <Input aria-label="MOHRE Establishment Number" required
              disabled={!!editing}
              pattern=".*\S.*"
              value={form.establishment_number}
              onChange={(e) => setForm((f) => ({ ...f, establishment_number: e.target.value }))}
              placeholder="e.g. 12345678"
              maxLength={100}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              The official number from the MOHRE portal
            </p>
          </div>

          {/* Status */}
          <div className="col-span-12 sm:col-span-6">
            <Label>Status</Label>
            <ERPCombobox ariaLabel="Status" name="status"
              disabled={uncertain||isSubmitting}
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: (v as "active" | "inactive") || "active" }))}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
              placeholder="Select status..."
            />
          </div>

          {/* Emirate */}
          <div className="col-span-12">
            <Label>Emirate (Optional)</Label>
            <ERPCombobox ariaLabel="Emirate (Optional)" name="emirate_id"
              value={form.emirate_id}
              onValueChange={(v) => setForm((f) => ({ ...f, emirate_id: v ? Number(v) : null }))}
              options={currentEmirates}
              disabled={uncertain||isSubmitting}
              placeholder="Select emirate..."
            />
          </div>
          <div className="col-span-12"><Label htmlFor="mohre-notes">Notes</Label><Textarea id="mohre-notes" maxLength={2000} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
        </fieldset>
      </ERPChildDialogForm>}
    </div>
  );
}
