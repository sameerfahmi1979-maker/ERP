"use client";

import { ERPCombobox,type ERPComboboxOption } from "@/components/erp/combobox";
import {Button} from '@/components/ui/button';
import type {AuthContext} from '@/lib/rbac/check';
import {hrReadIdentity} from '@/lib/reads/hr-read-identity';
import {readJson,retryAuthorizedRead} from '@/lib/reads/client';
import {employeeProfileChoices,type EmployeeChoiceKind} from '@/lib/hr/employee-profile-choices';
import { CountrySelect } from "@/components/erp/geography/country-select";
import { BranchSelect } from "@/components/erp/organizations/branch-select";
import { OwnerCompanySelect } from "@/components/erp/organizations/owner-company-select";
import { RequiredLabel } from "@/components/erp/required-label";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EmployeeListRow } from "@/server/actions/hr/employees";
import { useQuery } from "@tanstack/react-query";
import {employmentChangeSummary,employmentFieldLabel} from '@/lib/hr/employee-foundation';
import {EmployeeNameReviewControl}from '../employee-foundation-review';
import {SubjectPhoto}from '../subject-photo';

type Props = {
  authContext:AuthContext;
  employee: EmployeeListRow | null;
  mode: "add" | "edit" | "view";
  canManageMedical?: boolean;
  // All editable values share one memory-only draft adapter.
  form: EmployeeProfileFormState;
  setForm: (updater: (prev: EmployeeProfileFormState) => EmployeeProfileFormState) => void;
};

export type EmployeeProfileFormState = {
  photo_dms_document_id?:number|null;
  employment_change_reason: string;
  employment_effective_date: string;
  full_name_en: string;
  full_name_ar: string;
  known_name: string;
  date_of_birth: string;
  mobile_number: string;
  personal_email: string;
  uae_address: string;
  home_country_address: string;
  joining_date: string;
  actual_joining_date: string;
  contract_start_date: string;
  contract_end_date: string;
  probation_start_date: string;
  probation_end_date: string;
  notice_period_days: string;
  emergency_contact_name: string;
  emergency_contact_mobile: string;
  owner_company_id: number | null;
  branch_id: number | null;
  department_id: number | null;
  designation_id: number | null;
  employee_category_id: number | null;
  employment_type_id: number | null;
  employee_status: string;
  nationality_id: number | null;
  reporting_manager_id: number | null;
  supervisor_id: number | null;
  primary_work_site_id: number | null;
  sponsor_company_id: number | null;
  mohre_establishment_id: number | null;
  gender: string;
  marital_status: string;
  blood_group: string;
  contract_type: string;
  emergency_contact_relationship_type_id: number | null;
};

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const MARITAL_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
];

const BLOOD_GROUP_OPTIONS = [
  { value: "A+", label: "A+" },
  { value: "A-", label: "A-" },
  { value: "B+", label: "B+" },
  { value: "B-", label: "B-" },
  { value: "O+", label: "O+" },
  { value: "O-", label: "O-" },
  { value: "AB+", label: "AB+" },
  { value: "AB-", label: "AB-" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "probation", label: "Probation" },
  { value: "on_leave", label: "On Leave" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "terminated", label: "Terminated" },
];

const CONTRACT_TYPE_OPTIONS = [
  { value: "limited", label: "Limited" },
  { value: "unlimited", label: "Unlimited" },
];

