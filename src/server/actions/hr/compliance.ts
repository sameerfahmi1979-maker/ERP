"use server";

/**
 * ERP HR.3 — Employee Compliance Server Actions
 *
 * Handles all compliance child record CRUD for:
 *   - employee_identity_documents
 *   - employee_medical_insurances
 *   - employee_dependents
 *   - employee_access_cards
 *   - employee_training_certificates
 *   - employee_medical_records (restricted: hr.medical.view / hr.medical.manage)
 *   - Compliance summary + alerts
 *
 * Security model:
 *   - All reads use createClient() (RLS enforced)
 *   - All writes use createClient() with subject-scoped RLS and application capability checks
 *   - Medical records require hr.medical.view/manage separately from hr.compliance.view/manage
 */

import {mutateHrChild} from "./child-mutation";
import type {ChildSaveContract,ChildSaveResult,ChildReceipt} from "@/lib/hr/child-save-contract";
type ComplianceSaveResult=ChildSaveResult & {data?:ChildReceipt & {dmsLinkCreated?:boolean}};
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {dependentSchema,type DependentSaveContract} from '@/lib/hr/dependent-contract';
import {saveDependentRecord,type DependentSaveResult} from '@/server/dependent-save';

// ── Shared ────────────────────────────────────────────────────────────────────

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Row Types ─────────────────────────────────────────────────────────────────

export type EmployeeIdentityDocumentRow = {
  id: number;
  workspace_revision: number;
  employee_id: number;
  document_type_id: number;
  document_number: string;
  issue_date: string | null;
  expiry_date: string | null;
  issuing_authority: string | null;
  issuing_authority_party_id: number | null;
  issue_country_id: number | null;
  issuing_emirate_id: number | null;
  issue_city_id: number | null;
  status: string;
  verification_status: string;
  verified_by: number | null;
  verified_at: string | null;
  dms_document_id: number | null;
  renewal_status: string;
  emirates_id_application_no: string | null;
  visa_file_number: string | null;
  uid_number: string | null;
  labour_card_number: string | null;
  work_permit_number: string | null;
  mohre_person_code: string | null;
  profession_on_document: string | null;
  sponsor_company_id: number | null;
  place_of_issue: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  document_type?: { id: number; name_en: string } | null;
  issue_country?: { id: number; name_en: string } | null;
  issuing_emirate?: { id: number; name_en: string } | null;
  issue_city?: { id: number; name_en: string } | null;
  issuing_authority_party?: { id: number; display_name: string; party_code: string } | null;
  sponsor_company?: { id: number; legal_name_en: string } | null;
};

