"use client";
import { reportWorkspaceFieldErrors,workspaceValidationFailure } from "@/lib/workspace/field-errors";
import {createDepartmentSchema} from '@/lib/master-data/department-validation';
import {departmentSaveReceiptSchema} from '@/lib/master-data/department-save-receipt';
import {canChooseDepartmentCompany,canManageDepartment,canOpenDepartmentEditor} from '@/lib/master-data/department-permissions';
import {BranchSelect} from '@/components/erp/organizations/branch-select';
import type {DepartmentScopeCatalogue} from '@/lib/master-data/department-scope-catalogue';
import {mapBranchToOption} from '@/lib/lookups/option-mappers';
import {useQueryClient} from '@tanstack/react-query';
import {queryKeys} from '@/lib/query/query-keys';
import {useWorkspaceSaveSession} from "@/hooks/use-workspace-save-session";

import { RequiredLabel } from "@/components/erp/required-label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ERPRecordSectionPanel, ERPRecordWorkspaceForm } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceFormOwner } from "@/hooks/use-workspace-form-owner";
import { useWorkspaceFormSection } from "@/hooks/use-workspace-form-section";
import { useWorkspaceControlledDraft, type WorkspaceDraftCodec } from "@/hooks/use-workspace-controlled-draft";
import { createSaveAdmission } from "@/lib/workspace/save-admission";
import { DraftRestoredNotice } from "@/components/workspace/draft-restored-notice";
import type { AuthContext } from "@/lib/rbac/check";
import type { DepartmentRow } from "@/server/actions/common-master-data/departments";
import { createDepartment, updateDepartment } from "@/server/actions/common-master-data/departments";
import { Building2, ScrollText } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Props = {
  department?: DepartmentRow | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  companies?: { id: number; legal_name_en: string; company_code: string }[];
  branches?: DepartmentScopeCatalogue['branches'];
};

const FORM_ID = "department-workspace-form";
const SECTION_IDS = ["basic", "notes"];
function initialValues(department?: DepartmentRow | null) {
  return {
    owner_company_id: String(department?.owner_company_id ?? ""),
    branch_id: String(department?.branch_id ?? ""),
    department_code: department?.department_code ?? "",
    department_name_en: department?.department_name_en ?? "",
    department_name_ar: department?.department_name_ar ?? "",
    description: department?.description ?? "",
    effective_from: department?.effective_from ?? "",
    effective_to: department?.effective_to ?? "",
    is_active: department?.is_active ?? true,
  };
}
type DepartmentFormState = ReturnType<typeof initialValues>;
const departmentCodec: WorkspaceDraftCodec<DepartmentFormState> = {
  encode: values => Object.fromEntries(Object.entries(values).map(([field, value]) => [field, String(value)])),
  restore: (initial, read) => Object.fromEntries(Object.entries(initial).map(([field, value]) =>
    [field, field === "is_active" ? read(field, String(value)) === "true" : read(field, String(value))]
  )) as DepartmentFormState,
};

export function DepartmentWorkspaceForm(props: Props) {
  return <DepartmentWorkspaceFormInstance key={`${props.authContext.profile?.id??'none'}:${props.department?.id ?? "new"}:${props.mode}`} {...props} />;
}