export function EmployeeProfileTab({
  authContext,
  employee,
  mode,
  form,
  setForm,
  canManageMedical = false,
}: Props) {
  const disabled = mode === "view";
  const changeReview=employee?employmentChangeSummary(employee,form):null;
  const employmentChanged=!!changeReview?.fields.length;

  const params={companyId:form.owner_company_id,branchId:form.branch_id,departmentId:form.department_id,selected:{departments:form.department_id,designations:form.designation_id,sites:form.primary_work_site_id,categories:form.employee_category_id,employment:form.employment_type_id,mohre:form.mohre_establishment_id,relationships:form.emergency_contact_relationship_type_id}};
  const choices=useQuery({queryKey:['hr','profile-choices',hrReadIdentity(authContext),params],enabled:!disabled,staleTime:0,gcTime:0,retry:retryAuthorizedRead,queryFn:async({signal})=>{
    const result=await readJson<{success:true;data:unknown}>('employee-profile-choices',params,signal);return employeeProfileChoices.parse(result.data);
  }});
  const available=(kind:EmployeeChoiceKind)=>disabled||choices.data?.[kind].status==='ready';
  const options=(kind:EmployeeChoiceKind,id:number|null,saved:{id:number;label:string}|null|undefined)=>{
    const group=choices.data?.[kind],values:ERPComboboxOption[]=group?.status==='ready'?[...group.options]:[];
    if(id!==null&&!values.some(v=>v.value===id))values.unshift({value:id,label:saved?.id===id?saved.label:`Saved reference #${id} (unavailable)`,disabled:true});
    return values;
  };
  const departmentOptions=options('departments',form.department_id,employee?.department?{id:employee.department.id,label:employee.department.department_name_en}:null);
  const designationOptions=options('designations',form.designation_id,employee?.designation?{id:employee.designation.id,label:employee.designation.designation_name_en}:null);
  const siteOptions=options('sites',form.primary_work_site_id,employee?.primary_work_site?{id:employee.primary_work_site.id,label:employee.primary_work_site.site_name}:null);
  const categoryOptions=options('categories',form.employee_category_id,employee?.employee_category?{id:employee.employee_category.id,label:employee.employee_category.name_en}:null);
  const employmentOptions=options('employment',form.employment_type_id,employee?.employment_type?{id:employee.employment_type.id,label:employee.employment_type.name_en}:null);
  const mohreEstablishmentOptions=options('mohre',form.mohre_establishment_id,employee?.mohre_establishment?{id:employee.mohre_establishment.id,label:employee.mohre_establishment.establishment_name}:null);
  const relationshipOptions=options('relationships',form.emergency_contact_relationship_type_id,null);
  const choiceProblems=!disabled&&(choices.isError||Object.values(choices.data??{}).some(group=>group.status!=='ready'));

  return (
    <div className="space-y-8 p-0 md:p-2">
      <SubjectPhoto employee={employee?.id??null}identity={hrReadIdentity(authContext)}value={form.photo_dms_document_id??null}disabled={disabled}onValue={value=>setForm(old=>({...old,photo_dms_document_id:value}))}/>
      {!disabled&&<EmployeeNameReviewControl authContext={authContext} name={form.full_name_en} companyId={form.owner_company_id} employeeId={employee?.id}/>}
      {choiceProblems&&<div role="alert" className="rounded border p-3 text-sm"><p>Some choice lists are unavailable or restricted. Saved references are retained; permitted personal fields remain editable. Unavailable choices cannot be changed.</p><Button type="button" variant="outline" disabled={choices.isFetching} onClick={()=>void choices.refetch()}>Retry choices</Button></div>}
      {/* ── Personal Information ─────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Personal Information
        </h3>
        <div className="grid grid-cols-12 gap-4">
          {/* Employee Code (read-only always) */}
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label htmlFor="employee_code_display">Employee Code</Label>
            <Input
              id="employee_code_display"
              value={employee?.employee_code ?? "(Auto-generated)"}
              readOnly
              disabled
              className="bg-muted/50 font-mono"
            />
          </div>

          <div className="hidden xl:block col-span-8" /> {/* spacer */}

          <div className="col-span-12 sm:col-span-6 space-y-1.5">
            <RequiredLabel htmlFor="full_name_en">Full Name (English)</RequiredLabel>
            <Input
              id="full_name_en"
              name="full_name_en"
              value={form.full_name_en}
              onChange={event => setForm(previous => ({...previous, full_name_en: event.target.value}))}
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-12 sm:col-span-6 space-y-1.5">
            <Label htmlFor="full_name_ar">Full Name (Arabic)</Label>
            <Input
              id="full_name_ar"
              name="full_name_ar"
              dir="rtl"
              value={form.full_name_ar}
              onChange={event => setForm(previous => ({...previous, full_name_ar: event.target.value}))}
              disabled={disabled}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label htmlFor="known_name">Known Name</Label>
            <Input
              id="known_name"
              name="known_name"
              value={form.known_name}
              onChange={event => setForm(previous => ({...previous, known_name: event.target.value}))}
              disabled={disabled}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <RequiredLabel htmlFor="gender">Gender</RequiredLabel>
            <ERPCombobox name="gender" ariaLabel="Gender"
              value={form.gender}
              onValueChange={(v) => setForm((p) => ({ ...p, gender: v as string }))}
              options={GENDER_OPTIONS}
              placeholder="Select gender..."
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label htmlFor="marital_status">Marital Status</Label>
            <ERPCombobox ariaLabel="Marital Status" name="marital_status"
              value={form.marital_status}
              onValueChange={(v) => setForm((p) => ({ ...p, marital_status: v as string }))}
              options={MARITAL_OPTIONS}
              placeholder="Select..."
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label htmlFor="nationality_id">Nationality</Label>
            {disabled?<Input aria-label="Nationality" readOnly disabled value={employee?.nationality?.name_en ?? (form.nationality_id?`Saved reference #${form.nationality_id}`:'—')}/>:<CountrySelect name="nationality_id"
              value={form.nationality_id}
              onValueChange={(v) => setForm((p) => ({ ...p, nationality_id: v })) }
              disabled={disabled}
              allowClear
            />}
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <RequiredLabel htmlFor="date_of_birth">Date of Birth</RequiredLabel>
            <Input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              value={form.date_of_birth}
              onChange={event => setForm(previous => ({...previous, date_of_birth: event.target.value}))}
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label htmlFor="blood_group">Blood Group</Label>
            <ERPCombobox ariaLabel="Blood Group" name="blood_group"
              value={employee?.medical_field_unavailable?'':form.blood_group}
              onValueChange={(v) => setForm((p) => ({ ...p, blood_group: v as string }))}
              options={BLOOD_GROUP_OPTIONS}
              placeholder="Select..."
              disabled={disabled || !canManageMedical || employee?.medical_field_unavailable}
              allowClear
            />
            {!canManageMedical && <p className="text-xs text-muted-foreground">Separate medical access is required to change this field.</p>}
            {employee?.medical_field_unavailable&&<p role="alert" className="text-sm text-destructive">This medical field could not be verified. Other profile details remain available; reload to retry it.</p>}
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <RequiredLabel htmlFor="mobile_number">Mobile Number</RequiredLabel>
            <Input
              id="mobile_number"
              name="mobile_number"
              value={form.mobile_number}
              onChange={event => setForm(previous => ({...previous, mobile_number: event.target.value}))}
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label htmlFor="personal_email">Personal Email</Label>
            <Input
              id="personal_email"
              name="personal_email"
              type="email"
              value={form.personal_email}
              onChange={event => setForm(previous => ({...previous, personal_email: event.target.value}))}
              disabled={disabled}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 space-y-1.5">
            <Label htmlFor="uae_address">UAE Address</Label>
            <Textarea
              id="uae_address"
              name="uae_address"
              rows={2}
              value={form.uae_address}
              onChange={event => setForm(previous => ({...previous, uae_address: event.target.value}))}
              disabled={disabled}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 space-y-1.5">
            <Label htmlFor="home_country_address">Home Country Address</Label>
            <Textarea
              id="home_country_address"
              name="home_country_address"
              rows={2}
              value={form.home_country_address}
              onChange={event => setForm(previous => ({...previous, home_country_address: event.target.value}))}
              disabled={disabled}
            />
          </div>
        </div>
      </section>

      {/* ── Employment Details ────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Employment Details
        </h3>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 sm:col-span-6 space-y-1.5">
            <RequiredLabel htmlFor="owner_company_id">Employer Company</RequiredLabel>
            {disabled?<Input aria-label="Employer Company" readOnly disabled value={employee?.owner_company?.legal_name_en ?? (form.owner_company_id?`Saved reference #${form.owner_company_id}`:'—')}/>:<OwnerCompanySelect name="owner_company_id" ariaLabel="Employer Company"
              value={form.owner_company_id}
              onValueChange={(v) =>
                setForm((p) => ({
                  ...p,
                  owner_company_id: v,
                  // Clear dependent assignments; never carry an old employer’s references.
                  branch_id:null,department_id:null,designation_id:null,primary_work_site_id:null,reporting_manager_id:null,supervisor_id:null,mohre_establishment_id: null,
                }))
              }
              disabled={disabled}
              required
            />}
          </div>
          <div className="col-span-12 sm:col-span-6 space-y-1.5">
            <Label htmlFor="branch_id">Branch</Label>
            {disabled?<Input aria-label="Branch" readOnly disabled value={employee?.branch?.branch_name_en ?? (form.branch_id?`Saved reference #${form.branch_id}`:'—')}/>:<BranchSelect ownerCompanyId={form.owner_company_id} name="branch_id"
              value={form.branch_id}
              onValueChange={(v) => setForm((p) => p.branch_id===v?p:({ ...p, branch_id: v,department_id:null,designation_id:null,primary_work_site_id:null }))}
              disabled={disabled}
              allowClear
            />}
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label>Department</Label>
            <ERPCombobox ariaLabel="Department" name="department_id"
              value={form.department_id}
              onValueChange={(v) => setForm((p) => ({ ...p, department_id: Number(v) || null,designation_id:null }))}
              options={departmentOptions}
              placeholder="Select department..."
              disabled={disabled||!available('departments')}
              allowClear
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label>Designation</Label>
            <ERPCombobox ariaLabel="Designation" name="designation_id"
              value={form.designation_id}
              onValueChange={(v) => setForm((p) => ({ ...p, designation_id: Number(v) || null }))}
              options={designationOptions}
              placeholder="Select designation..."
              disabled={disabled||!available('designations')}
              allowClear
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            {mode==='add'||employee?.employee_category_id!=null?<RequiredLabel>Employee Category</RequiredLabel>:<Label>Employee Category (legacy unassigned)</Label>}
            <ERPCombobox name="employee_category_id" ariaLabel="Employee Category"
              value={form.employee_category_id}
              onValueChange={(v) => setForm((p) => ({ ...p, employee_category_id: Number(v) || null }))}
              options={categoryOptions}
              placeholder="Select category..."
              disabled={disabled||!available('categories')}
              required={mode === 'add' || employee?.employee_category_id != null}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label>Employment Type</Label>
            <ERPCombobox ariaLabel="Employment Type" name="employment_type_id"
              value={form.employment_type_id}
              onValueChange={(v) => setForm((p) => ({ ...p, employment_type_id: Number(v) || null }))}
              options={employmentOptions}
              placeholder="Select type..."
              disabled={disabled||!available('employment')}
              allowClear
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <RequiredLabel htmlFor="joining_date">Joining Date</RequiredLabel>
            <Input
              id="joining_date"
              name="joining_date"
              type="date"
              value={form.joining_date}
              onChange={event => setForm(previous => ({...previous, joining_date: event.target.value}))}
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label htmlFor="actual_joining_date">Actual Joining Date</Label>
            <Input
              id="actual_joining_date"
              name="actual_joining_date"
              type="date"
              value={form.actual_joining_date}
              onChange={event => setForm(previous => ({...previous, actual_joining_date: event.target.value}))}
              disabled={disabled}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <RequiredLabel>Employee Status</RequiredLabel>
            <ERPCombobox name="employee_status" ariaLabel="Employee Status"
              value={form.employee_status}
              onValueChange={(v) => setForm((p) => ({ ...p, employee_status: v as string }))}
              options={STATUS_OPTIONS}
              placeholder="Select status..."
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label>Primary Work Site</Label>
            <ERPCombobox ariaLabel="Primary Work Site" name="primary_work_site_id"
              value={form.primary_work_site_id}
              onValueChange={(v) => setForm((p) => ({ ...p, primary_work_site_id: Number(v) || null }))}
              options={siteOptions}
              placeholder="Select work site..."
              disabled={disabled||!available('sites')}
              allowClear
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label>Sponsor Company</Label>
            {disabled?<Input aria-label="Sponsor Company" readOnly disabled value={form.sponsor_company_id?`Saved reference #${form.sponsor_company_id}`:'—'}/>:<OwnerCompanySelect name="sponsor_company_id" ariaLabel="Sponsor Company"
              value={form.sponsor_company_id}
              onValueChange={(v) => setForm((p) => ({ ...p, sponsor_company_id: v }))}
              disabled={disabled}
              allowClear
            />}
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label>MOHRE Establishment</Label>
            <ERPCombobox ariaLabel="MOHRE Establishment" name="mohre_establishment_id"
              value={form.mohre_establishment_id}
              onValueChange={(v) =>
                setForm((p) => ({
                  ...p,
                  mohre_establishment_id: v ? Number(v) : null,
                }))
              }
              options={mohreEstablishmentOptions}
              placeholder={
                form.owner_company_id
                  ? "Select MOHRE establishment..."
                  : "Select employer company first"
              }
              disabled={disabled || !form.owner_company_id || !available('mohre')}
              allowClear
              showCode
            />
            {!form.owner_company_id && (
              <p className="text-[11px] text-muted-foreground">
                Link this employee to an employer company, then choose a MOHRE establishment registered for that company in HR Settings.
              </p>
            )}
            {form.owner_company_id && mohreEstablishmentOptions.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                No MOHRE establishments for this company. Add one under HR Settings → MOHRE Establishments.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Contract / Probation ──────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Contract & Probation
        </h3>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label>Contract Type</Label>
            <ERPCombobox ariaLabel="Contract Type" name="contract_type"
              value={form.contract_type}
              onValueChange={(v) => setForm((p) => ({ ...p, contract_type: v as string }))}
              options={CONTRACT_TYPE_OPTIONS}
              placeholder="Select..."
              disabled={disabled}
              allowClear
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label htmlFor="contract_start_date">Contract Start Date</Label>
            <Input
              id="contract_start_date"
              name="contract_start_date"
              type="date"
              value={form.contract_start_date}
              onChange={event => setForm(previous => ({...previous, contract_start_date: event.target.value}))}
              disabled={disabled}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label htmlFor="contract_end_date">Contract End Date</Label>
            <Input
              id="contract_end_date"
              name="contract_end_date"
              type="date"
              value={form.contract_end_date}
              onChange={event => setForm(previous => ({...previous, contract_end_date: event.target.value}))}
              disabled={disabled}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label htmlFor="probation_start_date">Probation Start Date</Label>
            <Input
              id="probation_start_date"
              name="probation_start_date"
              type="date"
              value={form.probation_start_date}
              onChange={event => setForm(previous => ({...previous, probation_start_date: event.target.value}))}
              disabled={disabled}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label htmlFor="probation_end_date">Probation End Date</Label>
            <Input
              id="probation_end_date"
              name="probation_end_date"
              type="date"
              value={form.probation_end_date}
              onChange={event => setForm(previous => ({...previous, probation_end_date: event.target.value}))}
              disabled={disabled}
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label htmlFor="notice_period_days">Notice Period (Days)</Label>
            <Input
              id="notice_period_days"
              name="notice_period_days"
              type="number"
              min={0}
              value={form.notice_period_days}
              onChange={event => setForm(previous => ({...previous, notice_period_days: event.target.value}))}
              disabled={disabled}
            />
          </div>
        </div>
      </section>

      {/* ── Emergency Contact ────────────────────────────────────────────────── */}
      {mode==='edit'&&<section className="space-y-3 rounded border p-4">
        <h3 className="text-sm font-semibold">Employment change history</h3>
        <p className="text-sm text-muted-foreground">Changes to employer, assignment, status or contract facts require a reason and effective date. Future-dated changes cannot replace current facts.</p>
        {changeReview&&changeReview.fields.length>0&&<div role="status" className="text-sm">
          <p>{changeReview.actions.join('; ')}</p>
          <ul>{changeReview.fields.map(field=><li key={field}>{employmentFieldLabel(field)}: {String(employee?.[field]??'—')} → {String(form[field as keyof EmployeeProfileFormState]??'—')}</li>)}</ul>
          {changeReview.impacts.map(impact=><p key={impact}>{impact}</p>)}
        </div>}
        <Label htmlFor="employment_change_reason">Reason{employmentChanged?' *':''}</Label>
        <Textarea id="employment_change_reason" name="employment_change_reason" value={form.employment_change_reason} onChange={e=>setForm(p=>({...p,employment_change_reason:e.target.value}))} required={employmentChanged} maxLength={2000} disabled={disabled}/>
        <Label htmlFor="employment_effective_date">Effective date{employmentChanged?' *':''}</Label>
        <Input id="employment_effective_date" name="employment_effective_date" type="date" value={form.employment_effective_date} onChange={e=>setForm(p=>({...p,employment_effective_date:e.target.value}))} required={employmentChanged} disabled={disabled}/>
      </section>}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Emergency Contact
        </h3>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <RequiredLabel htmlFor="emergency_contact_name">Contact Name</RequiredLabel>
            <Input
              id="emergency_contact_name"
              name="emergency_contact_name"
              value={form.emergency_contact_name}
              onChange={event => setForm(previous => ({...previous, emergency_contact_name: event.target.value}))}
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <RequiredLabel htmlFor="emergency_contact_mobile">Contact Mobile</RequiredLabel>
            <Input
              id="emergency_contact_mobile"
              name="emergency_contact_mobile"
              value={form.emergency_contact_mobile}
              onChange={event => setForm(previous => ({...previous, emergency_contact_mobile: event.target.value}))}
              disabled={disabled}
              required
            />
          </div>
          <div className="col-span-12 sm:col-span-6 xl:col-span-4 space-y-1.5">
            <Label>Relationship</Label>
            <ERPCombobox ariaLabel="Relationship" name="emergency_contact_relationship_type_id"
              value={form.emergency_contact_relationship_type_id}
              onValueChange={(v) => setForm((p) => ({ ...p, emergency_contact_relationship_type_id: Number(v) || null }))}
              options={relationshipOptions}
              placeholder="Select relationship..."
              disabled={disabled||!available('relationships')}
              allowClear
            />
          </div>
        </div>
      </section>
    </div>
  );
}