export type EmployeeMedicalInsuranceRow = {
  id: number;
  workspace_revision: number;
  employee_id: number;
  insurance_provider: string;
  tpa: string | null;
  policy_number: string;
  insurance_card_number: string | null;
  network_class: string | null;
  issue_date: string | null;
  expiry_date: string;
  employee_covered: boolean;
  dependent_coverage_included: boolean;
  dependent_count_covered: number | null;
  status: string;
  verification_status: string;
  renewal_status: string;
  dms_document_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeDependentRow = {
  id: number;
  workspace_revision: number;
  employee_id: number;
  dependent_name_en: string;
  dependent_name_ar: string | null;
  relationship_type_id: number;
  date_of_birth: string | null;
  nationality_id: number | null;
  passport_number: string | null;
  passport_expiry: string | null;
  emirates_id_number: string | null;
  emirates_id_expiry: string | null;
  residence_visa_number: string | null;
  residence_visa_expiry: string | null;
  medical_insurance_provider: string | null;
  medical_insurance_policy: string | null;
  medical_insurance_card: string | null;
  medical_insurance_expiry: string | null;
  sponsored_by: string | null;
  is_active: boolean;
  dms_document_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  relationship_type?: { id: number; name_en: string } | null;
  nationality?: { id: number; name_en: string } | null;
};

export type EmployeeAccessCardRow = {
  id: number;
  workspace_revision: number;
  employee_id: number;
  access_type_id: number;
  client_authority: string | null;
  work_site_id: number | null;
  card_number: string | null;
  application_reference: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: string;
  renewal_status: string;
  dms_document_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  access_type?: { id: number; name_en: string } | null;
  work_site?: { id: number; site_name: string } | null;
};

export type EmployeeTrainingCertificateRow = {
  id: number;
  workspace_revision: number;
  employee_id: number;
  training_category_id: number | null;
  training_type_id: number;
  provider: string | null;
  approval_body: string | null;
  certificate_number: string | null;
  completion_date: string | null;
  expiry_date: string | null;
  required_for_designation: boolean;
  required_for_site: boolean;
  status: string;
  verification_status: string;
  dms_document_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  training_category?: { id: number; name_en: string } | null;
  training_type?: { id: number; name_en: string } | null;
};

export type EmployeeMedicalRecordRow = {
  id: number;
  workspace_revision: number;
  employee_id: number;
  medical_record_type_id: number;
  medical_center: string | null;
  report_number: string | null;
  examination_date: string;
  result: string;
  fit_for_work: boolean;
  work_restrictions: boolean;
  restriction_details: string | null;
  next_examination_date: string | null;
  required_for_visa: boolean;
  required_for_site: boolean;
  required_for_noc: boolean;
  dms_document_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  medical_record_type?: { id: number; name_en: string } | null;
};

export type EmployeeComplianceSummary = {
  identityDocuments: { total: number; active: number; expiringSoon: number; expired: number };
  medicalInsurances: { total: number; active: number; expiringSoon: number; expired: number };
  dependents: { total: number; active: number };
  accessCards: { total: number; active: number; expiringSoon: number; expired: number };
  trainingCertificates: { total: number; valid: number; expiringSoon: number; expired: number };
  medicalRecords: { total: number; fit: number; lastExaminationDate: string | null } | null;
  dmsDocuments: { total: number };
};

// ── Helper: load employee for audit context ───────────────────────────────────


function revalidateEmployeePath(employeeId: number) {
  revalidatePath(`/admin/hr/employees/record/${employeeId}`);
  revalidatePath("/admin/hr/employees");
}

// ── IDENTITY DOCUMENTS ────────────────────────────────────────────────────────


export async function listEmployeeIdentityDocuments(
  employeeId: number
): Promise<ActionResult<EmployeeIdentityDocumentRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_identity_documents")
      .select(
        "*,document_type:hr_identity_document_types(id,name_en),issue_country:countries(id,name_en),issuing_emirate:emirates(id,name_en),issue_city:cities(id,name_en),issuing_authority_party:parties(id,display_name,party_code),sponsor_company:owner_companies!employee_identity_documents_sponsor_company_id_fkey(id,legal_name_en)"
      )
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as EmployeeIdentityDocumentRow[] };
  } catch {
    return { success: false, error: "Failed to load identity documents" };
  }
}

export async function createEmployeeIdentityDocument(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'identity-document',employeeId,id:null,action:'create',revision:null,values:input},contract);
}

export async function updateEmployeeIdentityDocument(id:number,input:unknown,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'identity-document',employeeId,id,action:'update',revision:contract?.revision,values:input},contract);
}

export async function archiveEmployeeIdentityDocument(id:number,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'identity-document',employeeId,id,action:'archive',revision:contract?.revision,values:{}},contract);
}

export async function verifyEmployeeIdentityDocument(id:number,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'identity-document',employeeId,id,action:'verify',revision:contract?.revision,values:{}},contract);
}

export async function updateIdentityDocumentRenewalStatus(id:number,renewalStatus:string,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'identity-document',employeeId,id,action:'renewal',revision:contract?.revision,values:{renewal_status:renewalStatus}},contract);
}

// ── MEDICAL INSURANCE ─────────────────────────────────────────────────────────


export async function listEmployeeMedicalInsurances(
  employeeId: number
): Promise<ActionResult<EmployeeMedicalInsuranceRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.medical.view")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_medical_insurances")
      .select("*")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("expiry_date", { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as EmployeeMedicalInsuranceRow[] };
  } catch {
    return { success: false, error: "Failed to load medical insurances" };
  }
}

export async function createEmployeeMedicalInsurance(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'medical-insurance',employeeId,id:null,action:'create',revision:null,values:input},contract);
}

export async function updateEmployeeMedicalInsurance(id:number,input:unknown,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'medical-insurance',employeeId,id,action:'update',revision:contract?.revision,values:input},contract);
}

export async function archiveEmployeeMedicalInsurance(id:number,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'medical-insurance',employeeId,id,action:'archive',revision:contract?.revision,values:{}},contract);
}