function DepartmentWorkspaceFormInstance({ department, mode, companies = [],branches,authContext }: Props) {
  const { closeTab, markDirty, updateTabRoute, isTabActive } = useWorkspace();
  const owner = useWorkspaceFormOwner();
  const router = useRouter();
  const queryClient=useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveUnconfirmed,setSaveUnconfirmed]=useState(false);
  const [activeSection, setActiveSection] = useWorkspaceFormSection(FORM_ID, "basic", SECTION_IDS);
  const [admission] = useState(createSaveAdmission);
  const saveSession = useWorkspaceSaveSession(FORM_ID, department?.id ?? null, department?.workspace_revision);
  const recordId = useRef(saveSession.id);
  const immutableCode = useRef(department?.department_code ?? null);
  const [savedId, setSavedId] = useState(saveSession.id);
  const isEditing = savedId !== null;
  const isViewing = mode === "view"||!canOpenDepartmentEditor(authContext)||(!!department&&!canManageDepartment(authContext,department.owner_company_id,department.branch_id));
  const disabled = isViewing||isSubmitting||saveUnconfirmed;

  const {value: form, setValue: setForm, isDirty, acceptSaved, getCurrent, restoredFromDraft} = useWorkspaceControlledDraft({
    formId: FORM_ID, initialValue: initialValues(department), codec: departmentCodec, enabled: !isViewing,
  });
  const field = <K extends keyof DepartmentFormState>(name: K, value: DepartmentFormState[K]) => setForm(old => ({...old, [name]: value}));

  const sections = [
    { id: "basic", label: "Department Info", icon: Building2 },
    { id: "notes", label: "Notes", icon: ScrollText },
  ];

  const handleRequestClose = () => { if (owner) closeTab(owner.id); };

  const handleSave = async (closeAfter = false): Promise<boolean> => {
    if (isViewing || !admission.enter()) return false;
    setIsSubmitting(true);
    const submitted = getCurrent();
    const data = {
      department_code: immutableCode.current ?? submitted.department_code,
      department_name_en: submitted.department_name_en,
      department_name_ar: submitted.department_name_ar || null,
      owner_company_id: Number(submitted.owner_company_id),
      // Controls not owned by this form must not erase existing associations.
      branch_id: submitted.branch_id?Number(submitted.branch_id):null,
      parent_department_id: department?.parent_department_id ?? null,
      cost_center_id: department?.cost_center_id ?? null,
      department_head_user_id: department?.department_head_user_id ?? null,
      description: submitted.description || null,
      is_active: submitted.is_active,
      effective_from: submitted.effective_from || null,
      effective_to: submitted.effective_to || null,
    };
    let dispatched=false;
    try {
      const element = document.getElementById(FORM_ID) as HTMLFormElement | null;
      const parsed=createDepartmentSchema.safeParse(data);
      if (!element || !parsed.success) {
        setActiveSection("basic");
        if(!parsed.success)reportWorkspaceFieldErrors(element,workspaceValidationFailure(parsed.error.issues).fieldErrors);
        toast.error("Check the highlighted fields before saving.");
        return false;
      }
      if(!canManageDepartment(authContext,parsed.data.owner_company_id,parsed.data.branch_id??null)){
        const scopeField=canChooseDepartmentCompany(authContext,parsed.data.owner_company_id)?'branch_id':'owner_company_id';
        reportWorkspaceFieldErrors(element,{[scopeField]:'Choose a company and branch you are allowed to manage.'});toast.error('You do not have permission to manage this department.');return false;
      }
      const wasNew = recordId.current === null;
      const contract=saveSession.begin(parsed.data);dispatched=true;
      const result = recordId.current !== null
        ? await updateDepartment({ ...parsed.data, id: recordId.current },contract)
        : await createDepartment(parsed.data,contract);
      if (!result.success && !result.uncertain) saveSession.rejected();
      if (result.success) {
        const receipt=departmentSaveReceiptSchema.safeParse(result.data);
        if(!receipt.success||(recordId.current!==null&&receipt.data.id!==recordId.current)||receipt.data.owner_company_id!==parsed.data.owner_company_id||receipt.data.branch_id!==(parsed.data.branch_id??null)){
          setSaveUnconfirmed(true);toast.error('Save unconfirmed. Retry the same values to recover its result.');return false;
        }
        saveSession.accept(receipt.data);recordId.current=receipt.data.id;immutableCode.current=parsed.data.department_code;setSavedId(receipt.data.id);setSaveUnconfirmed(false);
        const unchanged = acceptSaved(submitted);
        const route = `/admin/common-master-data/departments/record/${recordId.current}?mode=edit`;
        toast.success(receipt.data.changed===false?'No changes to save':wasNew ? "Department created" : "Department updated");
        try{
          await queryClient.invalidateQueries({queryKey:queryKeys.commonMd.departments()});
          if (owner) { markDirty(owner.id, !unchanged); updateTabRoute(owner.id, route, recordId.current!, "edit"); }
          if (closeAfter && unchanged && owner) closeTab(owner.id, {force:true});
          else if (wasNew && owner && isTabActive(owner.id)) router.replace(route);
        }catch{toast.error('Department saved, but its display could not refresh. Reopen the list before continuing.');}
        return true;
      }
      setSaveUnconfirmed(result.uncertain===true);
      reportWorkspaceFieldErrors(element, result.fieldErrors);
      toast.error(result.error ?? "Failed to save");
      return false;
    } catch { if(dispatched)setSaveUnconfirmed(true);toast.error('Save unconfirmed. Retry its unchanged values or reopen the record to reconcile it before saving different data.');return false; }
    finally { admission.leave(); setIsSubmitting(false); }
  };

  const handleSaveAndClose = () => handleSave(true);

  return (
    <ERPRecordWorkspaceForm
      mode={isViewing ? "view" : isEditing ? "edit" : "add"}
      title={isViewing ? "View Department" : isEditing ? "Edit Department" : "New Department"}
      subtitle={department ? `${department.department_name_en} (${department.department_code})` : "Create a new department"}
      recordCode={department?.department_code}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={isDirty}
      onSave={isViewing ? undefined : () => handleSave()}
      onSaveAndClose={isViewing ? undefined : handleSaveAndClose}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
    >
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
        <DraftRestoredNotice visible={!isViewing && restoredFromDraft} />
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Department Details">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="owner_company_id">Organization</RequiredLabel>
              <select id="owner_company_id" name="owner_company_id" value={form.owner_company_id} onChange={e => setForm(old=>({...old,owner_company_id:e.target.value,branch_id:''}))} required disabled={disabled||isEditing} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">Select organization...</option>
                {form.owner_company_id&&!companies.some(c=>String(c.id)===form.owner_company_id)&&<option value={form.owner_company_id}>{department?.owner_company?.legal_name_en??'Unavailable organization'} (current selection)</option>}
                {companies.map(c => <option key={c.id} value={c.id} disabled={!canChooseDepartmentCompany(authContext,c.id)}>{c.legal_name_en} ({c.company_code})</option>)}
              </select>
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <Label htmlFor="branch_id" className="text-muted-foreground text-xs">Branch</Label>
              {department?<Input id="branch_id" aria-label="Branch" value={department.branch_id===null?'All branches':department.branch?.branch_name_en??'Current branch unavailable'} disabled/>:
               <BranchSelect name="branch_id" value={form.branch_id?Number(form.branch_id):null} ownerCompanyId={form.owner_company_id?Number(form.owner_company_id):null}
                authorizedOptions={branches?.filter(b=>String(b.owner_company_id)===form.owner_company_id&&b.status==='active'&&b.can_manage).map(mapBranchToOption)}
                onValueChange={value=>field('branch_id',value===null?'':String(value))} disabled={disabled||isEditing||!form.owner_company_id}
                required={!!form.owner_company_id&&!canManageDepartment(authContext,Number(form.owner_company_id),null)} includeInactive={isEditing} allowClear
                placeholder={form.owner_company_id&&canManageDepartment(authContext,Number(form.owner_company_id),null)?'All branches (or choose one)':'Choose your permitted branch'}/>}
              <p className="text-xs text-muted-foreground">Company and branch ownership cannot change after creation.</p>
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="department_code">Department Code</RequiredLabel>
              <Input id="department_code" name="department_code" className="uppercase" value={form.department_code} onChange={e => field("department_code", e.target.value)} disabled={disabled || isEditing || isSubmitting} required maxLength={20} placeholder="e.g., HR, FIN, OPS" />
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="department_name_en">Name (English)</RequiredLabel>
              <Input id="department_name_en" name="department_name_en" value={form.department_name_en} onChange={e => field("department_name_en", e.target.value)} disabled={disabled} required maxLength={200} />
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <Label htmlFor="department_name_ar" className="text-muted-foreground text-xs">Name (Arabic)</Label>
              <Input id="department_name_ar" name="department_name_ar" value={form.department_name_ar} onChange={e => field("department_name_ar", e.target.value)} disabled={disabled} dir="rtl" maxLength={200} />
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <Label htmlFor="effective_from" className="text-muted-foreground text-xs">Effective From</Label>
              <Input type="date" id="effective_from" name="effective_from" value={form.effective_from} onChange={e => field("effective_from", e.target.value)} disabled={disabled} />
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <Label htmlFor="effective_to" className="text-muted-foreground text-xs">Effective To</Label>
              <Input type="date" id="effective_to" name="effective_to" value={form.effective_to} onChange={e => field("effective_to", e.target.value)} disabled={disabled} />
            </div>
            <div className="col-span-12 flex items-center space-x-2">
              <Checkbox id="is_active" name="is_active" checked={form.is_active} onCheckedChange={checked => field("is_active", checked === true)} disabled={disabled} />
              <Label htmlFor="is_active" className="cursor-pointer text-muted-foreground text-xs font-normal">Active</Label>
            </div>
          </div>
        </ERPRecordSectionPanel>
        <ERPRecordSectionPanel id="notes" activeId={activeSection} title="Description">
          <div className="space-y-2">
            <Label htmlFor="description" className="text-muted-foreground text-xs">Description</Label>
            <Textarea id="description" name="description" value={form.description} onChange={e => field("description", e.target.value)} rows={6} disabled={disabled} maxLength={1000} />
          </div>
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