export async function verifyEmployeeMedicalInsurance(id:number,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'medical-insurance',employeeId,id,action:'verify',revision:contract?.revision,values:{}},contract);
}

export async function updateMedicalInsuranceRenewalStatus(id:number,renewalStatus:string,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'medical-insurance',employeeId,id,action:'renewal',revision:contract?.revision,values:{renewal_status:renewalStatus}},contract);
}

// ── DEPENDENTS ────────────────────────────────────────────────────────────────



export async function listEmployeeDependents(
  employeeId: number
): Promise<ActionResult<EmployeeDependentRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("f03_read_employee_dependents")
      .select("*,relationship_type:hr_relationship_types(id,name_en),nationality:countries(id,name_en)")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("dependent_name_en", { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as EmployeeDependentRow[] };
  } catch {
    return { success: false, error: "Failed to load dependents" };
  }
}

export async function createEmployeeDependent(employeeId:number,input:unknown,contract?:DependentSaveContract):Promise<DependentSaveResult>{
 const ctx=await getAuthContext();
 if(!hasPermission(ctx,'hr.compliance.manage')&&!hasPermission(ctx,'hr.admin'))return {success:false,error:'Permission denied'};
 const parsed=dependentSchema.safeParse(input);if(!parsed.success)return {success:false,error:parsed.error.issues[0]?.message};
 const result=await saveDependentRecord(employeeId,null,'save',parsed.data,contract);
 if(result.success){try{revalidateEmployeePath(employeeId);}catch{logger.warn('Dependent saved; refresh unavailable');}}
 return result;
}
export async function updateEmployeeDependent(id:number,input:unknown,contract?:DependentSaveContract,employeeId?:number):Promise<DependentSaveResult>{
 const ctx=await getAuthContext();
 if(!hasPermission(ctx,'hr.compliance.manage')&&!hasPermission(ctx,'hr.admin'))return {success:false,error:'Permission denied'};
 const parsed=dependentSchema.partial().safeParse(input);if(!parsed.success)return {success:false,error:parsed.error.issues[0]?.message};
 if(employeeId===undefined)return {success:false,error:'Reopen the employee and dependent before saving.'};
 const result=await saveDependentRecord(employeeId,id,'save',parsed.data,contract);
 if(result.success){try{revalidateEmployeePath(employeeId);}catch{logger.warn('Dependent saved; refresh unavailable');}}
 return result;
}
export async function archiveEmployeeDependent(id:number,contract?:DependentSaveContract,employeeId?:number):Promise<DependentSaveResult>{
 const ctx=await getAuthContext();
 if(!hasPermission(ctx,'hr.compliance.manage')&&!hasPermission(ctx,'hr.admin'))return {success:false,error:'Permission denied'};
 if(employeeId===undefined)return {success:false,error:'Reopen the employee and dependent before archiving.'};
 const result=await saveDependentRecord(employeeId,id,'archive',{},contract);
 if(result.success){try{revalidateEmployeePath(employeeId);}catch{logger.warn('Dependent archived; refresh unavailable');}}
 return result;
}

// ── DEPENDENT DOCUMENT LINKS (HR.DOCLINK.1B) ─────────────────────────────────
//
// Multi-document linking for dependents. Links live in dms_document_links with
// entity_type='employee_dependent' (D1: dependent only — never the parent
// employee). Additions/removals are staged in the dependent dialog and applied
// in one call on Save.

export type DependentDocumentLinkRow = {
  link_id: number;
  document_id: number;
  document_no: string;
  title: string;
  document_type_name: string | null;
  status: string | null;
  expiry_date: string | null;
};

export async function listEmployeeDependentDocumentLinks(
  dependentId: number
): Promise<ActionResult<DependentDocumentLinkRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const admin = await createClient();
    const { data, error } = await admin
      .from("dms_document_links")
      .select(
        `id, document_id,
         document:dms_documents!document_id(id, document_no, title, status, expiry_date, deleted_at,
           document_type:dms_document_types(name_en))`
      )
      .eq("entity_type", "employee_dependent")
      .eq("entity_id", dependentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const rows: DependentDocumentLinkRow[] = [];
    for (const raw of data ?? []) {
      const r = raw as Record<string, unknown>;
      const docRaw = r.document as Record<string, unknown> | Record<string, unknown>[] | null;
      const doc = Array.isArray(docRaw) ? docRaw[0] : docRaw;
      if (!doc || doc.deleted_at != null) continue;
      const dtRaw = doc.document_type as { name_en?: string } | { name_en?: string }[] | null;
      const dt = Array.isArray(dtRaw) ? dtRaw[0] : dtRaw;
      rows.push({
        link_id: r.id as number,
        document_id: r.document_id as number,
        document_no: (doc.document_no as string) ?? "",
        title: (doc.title as string) ?? "Untitled",
        document_type_name: dt?.name_en ?? null,
        status: (doc.status as string | null) ?? null,
        expiry_date: (doc.expiry_date as string | null) ?? null,
      });
    }

    return { success: true, data: rows };
  } catch (err) {
    logger.error("listEmployeeDependentDocumentLinks error", err);
    return { success: false, error: "Failed to load linked documents" };
  }
}

/** Legacy callers must now supply one atomic revision/operation contract. No partial writes. */
export async function applyEmployeeDependentDocumentLinks(dependentId:number,changes:{addDocumentIds?:number[];removeDocumentIds?:number[]},contract?:DependentSaveContract,employeeId?:number):Promise<DependentSaveResult>{
 if(!contract||employeeId===undefined)return {success:false,error:'Reopen the dependent to apply documents with an atomic save.'};
 return updateEmployeeDependent(dependentId,{}, {...contract,addDocumentIds:changes.addDocumentIds??[],removeDocumentIds:changes.removeDocumentIds??[]},employeeId);
}

// ── ACCESS CARDS ──────────────────────────────────────────────────────────────


export async function listEmployeeAccessCards(
  employeeId: number
): Promise<ActionResult<EmployeeAccessCardRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_access_cards")
      .select("*,access_type:hr_access_card_types(id,name_en),work_site:work_sites(id,site_name)")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as EmployeeAccessCardRow[] };
  } catch {
    return { success: false, error: "Failed to load access cards" };
  }
}

export async function createEmployeeAccessCard(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'access-card',employeeId,id:null,action:'create',revision:null,values:input},contract);
}

export async function updateEmployeeAccessCard(id:number,input:unknown,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'access-card',employeeId,id,action:'update',revision:contract?.revision,values:input},contract);
}

export async function archiveEmployeeAccessCard(id:number,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'access-card',employeeId,id,action:'archive',revision:contract?.revision,values:{}},contract);
}

export async function updateAccessCardRenewalStatus(id:number,renewalStatus:string,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'access-card',employeeId,id,action:'renewal',revision:contract?.revision,values:{renewal_status:renewalStatus}},contract);
}

// ── TRAINING CERTIFICATES ─────────────────────────────────────────────────────


export async function listEmployeeTrainingCertificates(
  employeeId: number
): Promise<ActionResult<EmployeeTrainingCertificateRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_training_certificates")
      .select("*,training_category:hr_training_categories(id,name_en),training_type:hr_training_types(id,name_en)")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("expiry_date", { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as EmployeeTrainingCertificateRow[] };
  } catch {
    return { success: false, error: "Failed to load training certificates" };
  }
}

export async function createEmployeeTrainingCertificate(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'training-certificate',employeeId,id:null,action:'create',revision:null,values:input},contract);
}

export async function updateEmployeeTrainingCertificate(id:number,input:unknown,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'training-certificate',employeeId,id,action:'update',revision:contract?.revision,values:input},contract);
}

export async function archiveEmployeeTrainingCertificate(id:number,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'training-certificate',employeeId,id,action:'archive',revision:contract?.revision,values:{}},contract);
}

export async function verifyEmployeeTrainingCertificate(id:number,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'training-certificate',employeeId,id,action:'verify',revision:contract?.revision,values:{}},contract);
}

export async function updateTrainingCertificateRenewalStatus(id:number,renewalStatus:string,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 void id;void renewalStatus;void contract;void employeeId;return {success:false,error:'Training certificates have no renewal-status field. Update the actual certificate instead.'};
}

// ── MEDICAL RECORDS (RESTRICTED) ──────────────────────────────────────────────


export async function listEmployeeMedicalRecords(
  employeeId: number
): Promise<ActionResult<EmployeeMedicalRecordRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.medical.view")) {
      return { success: false, error: "Medical records restricted" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employee_medical_records")
      .select("*,medical_record_type:hr_medical_record_types(id,name_en)")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .order("examination_date", { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as EmployeeMedicalRecordRow[] };
  } catch {
    return { success: false, error: "Failed to load medical records" };
  }
}

export async function createEmployeeMedicalRecord(employeeId:number,input:unknown,contract?:ChildSaveContract):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'medical-record',employeeId,id:null,action:'create',revision:null,values:input},contract);
}

export async function updateEmployeeMedicalRecord(id:number,input:unknown,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'medical-record',employeeId,id,action:'update',revision:contract?.revision,values:input},contract);
}

export async function archiveEmployeeMedicalRecord(id:number,contract?:ChildSaveContract,employeeId?:number):Promise<ComplianceSaveResult>{
 return mutateHrChild({kind:'medical-record',employeeId,id,action:'archive',revision:contract?.revision,values:{}},contract);
}

// ── COMPLIANCE SUMMARY ────────────────────────────────────────────────────────

export async function getEmployeeComplianceSummary(
  employeeId: number
): Promise<ActionResult<EmployeeComplianceSummary>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "hr.compliance.view") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied" };
    }
    const admin = await createClient();
    const today = new Date().toISOString().split("T")[0];
    const soonDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [idDocs, medIns, deps, accessCards, trainCerts, dmsLinks] = await Promise.all([
      admin.from("employee_identity_documents").select("id, status, expiry_date").eq("employee_id", employeeId).is("deleted_at", null),
      admin.from("employee_medical_insurances").select("id, status, expiry_date").eq("employee_id", employeeId).is("deleted_at", null),
      admin.from("employee_dependents").select("id, is_active").eq("employee_id", employeeId).is("deleted_at", null),
      admin.from("employee_access_cards").select("id, status, expiry_date").eq("employee_id", employeeId).is("deleted_at", null),
      admin.from("employee_training_certificates").select("id, status, expiry_date").eq("employee_id", employeeId).is("deleted_at", null),
      admin.from("employee_document_links").select("id").eq("employee_id", employeeId).is("deleted_at", null),
    ]);

    const countSummary = (rows: Array<{ status?: string | null; expiry_date?: string | null }>) => {
      let active = 0, expiringSoon = 0, expired = 0;
      for (const r of rows) {
        if (r.status === "expired") { expired++; continue; }
        if (r.status === "active" || r.status === "valid") {
          if (r.expiry_date && r.expiry_date < today) { expired++; }
          else if (r.expiry_date && r.expiry_date <= soonDate) { expiringSoon++; active++; }
          else { active++; }
        }
      }
      return { total: rows.length, active, expiringSoon, expired };
    };

    let medicalRecords: EmployeeComplianceSummary["medicalRecords"] = null;
    if (hasPermission(ctx, "hr.medical.view")) {
      const { data: medRows } = await admin
        .from("employee_medical_records")
        .select("id, result, examination_date")
        .eq("employee_id", employeeId)
        .is("deleted_at", null)
        .order("examination_date", { ascending: false });
      const rows = medRows ?? [];
      medicalRecords = {
        total: rows.length,
        fit: rows.filter((r) => r.result === "fit").length,
        lastExaminationDate: rows[0]?.examination_date ?? null,
      };
    }

    return {
      success: true,
      data: {
        identityDocuments: countSummary(idDocs.data ?? []),
        medicalInsurances: countSummary(medIns.data ?? []),
        dependents: { total: deps.data?.length ?? 0, active: deps.data?.filter((d) => d.is_active).length ?? 0 },
        accessCards: countSummary(accessCards.data ?? []),
        trainingCertificates: {
          total: trainCerts.data?.length ?? 0,
          valid: trainCerts.data?.filter((r) => r.status === "valid").length ?? 0,
          expiringSoon: trainCerts.data?.filter((r) => r.expiry_date && r.expiry_date > today && r.expiry_date <= soonDate).length ?? 0,
          expired: trainCerts.data?.filter((r) => r.status === "expired" || (r.expiry_date && r.expiry_date < today)).length ?? 0,
        },
        medicalRecords,
        dmsDocuments: { total: dmsLinks.data?.length ?? 0 },
      },
    };
  } catch {
    return { success: false, error: "Failed to load compliance summary" };
  }
}
