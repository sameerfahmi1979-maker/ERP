"use client";

/**
 * ERP HR.3 — Employee Compliance Tab
 *
 * 6 sections:
 *   1. Legal Documents (employee_identity_documents)
 *   2. Medical Insurance (employee_medical_insurances)
 *   3. Dependents (employee_dependents)
 *   4. Access Cards & Passes (employee_access_cards)
 *   5. Training & Certifications (employee_training_certificates)
 *   6. Medical & Health Records (employee_medical_records — restricted: hr.medical.view)
 */

import { useState, useTransition, useCallback, type Dispatch, type SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Shield, FileText, Heart, Users, CreditCard, GraduationCap, Activity,
  Plus, Edit2, Archive, CheckCircle, RefreshCw, ExternalLink, Lock,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CountrySelect } from "@/components/erp/geography/country-select";
import { EmirateSelect } from "@/components/erp/geography/emirate-select";
import { OwnerCompanySelect } from "@/components/erp/organizations/owner-company-select";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getExpiryStatus,
  getExpiryStatusBadge,
  getComplianceStatusBadge,
  getVerificationStatusBadge,
  getRenewalStatusBadge,
  getMedicalResultBadge,
} from "@/lib/hr/compliance/expiry";
import {
  listEmployeeIdentityDocuments,
  updateEmployeeIdentityDocument,
  archiveEmployeeIdentityDocument,
  verifyEmployeeIdentityDocument,
  listEmployeeMedicalInsurances,
  createEmployeeMedicalInsurance,
  updateEmployeeMedicalInsurance,
  archiveEmployeeMedicalInsurance,
  verifyEmployeeMedicalInsurance,
  listEmployeeDependents,
  createEmployeeDependent,
  updateEmployeeDependent,
  archiveEmployeeDependent,
  listEmployeeAccessCards,
  createEmployeeAccessCard,
  updateEmployeeAccessCard,
  archiveEmployeeAccessCard,
  listEmployeeTrainingCertificates,
  createEmployeeTrainingCertificate,
  updateEmployeeTrainingCertificate,
  archiveEmployeeTrainingCertificate,
  verifyEmployeeTrainingCertificate,
  listEmployeeMedicalRecords,
  createEmployeeMedicalRecord,
  updateEmployeeMedicalRecord,
  archiveEmployeeMedicalRecord,
  type EmployeeIdentityDocumentRow,
  type EmployeeMedicalInsuranceRow,
  type EmployeeDependentRow,
  type EmployeeAccessCardRow,
  type EmployeeTrainingCertificateRow,
  type EmployeeMedicalRecordRow,
} from "@/server/actions/hr/compliance";
import type { AuthContext } from "@/lib/rbac/check";
import {
  listHrIdentityDocumentTypes,
  listHrAccessCardTypes,
  listHrTrainingCategories,
  listHrTrainingTypes,
  listHrMedicalRecordTypes,
  listHrRelationshipTypes,
  type HrIdentityDocTypeRow,
  type HrAccessCardTypeRow,
  type HrSettingsRow,
  type HrTrainingTypeRow,
  type HrMedicalRecordTypeRow,
} from "@/server/actions/hr/settings";
import { invalidateDmsEntityDocuments } from "@/lib/query/invalidation";
import { IdentityDocumentAddDialog } from "@/features/hr/employees/compliance/identity-document-add-dialog";
import { ComplianceDmsAddDialog } from "@/features/hr/employees/compliance/compliance-dms-add-dialog";
import { ComplianceDmsPrefillBanner } from "@/features/hr/employees/compliance/compliance-dms-prefill-banner";
import { IdentityDocumentFormFields } from "@/features/hr/employees/compliance/identity-document-form-fields";
import {
  createEmptyIdentityDocumentForm,
  identityDocumentFormToPayload,
  type IdentityDocumentFormState,
} from "@/lib/hr/compliance/identity-document-form";

// ── Prop Types ────────────────────────────────────────────────────────────────

type ComplianceTabProps = {
  employeeId: number;
  authContext: AuthContext;
  onChildOpen?: (open: boolean) => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function canManage(ctx: AuthContext) {
  return ctx.permissionCodes?.includes("hr.compliance.manage") || ctx.permissionCodes?.includes("hr.admin") || ctx.roleCodes?.includes("system_admin") || ctx.roleCodes?.includes("group_admin");
}
function canView(ctx: AuthContext) {
  return ctx.permissionCodes?.includes("hr.compliance.view") || canManage(ctx);
}
function canMedicalView(ctx: AuthContext) {
  return ctx.permissionCodes?.includes("hr.medical.view") || ctx.permissionCodes?.includes("hr.admin") || ctx.roleCodes?.includes("system_admin") || ctx.roleCodes?.includes("group_admin");
}
function canMedicalManage(ctx: AuthContext) {
  return ctx.permissionCodes?.includes("hr.medical.manage") || ctx.permissionCodes?.includes("hr.admin") || ctx.roleCodes?.includes("system_admin") || ctx.roleCodes?.includes("group_admin");
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
}

function SectionHeader({ icon: Icon, title, count, onAdd, canAdd }: { icon: React.ElementType; title: string; count?: number; onAdd?: () => void; canAdd?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{title}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="text-xs">{count}</Badge>
        )}
      </div>
      {canAdd && onAdd && (
        <Button size="sm" variant="outline" onClick={onAdd} type="button">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      )}
    </div>
  );
}

function ExpiryBadge({ expiryDate }: { expiryDate: string | null | undefined }) {
  if (!expiryDate) return <span className="text-xs text-muted-foreground">No expiry</span>;
  const status = getExpiryStatus(expiryDate);
  const cfg = getExpiryStatusBadge(status);
  return (
    <Badge variant={cfg.variant as "default" | "secondary" | "destructive" | "outline"} className="text-xs">
      {formatDate(expiryDate)} · {cfg.label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const cfg = getComplianceStatusBadge(status);
  return <Badge variant={cfg.variant as "default" | "secondary" | "destructive" | "outline"} className="text-xs">{cfg.label}</Badge>;
}

function VerificationBadge({ status }: { status: string | null | undefined }) {
  const cfg = getVerificationStatusBadge(status);
  return <Badge variant={cfg.variant as "default" | "secondary" | "destructive" | "outline"} className="text-xs">{cfg.label}</Badge>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
      {message}
    </div>
  );
}

const RENEWAL_STATUS_OPTIONS = [
  { value: "not_required", label: "Not Required" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
];

const DOC_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
  { value: "pending", label: "Pending" },
];

const VERIFICATION_OPTIONS = [
  { value: "unverified", label: "Unverified" },
  { value: "verified", label: "Verified" },
  { value: "failed", label: "Failed" },
];

// ── 1. IDENTITY DOCUMENTS SECTION ─────────────────────────────────────────────

function IdentityDocumentsSection({ employeeId, canManageDoc, onChildOpen }: { employeeId: number; canManageDoc: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [addDialogOpen, setAddDialogOpenRaw] = useState(false);
  const [editDialogOpen, setEditDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeIdentityDocumentRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const setAddDialogOpen = useCallback((open: boolean) => {
    setAddDialogOpenRaw(open);
    onChildOpen?.(open);
  }, [onChildOpen]);

  const setEditDialogOpen = useCallback((open: boolean) => {
    setEditDialogOpenRaw(open);
    onChildOpen?.(open);
  }, [onChildOpen]);

  const [form, setForm] = useState<IdentityDocumentFormState>(() => createEmptyIdentityDocumentForm());

  const { data: docs, isLoading } = useQuery({
    queryKey: queryKeys.hr.compliance.identityDocuments(employeeId),
    queryFn: async () => {
      const r = await listEmployeeIdentityDocuments(employeeId);
      return r.success ? r.data ?? [] : [];
    },
  });

  const { data: docTypes } = useQuery({
    queryKey: queryKeys.hr.identityDocumentTypes(),
    queryFn: async () => {
      const r = await listHrIdentityDocumentTypes({ is_active: true, page: 1, page_size: 100 });
      return r.success && r.data ? r.data.data as HrIdentityDocTypeRow[] : [];
    },
  });

  const openAdd = () => {
    setAddDialogOpen(true);
  };

  const openEdit = (doc: EmployeeIdentityDocumentRow) => {
    setEditing(doc);
    setForm({
      dms_document_id: doc.dms_document_id,
      document_type_id: doc.document_type_id,
      document_number: doc.document_number,
      issue_date: doc.issue_date ?? "",
      expiry_date: doc.expiry_date ?? "",
      issuing_authority_party_id: doc.issuing_authority_party_id ?? null,
      issue_country_id: doc.issue_country_id,
      issuing_emirate_id: doc.issuing_emirate_id,
      issue_city_id: doc.issue_city_id ?? null,
      status: doc.status,
      verification_status: doc.verification_status,
      renewal_status: doc.renewal_status,
      sponsor_company_id: doc.sponsor_company_id,
      notes: doc.notes ?? "",
      emirates_id_application_no: doc.emirates_id_application_no ?? "",
      visa_file_number: doc.visa_file_number ?? "",
      uid_number: doc.uid_number ?? "",
      labour_card_number: doc.labour_card_number ?? "",
      work_permit_number: doc.work_permit_number ?? "",
      mohre_person_code: doc.mohre_person_code ?? "",
      profession_on_document: doc.profession_on_document ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editing) return;
    startTransition(async () => {
      const payload = identityDocumentFormToPayload(form);
      const result = await updateEmployeeIdentityDocument(editing.id, payload);
      if (result.success) {
        toast.success("Document updated");
        void qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.identityDocuments(employeeId) });
        void qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) });
        setEditDialogOpen(false);
      } else {
        toast.error(result.error ?? "Failed to save document");
      }
    });
  };

  const handleAddSaved = (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => {
    void qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.identityDocuments(employeeId) });
    void qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) });
    if (opts?.hasDmsDocument) {
      invalidateDmsEntityDocuments(qc, "employee", employeeId);
    }
  };

  const handleArchive = async (id: number) => {
    const result = await archiveEmployeeIdentityDocument(id);
    if (result.success) {
      toast.success("Document archived");
      qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.identityDocuments(employeeId) });
      qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) });
    } else toast.error(result.error ?? "Failed to archive");
  };

  const handleVerify = async (id: number) => {
    const result = await verifyEmployeeIdentityDocument(id);
    if (result.success) {
      toast.success("Document verified");
      qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.identityDocuments(employeeId) });
    } else toast.error(result.error ?? "Failed to verify");
  };

  const docTypeOptions = (docTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));

  return (
    <div className="mb-8">
      <SectionHeader icon={FileText} title="Legal Documents" count={docs?.length} onAdd={openAdd} canAdd={canManageDoc} />

      {isLoading && <Skeleton className="h-20 w-full" />}
      {!isLoading && (!docs || docs.length === 0) && <EmptyState message="No identity documents added yet." />}
      {!isLoading && docs && docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-start justify-between p-3 border rounded-lg bg-card hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{doc.document_type?.name_en ?? `Type ${doc.document_type_id}`}</span>
                  <StatusBadge status={doc.status} />
                  <VerificationBadge status={doc.verification_status} />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{doc.document_number}</div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <ExpiryBadge expiryDate={doc.expiry_date} />
                  {(doc.issuing_authority_party?.display_name ?? doc.issuing_authority) && (
                    <span className="text-xs text-muted-foreground">
                      {doc.issuing_authority_party?.display_name ?? doc.issuing_authority}
                    </span>
                  )}
                  {doc.issue_country?.name_en && <span className="text-xs text-muted-foreground">{doc.issue_country.name_en}</span>}
                  {(doc.issue_city?.name_en ?? doc.place_of_issue) && (
                    <span className="text-xs text-muted-foreground">
                      {doc.issue_city?.name_en ?? doc.place_of_issue}
                    </span>
                  )}
                </div>
              </div>
              {canManageDoc && (
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  {doc.verification_status === "unverified" && (
                    <Button size="sm" variant="ghost" onClick={() => handleVerify(doc.id)} type="button" title="Verify">
                      <CheckCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(doc)} type="button" title="Edit">
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleArchive(doc.id)} type="button" title="Archive">
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <IdentityDocumentAddDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        employeeId={employeeId}
        docTypes={docTypes ?? []}
        onSaved={handleAddSaved}
      />

      <ERPChildDialogForm
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        title="Edit Identity Document"
        subtitle="Legal and identity documents for this employee"
        icon={<FileText className="h-5 w-5" />}
        mode="edit"
        size="xl"
        isSubmitting={isSubmitting}
        onSubmit={handleEditSubmit}
      >
        <IdentityDocumentFormFields
          form={form}
          setForm={setForm}
          docTypeOptions={docTypeOptions}
        />
      </ERPChildDialogForm>
    </div>
  );
}

function handleComplianceAddSaved(
  qc: ReturnType<typeof useQueryClient>,
  employeeId: number,
  queryKey: readonly unknown[],
  opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }
) {
  void qc.invalidateQueries({ queryKey });
  void qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) });
  if (opts?.hasDmsDocument) {
    invalidateDmsEntityDocuments(qc, "employee", employeeId);
  }
}

// ── 2. MEDICAL INSURANCE SECTION ──────────────────────────────────────────────

function MedicalInsurancesSection({ employeeId, canManageDoc, onChildOpen }: { employeeId: number; canManageDoc: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [addDialogOpen, setAddDialogOpenRaw] = useState(false);
  const [editDialogOpen, setEditDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeMedicalInsuranceRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const setAddDialogOpen = useCallback((open: boolean) => {
    setAddDialogOpenRaw(open);
    onChildOpen?.(open);
  }, [onChildOpen]);

  const setEditDialogOpen = useCallback((open: boolean) => {
    setEditDialogOpenRaw(open);
    onChildOpen?.(open);
  }, [onChildOpen]);

  const initialForm = () => ({
    dms_document_id: null as number | null,
    insurance_provider: "",
    tpa: "",
    policy_number: "",
    insurance_card_number: "",
    network_class: "",
    issue_date: "",
    expiry_date: "",
    employee_covered: true,
    dependent_coverage_included: false,
    dependent_count_covered: null as number | null,
    status: "active" as string,
    verification_status: "unverified" as string,
    renewal_status: "pending" as string,
    notes: "",
  });

  type MedicalInsuranceForm = ReturnType<typeof initialForm>;

  const [form, setForm] = useState(initialForm);

  const { data: records, isLoading } = useQuery({
    queryKey: queryKeys.hr.compliance.medicalInsurances(employeeId),
    queryFn: async () => {
      const r = await listEmployeeMedicalInsurances(employeeId);
      return r.success ? r.data ?? [] : [];
    },
  });

  const openAdd = () => setAddDialogOpen(true);
  const openEdit = (r: EmployeeMedicalInsuranceRow) => {
    setEditing(r);
    setForm({
      dms_document_id: r.dms_document_id,
      insurance_provider: r.insurance_provider,
      tpa: r.tpa ?? "",
      policy_number: r.policy_number,
      insurance_card_number: r.insurance_card_number ?? "",
      network_class: r.network_class ?? "",
      issue_date: r.issue_date ?? "",
      expiry_date: r.expiry_date,
      employee_covered: r.employee_covered,
      dependent_coverage_included: r.dependent_coverage_included,
      dependent_count_covered: r.dependent_count_covered,
      status: r.status,
      verification_status: r.verification_status,
      renewal_status: r.renewal_status,
      notes: r.notes ?? "",
    });
    setEditDialogOpen(true);
  };

  const buildPayload = (f: MedicalInsuranceForm) => ({
    ...f,
    dms_document_id: f.dms_document_id,
    tpa: f.tpa || null,
    insurance_card_number: f.insurance_card_number || null,
    network_class: f.network_class || null,
    issue_date: f.issue_date || null,
    notes: f.notes || null,
  });

  const validateMedicalInsurance = (f: MedicalInsuranceForm) => {
    if (!f.insurance_provider.trim()) return "Insurance provider is required";
    if (!f.policy_number.trim()) return "Policy number is required";
    if (!f.expiry_date) return "Expiry date is required";
    return null;
  };

  const handleEditSubmit = () => {
    if (!editing) return;
    const err = validateMedicalInsurance(form);
    if (err) { toast.error(err); return; }
    startTransition(async () => {
      const result = await updateEmployeeMedicalInsurance(editing.id, buildPayload(form));
      if (result.success) {
        toast.success("Insurance updated");
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.medicalInsurances(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) });
        setEditDialogOpen(false);
      } else toast.error(result.error ?? "Failed to save");
    });
  };

  const handleAddSaved = (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => {
    handleComplianceAddSaved(qc, employeeId, queryKeys.hr.compliance.medicalInsurances(employeeId), opts);
  };

  const handleArchive = async (id: number) => {
    const result = await archiveEmployeeMedicalInsurance(id);
    if (result.success) { toast.success("Insurance archived"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.medicalInsurances(employeeId) }); }
    else toast.error(result.error ?? "Failed to archive");
  };

  const handleVerify = async (id: number) => {
    const result = await verifyEmployeeMedicalInsurance(id);
    if (result.success) { toast.success("Verified"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.medicalInsurances(employeeId) }); }
    else toast.error(result.error ?? "Failed to verify");
  };

  return (
    <div className="mb-8">
      <SectionHeader icon={Heart} title="Medical Insurance" count={records?.length} onAdd={openAdd} canAdd={canManageDoc} />
      {isLoading && <Skeleton className="h-16 w-full" />}
      {!isLoading && (!records || records.length === 0) && <EmptyState message="No medical insurance records added yet." />}
      {!isLoading && records && records.length > 0 && (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="flex items-start justify-between p-3 border rounded-lg bg-card hover:bg-muted/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.insurance_provider}</span>
                  {r.network_class && <Badge variant="outline" className="text-xs">{r.network_class}</Badge>}
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Policy: {r.policy_number}{r.tpa ? ` · TPA: ${r.tpa}` : ""}</div>
                <div className="mt-1"><ExpiryBadge expiryDate={r.expiry_date} /></div>
              </div>
              {canManageDoc && (
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  {r.verification_status === "unverified" && <Button size="sm" variant="ghost" type="button" onClick={() => handleVerify(r.id)} title="Verify"><CheckCircle className="h-3.5 w-3.5" /></Button>}
                  <Button size="sm" variant="ghost" type="button" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => handleArchive(r.id)}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ComplianceDmsAddDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        employeeId={employeeId}
        recordKind="medical_insurance"
        icon={<Heart className="h-5 w-5" />}
        recordLabel="Medical Insurance"
        submitLabel="Save Medical Insurance"
        createEmptyForm={initialForm}
        validate={validateMedicalInsurance}
        save={async (f) => createEmployeeMedicalInsurance(employeeId, buildPayload(f))}
        onSaved={handleAddSaved}
        renderReview={({ form: addForm, setForm: setAddForm, prefillMeta }) => (
          <div className="grid grid-cols-12 gap-4">
            <ComplianceDmsPrefillBanner prefillMeta={prefillMeta} />
            <div className="col-span-6"><Label>Insurance Provider <span className="text-destructive">*</span></Label><Input value={addForm.insurance_provider} onChange={(e) => setAddForm((p) => ({ ...p, insurance_provider: e.target.value }))} /></div>
            <div className="col-span-6"><Label>TPA</Label><Input value={addForm.tpa} onChange={(e) => setAddForm((p) => ({ ...p, tpa: e.target.value }))} placeholder="Third-party administrator" /></div>
            <div className="col-span-6"><Label>Policy Number <span className="text-destructive">*</span></Label><Input value={addForm.policy_number} onChange={(e) => setAddForm((p) => ({ ...p, policy_number: e.target.value }))} /></div>
            <div className="col-span-6"><Label>Insurance Card Number</Label><Input value={addForm.insurance_card_number} onChange={(e) => setAddForm((p) => ({ ...p, insurance_card_number: e.target.value }))} /></div>
            <div className="col-span-6"><Label>Network Class</Label><Input value={addForm.network_class} onChange={(e) => setAddForm((p) => ({ ...p, network_class: e.target.value }))} placeholder="e.g. Silver, Gold, Platinum" /></div>
            <div className="col-span-3"><Label>Issue Date</Label><Input type="date" value={addForm.issue_date} onChange={(e) => setAddForm((p) => ({ ...p, issue_date: e.target.value }))} /></div>
            <div className="col-span-3"><Label>Expiry Date <span className="text-destructive">*</span></Label><Input type="date" value={addForm.expiry_date} onChange={(e) => setAddForm((p) => ({ ...p, expiry_date: e.target.value }))} /></div>
            <div className="col-span-4"><Label>Status</Label><ERPCombobox value={addForm.status} onValueChange={(v) => setAddForm((p) => ({ ...p, status: String(v) }))} options={DOC_STATUS_OPTIONS} placeholder="Status..." /></div>
            <div className="col-span-4"><Label>Verification</Label><ERPCombobox value={addForm.verification_status} onValueChange={(v) => setAddForm((p) => ({ ...p, verification_status: String(v) }))} options={VERIFICATION_OPTIONS} placeholder="Verification..." /></div>
            <div className="col-span-4"><Label>Renewal</Label><ERPCombobox value={addForm.renewal_status} onValueChange={(v) => setAddForm((p) => ({ ...p, renewal_status: String(v) }))} options={RENEWAL_STATUS_OPTIONS} placeholder="Renewal..." /></div>
            <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={addForm.employee_covered} onCheckedChange={(v) => setAddForm((p) => ({ ...p, employee_covered: v }))} /><Label>Employee Covered</Label></div>
            <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={addForm.dependent_coverage_included} onCheckedChange={(v) => setAddForm((p) => ({ ...p, dependent_coverage_included: v }))} /><Label>Dependent Coverage</Label></div>
            <div className="col-span-4"><Label>Dependents Covered</Label><Input type="number" min={0} value={addForm.dependent_count_covered ?? ""} onChange={(e) => setAddForm((p) => ({ ...p, dependent_count_covered: e.target.value ? parseInt(e.target.value) : null }))} /></div>
            <div className="col-span-12"><Label>Notes</Label><Textarea value={addForm.notes} onChange={(e) => setAddForm((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
          </div>
        )}
      />

      <ERPChildDialogForm open={editDialogOpen} onOpenChange={setEditDialogOpen} title="Edit Medical Insurance" icon={<Heart className="h-5 w-5" />} mode="edit" size="lg" isSubmitting={isSubmitting} onSubmit={handleEditSubmit}>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6"><Label>Insurance Provider <span className="text-destructive">*</span></Label><Input value={form.insurance_provider} onChange={(e) => setForm((p) => ({ ...p, insurance_provider: e.target.value }))} /></div>
          <div className="col-span-6"><Label>TPA</Label><Input value={form.tpa} onChange={(e) => setForm((p) => ({ ...p, tpa: e.target.value }))} placeholder="Third-party administrator" /></div>
          <div className="col-span-6"><Label>Policy Number <span className="text-destructive">*</span></Label><Input value={form.policy_number} onChange={(e) => setForm((p) => ({ ...p, policy_number: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Insurance Card Number</Label><Input value={form.insurance_card_number} onChange={(e) => setForm((p) => ({ ...p, insurance_card_number: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Network Class</Label><Input value={form.network_class} onChange={(e) => setForm((p) => ({ ...p, network_class: e.target.value }))} placeholder="e.g. Silver, Gold, Platinum" /></div>
          <div className="col-span-3"><Label>Issue Date</Label><Input type="date" value={form.issue_date} onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))} /></div>
          <div className="col-span-3"><Label>Expiry Date <span className="text-destructive">*</span></Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))} /></div>
          <div className="col-span-4"><Label>Status</Label><ERPCombobox value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: String(v) }))} options={DOC_STATUS_OPTIONS} placeholder="Status..." /></div>
          <div className="col-span-4"><Label>Verification</Label><ERPCombobox value={form.verification_status} onValueChange={(v) => setForm((p) => ({ ...p, verification_status: String(v) }))} options={VERIFICATION_OPTIONS} placeholder="Verification..." /></div>
          <div className="col-span-4"><Label>Renewal</Label><ERPCombobox value={form.renewal_status} onValueChange={(v) => setForm((p) => ({ ...p, renewal_status: String(v) }))} options={RENEWAL_STATUS_OPTIONS} placeholder="Renewal..." /></div>
          <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={form.employee_covered} onCheckedChange={(v) => setForm((p) => ({ ...p, employee_covered: v }))} /><Label>Employee Covered</Label></div>
          <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={form.dependent_coverage_included} onCheckedChange={(v) => setForm((p) => ({ ...p, dependent_coverage_included: v }))} /><Label>Dependent Coverage</Label></div>
          <div className="col-span-4"><Label>Dependents Covered</Label><Input type="number" min={0} value={form.dependent_count_covered ?? ""} onChange={(e) => setForm((p) => ({ ...p, dependent_count_covered: e.target.value ? parseInt(e.target.value) : null }))} /></div>
          <div className="col-span-12"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}

// ── 3. DEPENDENTS SECTION ─────────────────────────────────────────────────────

function DependentsSection({ employeeId, canManageDoc, onChildOpen }: { employeeId: number; canManageDoc: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [addDialogOpen, setAddDialogOpenRaw] = useState(false);
  const [editDialogOpen, setEditDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeDependentRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const setAddDialogOpen = useCallback((open: boolean) => { setAddDialogOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);
  const setEditDialogOpen = useCallback((open: boolean) => { setEditDialogOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);

  const initialForm = () => ({
    dms_document_id: null as number | null,
    dependent_name_en: "", dependent_name_ar: "", relationship_type_id: null as number | null,
    date_of_birth: "", nationality_id: null as number | null,
    passport_number: "", passport_expiry: "", emirates_id_number: "", emirates_id_expiry: "",
    residence_visa_number: "", residence_visa_expiry: "", medical_insurance_provider: "",
    medical_insurance_policy: "", medical_insurance_card: "", medical_insurance_expiry: "",
    sponsored_by: "" as string, is_active: true, notes: "",
  });

  type DependentForm = ReturnType<typeof initialForm>;

  const [form, setForm] = useState(initialForm);

  const { data: records, isLoading } = useQuery({
    queryKey: queryKeys.hr.compliance.dependents(employeeId),
    queryFn: async () => { const r = await listEmployeeDependents(employeeId); return r.success ? r.data ?? [] : []; },
  });

  const { data: relTypes } = useQuery({
    queryKey: queryKeys.hr.relationshipTypes(),
    queryFn: async () => {
      const r = await listHrRelationshipTypes({ is_active: true, page: 1, page_size: 100 });
      return r.success && r.data ? r.data.data as HrSettingsRow[] : [];
    },
  });

  const relTypeOptions = (relTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));

  const buildPayload = (f: DependentForm) => ({
    ...f,
    dms_document_id: f.dms_document_id,
    relationship_type_id: f.relationship_type_id!,
    date_of_birth: f.date_of_birth || null, passport_number: f.passport_number || null,
    passport_expiry: f.passport_expiry || null, emirates_id_number: f.emirates_id_number || null,
    emirates_id_expiry: f.emirates_id_expiry || null, residence_visa_number: f.residence_visa_number || null,
    residence_visa_expiry: f.residence_visa_expiry || null, medical_insurance_provider: f.medical_insurance_provider || null,
    medical_insurance_policy: f.medical_insurance_policy || null, medical_insurance_card: f.medical_insurance_card || null,
    medical_insurance_expiry: f.medical_insurance_expiry || null, sponsored_by: f.sponsored_by || null,
    notes: f.notes || null, dependent_name_ar: f.dependent_name_ar || null,
  });

  const validateDependent = (f: DependentForm) => {
    if (!f.dependent_name_en.trim()) return "Dependent name is required";
    if (!f.relationship_type_id) return "Relationship type is required";
    return null;
  };

  const renderDependentFields = (
    f: DependentForm,
    setF: Dispatch<SetStateAction<DependentForm>>,
    prefillMeta: { documentTitle: string; documentNo: string; prefillSource: string; warning?: string | null; linkedToEmployee?: boolean } | null
  ) => (
    <div className="grid grid-cols-12 gap-4">
      <ComplianceDmsPrefillBanner prefillMeta={prefillMeta} />
      <div className="col-span-6"><Label>Name (English) <span className="text-destructive">*</span></Label><Input value={f.dependent_name_en} onChange={(e) => setF((p) => ({ ...p, dependent_name_en: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Name (Arabic)</Label><Input value={f.dependent_name_ar} onChange={(e) => setF((p) => ({ ...p, dependent_name_ar: e.target.value }))} dir="rtl" /></div>
      <div className="col-span-6"><Label>Relationship <span className="text-destructive">*</span></Label><ERPCombobox value={f.relationship_type_id} onValueChange={(v) => setF((p) => ({ ...p, relationship_type_id: Number(v) }))} options={relTypeOptions} placeholder="Select relationship..." required /></div>
      <div className="col-span-3"><Label>Date of Birth</Label><Input type="date" value={f.date_of_birth} onChange={(e) => setF((p) => ({ ...p, date_of_birth: e.target.value }))} /></div>
      <div className="col-span-3"><Label>Nationality</Label><CountrySelect value={f.nationality_id} onValueChange={(v) => setF((p) => ({ ...p, nationality_id: v }))} /></div>
      <div className="col-span-12 border-t pt-3"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Document Details</p></div>
      <div className="col-span-6"><Label>Passport Number</Label><Input value={f.passport_number} onChange={(e) => setF((p) => ({ ...p, passport_number: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Passport Expiry</Label><Input type="date" value={f.passport_expiry} onChange={(e) => setF((p) => ({ ...p, passport_expiry: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Emirates ID Number</Label><Input value={f.emirates_id_number} onChange={(e) => setF((p) => ({ ...p, emirates_id_number: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Emirates ID Expiry</Label><Input type="date" value={f.emirates_id_expiry} onChange={(e) => setF((p) => ({ ...p, emirates_id_expiry: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Residence Visa Number</Label><Input value={f.residence_visa_number} onChange={(e) => setF((p) => ({ ...p, residence_visa_number: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Residence Visa Expiry</Label><Input type="date" value={f.residence_visa_expiry} onChange={(e) => setF((p) => ({ ...p, residence_visa_expiry: e.target.value }))} /></div>
      <div className="col-span-12 border-t pt-3"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Medical Insurance</p></div>
      <div className="col-span-6"><Label>Insurance Provider</Label><Input value={f.medical_insurance_provider} onChange={(e) => setF((p) => ({ ...p, medical_insurance_provider: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Insurance Policy</Label><Input value={f.medical_insurance_policy} onChange={(e) => setF((p) => ({ ...p, medical_insurance_policy: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Insurance Card</Label><Input value={f.medical_insurance_card} onChange={(e) => setF((p) => ({ ...p, medical_insurance_card: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Insurance Expiry</Label><Input type="date" value={f.medical_insurance_expiry} onChange={(e) => setF((p) => ({ ...p, medical_insurance_expiry: e.target.value }))} /></div>
      <div className="col-span-6">
        <Label>Sponsored By</Label>
        <ERPCombobox value={f.sponsored_by || null} onValueChange={(v) => setF((p) => ({ ...p, sponsored_by: v ? String(v) : "" }))} options={[{ value: "employee", label: "Employee" }, { value: "company", label: "Company" }]} placeholder="Select..." />
      </div>
      <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={f.is_active} onCheckedChange={(v) => setF((p) => ({ ...p, is_active: v }))} /><Label>Active</Label></div>
      <div className="col-span-12"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
    </div>
  );

  const openAdd = () => setAddDialogOpen(true);
  const openEdit = (r: EmployeeDependentRow) => {
    setEditing(r);
    setForm({
      dms_document_id: r.dms_document_id,
      dependent_name_en: r.dependent_name_en, dependent_name_ar: r.dependent_name_ar ?? "",
      relationship_type_id: r.relationship_type_id, date_of_birth: r.date_of_birth ?? "",
      nationality_id: r.nationality_id, passport_number: r.passport_number ?? "",
      passport_expiry: r.passport_expiry ?? "", emirates_id_number: r.emirates_id_number ?? "",
      emirates_id_expiry: r.emirates_id_expiry ?? "", residence_visa_number: r.residence_visa_number ?? "",
      residence_visa_expiry: r.residence_visa_expiry ?? "", medical_insurance_provider: r.medical_insurance_provider ?? "",
      medical_insurance_policy: r.medical_insurance_policy ?? "", medical_insurance_card: r.medical_insurance_card ?? "",
      medical_insurance_expiry: r.medical_insurance_expiry ?? "", sponsored_by: r.sponsored_by ?? "",
      is_active: r.is_active, notes: r.notes ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editing) return;
    const err = validateDependent(form);
    if (err) { toast.error(err); return; }
    startTransition(async () => {
      const result = await updateEmployeeDependent(editing.id, buildPayload(form));
      if (result.success) {
        toast.success("Dependent updated");
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.dependents(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) });
        setEditDialogOpen(false);
      } else toast.error(result.error ?? "Failed to save");
    });
  };

  const handleAddSaved = (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => {
    handleComplianceAddSaved(qc, employeeId, queryKeys.hr.compliance.dependents(employeeId), opts);
  };

  const handleArchive = async (id: number) => {
    const result = await archiveEmployeeDependent(id);
    if (result.success) { toast.success("Archived"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.dependents(employeeId) }); }
    else toast.error(result.error);
  };

  return (
    <div className="mb-8">
      <SectionHeader icon={Users} title="Dependents" count={records?.length} onAdd={openAdd} canAdd={canManageDoc} />
      {isLoading && <Skeleton className="h-16 w-full" />}
      {!isLoading && (!records || records.length === 0) && <EmptyState message="No dependents added yet." />}
      {!isLoading && records && records.length > 0 && (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="flex items-start justify-between p-3 border rounded-lg bg-card hover:bg-muted/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.dependent_name_en}</span>
                  {r.relationship_type?.name_en && <Badge variant="secondary" className="text-xs">{r.relationship_type.name_en}</Badge>}
                  {!r.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                  {r.date_of_birth && <span>DOB: {formatDate(r.date_of_birth)}</span>}
                  {r.nationality?.name_en && <span>{r.nationality.name_en}</span>}
                </div>
                <div className="flex gap-3 mt-1 flex-wrap">
                  {r.passport_expiry && <span className="text-xs text-muted-foreground">Passport exp: {formatDate(r.passport_expiry)}</span>}
                  {r.emirates_id_expiry && <span className="text-xs text-muted-foreground">EID exp: {formatDate(r.emirates_id_expiry)}</span>}
                  {r.residence_visa_expiry && <span className="text-xs text-muted-foreground">Visa exp: {formatDate(r.residence_visa_expiry)}</span>}
                </div>
              </div>
              {canManageDoc && (
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <Button size="sm" variant="ghost" type="button" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => handleArchive(r.id)}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ComplianceDmsAddDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        employeeId={employeeId}
        recordKind="dependent"
        icon={<Users className="h-5 w-5" />}
        recordLabel="Dependent"
        submitLabel="Save Dependent"
        size="xl"
        createEmptyForm={initialForm}
        validate={validateDependent}
        save={async (f) => createEmployeeDependent(employeeId, buildPayload(f))}
        onSaved={handleAddSaved}
        renderReview={({ form: addForm, setForm: setAddForm, prefillMeta }) => renderDependentFields(addForm, setAddForm, prefillMeta)}
      />

      <ERPChildDialogForm open={editDialogOpen} onOpenChange={setEditDialogOpen} title="Edit Dependent" icon={<Users className="h-5 w-5" />} mode="edit" size="xl" isSubmitting={isSubmitting} onSubmit={handleEditSubmit}>
        {renderDependentFields(form, setForm, null)}
      </ERPChildDialogForm>
    </div>
  );
}

// ── 4. ACCESS CARDS SECTION ───────────────────────────────────────────────────

function AccessCardsSection({ employeeId, canManageDoc, onChildOpen }: { employeeId: number; canManageDoc: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [addDialogOpen, setAddDialogOpenRaw] = useState(false);
  const [editDialogOpen, setEditDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeAccessCardRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const setAddDialogOpen = useCallback((open: boolean) => { setAddDialogOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);
  const setEditDialogOpen = useCallback((open: boolean) => { setEditDialogOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);

  const initialForm = () => ({
    dms_document_id: null as number | null,
    access_type_id: null as number | null, client_authority: "", work_site_id: null as number | null,
    card_number: "", application_reference: "", issue_date: "", expiry_date: "",
    status: "pending" as string, access_level: "", renewal_status: "not_required" as string, notes: "",
  });

  type AccessCardForm = ReturnType<typeof initialForm>;

  const [form, setForm] = useState(initialForm);

  const { data: records, isLoading } = useQuery({
    queryKey: queryKeys.hr.compliance.accessCards(employeeId),
    queryFn: async () => { const r = await listEmployeeAccessCards(employeeId); return r.success ? r.data ?? [] : []; },
  });

  const { data: cardTypes } = useQuery({
    queryKey: queryKeys.hr.accessCardTypes(),
    queryFn: async () => {
      const r = await listHrAccessCardTypes({ is_active: true, page: 1, page_size: 100 });
      return r.success && r.data ? r.data.data as HrAccessCardTypeRow[] : [];
    },
  });

  const cardTypeOptions = (cardTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));
  const accessStatusOptions = [
    { value: "active", label: "Active" }, { value: "expired", label: "Expired" }, { value: "cancelled", label: "Cancelled" },
    { value: "suspended", label: "Suspended" }, { value: "pending", label: "Pending" }, { value: "in_application", label: "In Application" },
  ];

  const buildPayload = (f: AccessCardForm) => ({
    ...f,
    dms_document_id: f.dms_document_id,
    access_type_id: f.access_type_id!,
    client_authority: f.client_authority || null,
    card_number: f.card_number || null,
    application_reference: f.application_reference || null,
    issue_date: f.issue_date || null,
    expiry_date: f.expiry_date || null,
    access_level: f.access_level || null,
    notes: f.notes || null,
  });

  const validateAccessCard = (f: AccessCardForm) => {
    if (!f.access_type_id) return "Access type is required";
    return null;
  };

  const renderAccessCardFields = (
    f: AccessCardForm,
    setF: Dispatch<SetStateAction<AccessCardForm>>,
    prefillMeta: Parameters<typeof ComplianceDmsPrefillBanner>[0]["prefillMeta"]
  ) => (
    <div className="grid grid-cols-12 gap-4">
      <ComplianceDmsPrefillBanner prefillMeta={prefillMeta} />
      <div className="col-span-6"><Label>Access Type <span className="text-destructive">*</span></Label><ERPCombobox value={f.access_type_id} onValueChange={(v) => setF((p) => ({ ...p, access_type_id: Number(v) }))} options={cardTypeOptions} placeholder="Select type..." required /></div>
      <div className="col-span-6"><Label>Client / Authority</Label><Input value={f.client_authority} onChange={(e) => setF((p) => ({ ...p, client_authority: e.target.value }))} placeholder="e.g. CICPA, ADNOC" /></div>
      <div className="col-span-6"><Label>Card Number</Label><Input value={f.card_number} onChange={(e) => setF((p) => ({ ...p, card_number: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Application Reference</Label><Input value={f.application_reference} onChange={(e) => setF((p) => ({ ...p, application_reference: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Issue Date</Label><Input type="date" value={f.issue_date} onChange={(e) => setF((p) => ({ ...p, issue_date: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Expiry Date</Label><Input type="date" value={f.expiry_date} onChange={(e) => setF((p) => ({ ...p, expiry_date: e.target.value }))} /></div>
      <div className="col-span-4"><Label>Status</Label><ERPCombobox value={f.status} onValueChange={(v) => setF((p) => ({ ...p, status: String(v) }))} options={accessStatusOptions} placeholder="Status..." /></div>
      <div className="col-span-4"><Label>Access Level</Label><Input value={f.access_level} onChange={(e) => setF((p) => ({ ...p, access_level: e.target.value }))} placeholder="e.g. Level 1, Zone A" /></div>
      <div className="col-span-4"><Label>Renewal</Label><ERPCombobox value={f.renewal_status} onValueChange={(v) => setF((p) => ({ ...p, renewal_status: String(v) }))} options={RENEWAL_STATUS_OPTIONS} placeholder="Renewal..." /></div>
      <div className="col-span-12"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
    </div>
  );

  const openAdd = () => setAddDialogOpen(true);
  const openEdit = (r: EmployeeAccessCardRow) => {
    setEditing(r);
    setForm({
      dms_document_id: r.dms_document_id,
      access_type_id: r.access_type_id, client_authority: r.client_authority ?? "", work_site_id: r.work_site_id,
      card_number: r.card_number ?? "", application_reference: r.application_reference ?? "",
      issue_date: r.issue_date ?? "", expiry_date: r.expiry_date ?? "", status: r.status,
      access_level: r.access_level ?? "", renewal_status: r.renewal_status, notes: r.notes ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editing) return;
    const err = validateAccessCard(form);
    if (err) { toast.error(err); return; }
    startTransition(async () => {
      const result = await updateEmployeeAccessCard(editing.id, buildPayload(form));
      if (result.success) {
        toast.success("Updated");
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.accessCards(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) });
        setEditDialogOpen(false);
      } else toast.error(result.error ?? "Failed to save");
    });
  };

  const handleAddSaved = (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => {
    handleComplianceAddSaved(qc, employeeId, queryKeys.hr.compliance.accessCards(employeeId), opts);
  };

  const handleArchive = async (id: number) => {
    const r = await archiveEmployeeAccessCard(id);
    if (r.success) { toast.success("Archived"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.accessCards(employeeId) }); }
    else toast.error(r.error);
  };

  return (
    <div className="mb-8">
      <SectionHeader icon={CreditCard} title="Access Cards & Passes" count={records?.length} onAdd={openAdd} canAdd={canManageDoc} />
      {isLoading && <Skeleton className="h-16 w-full" />}
      {!isLoading && (!records || records.length === 0) && <EmptyState message="No access cards or passes added yet." />}
      {!isLoading && records && records.length > 0 && (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="flex items-start justify-between p-3 border rounded-lg bg-card hover:bg-muted/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.access_type?.name_en ?? `Type ${r.access_type_id}`}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {r.client_authority && <span>{r.client_authority} · </span>}
                  {r.card_number && <span>Card: {r.card_number}</span>}
                  {r.work_site?.site_name && <span> · {r.work_site.site_name}</span>}
                </div>
                <div className="mt-1"><ExpiryBadge expiryDate={r.expiry_date} /></div>
              </div>
              {canManageDoc && (
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <Button size="sm" variant="ghost" type="button" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => handleArchive(r.id)}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ComplianceDmsAddDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        employeeId={employeeId}
        recordKind="access_card"
        icon={<CreditCard className="h-5 w-5" />}
        recordLabel="Access Card"
        submitLabel="Save Access Card"
        createEmptyForm={initialForm}
        validate={validateAccessCard}
        save={async (f) => createEmployeeAccessCard(employeeId, buildPayload(f))}
        onSaved={handleAddSaved}
        renderReview={({ form: addForm, setForm: setAddForm, prefillMeta }) => renderAccessCardFields(addForm, setAddForm, prefillMeta)}
      />

      <ERPChildDialogForm open={editDialogOpen} onOpenChange={setEditDialogOpen} title="Edit Access Card" icon={<CreditCard className="h-5 w-5" />} mode="edit" size="lg" isSubmitting={isSubmitting} onSubmit={handleEditSubmit}>
        {renderAccessCardFields(form, setForm, null)}
      </ERPChildDialogForm>
    </div>
  );
}

// ── 5. TRAINING CERTIFICATES SECTION ─────────────────────────────────────────

function TrainingCertificatesSection({ employeeId, canManageDoc, onChildOpen }: { employeeId: number; canManageDoc: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [addDialogOpen, setAddDialogOpenRaw] = useState(false);
  const [editDialogOpen, setEditDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeTrainingCertificateRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const setAddDialogOpen = useCallback((open: boolean) => { setAddDialogOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);
  const setEditDialogOpen = useCallback((open: boolean) => { setEditDialogOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);

  const initialForm = () => ({
    dms_document_id: null as number | null,
    training_category_id: null as number | null, training_type_id: null as number | null,
    provider: "", approval_body: "", certificate_number: "", issue_date: "", expiry_date: "",
    validity_months: null as number | null, required_for_designation: false, required_for_site: false,
    status: "valid" as string, verification_status: "unverified" as string, renewal_status: "not_required" as string, notes: "",
  });

  type TrainingForm = ReturnType<typeof initialForm>;

  const [form, setForm] = useState(initialForm);

  const { data: records, isLoading } = useQuery({
    queryKey: queryKeys.hr.compliance.trainingCertificates(employeeId),
    queryFn: async () => { const r = await listEmployeeTrainingCertificates(employeeId); return r.success ? r.data ?? [] : []; },
  });

  const { data: trainCategories } = useQuery({
    queryKey: queryKeys.hr.trainingCategories(),
    queryFn: async () => {
      const r = await listHrTrainingCategories({ is_active: true, page: 1, page_size: 100 });
      return r.success && r.data ? r.data.data as HrSettingsRow[] : [];
    },
  });

  const { data: trainTypes } = useQuery({
    queryKey: queryKeys.hr.trainingTypes(),
    queryFn: async () => {
      const r = await listHrTrainingTypes({ is_active: true, page: 1, page_size: 100 });
      return r.success && r.data ? r.data.data as HrTrainingTypeRow[] : [];
    },
  });

  const catOptions = (trainCategories ?? []).map((t) => ({ value: t.id, label: t.name_en }));
  const typeOptions = (trainTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));
  const trainStatusOptions = [{ value: "valid", label: "Valid" }, { value: "expired", label: "Expired" }, { value: "pending", label: "Pending" }, { value: "in_progress", label: "In Progress" }];

  const buildPayload = (f: TrainingForm) => ({
    ...f,
    dms_document_id: f.dms_document_id,
    training_type_id: f.training_type_id!,
    provider: f.provider || null,
    approval_body: f.approval_body || null,
    certificate_number: f.certificate_number || null,
    issue_date: f.issue_date || null,
    expiry_date: f.expiry_date || null,
    notes: f.notes || null,
  });

  const validateTraining = (f: TrainingForm) => {
    if (!f.training_type_id) return "Training type is required";
    return null;
  };

  const renderTrainingFields = (
    f: TrainingForm,
    setF: Dispatch<SetStateAction<TrainingForm>>,
    prefillMeta: Parameters<typeof ComplianceDmsPrefillBanner>[0]["prefillMeta"]
  ) => (
    <div className="grid grid-cols-12 gap-4">
      <ComplianceDmsPrefillBanner prefillMeta={prefillMeta} />
      <div className="col-span-6"><Label>Training Category</Label><ERPCombobox value={f.training_category_id} onValueChange={(v) => setF((p) => ({ ...p, training_category_id: Number(v) }))} options={catOptions} placeholder="Select category..." /></div>
      <div className="col-span-6"><Label>Training Type <span className="text-destructive">*</span></Label><ERPCombobox value={f.training_type_id} onValueChange={(v) => setF((p) => ({ ...p, training_type_id: Number(v) }))} options={typeOptions} placeholder="Select type..." required /></div>
      <div className="col-span-6"><Label>Provider</Label><Input value={f.provider} onChange={(e) => setF((p) => ({ ...p, provider: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Approval Body</Label><Input value={f.approval_body} onChange={(e) => setF((p) => ({ ...p, approval_body: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Certificate Number</Label><Input value={f.certificate_number} onChange={(e) => setF((p) => ({ ...p, certificate_number: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Validity Months</Label><Input type="number" min={0} value={f.validity_months ?? ""} onChange={(e) => setF((p) => ({ ...p, validity_months: e.target.value ? parseInt(e.target.value) : null }))} /></div>
      <div className="col-span-6"><Label>Issue Date</Label><Input type="date" value={f.issue_date} onChange={(e) => setF((p) => ({ ...p, issue_date: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Expiry Date</Label><Input type="date" value={f.expiry_date} onChange={(e) => setF((p) => ({ ...p, expiry_date: e.target.value }))} /></div>
      <div className="col-span-4"><Label>Status</Label><ERPCombobox value={f.status} onValueChange={(v) => setF((p) => ({ ...p, status: String(v) }))} options={trainStatusOptions} placeholder="Status..." /></div>
      <div className="col-span-4"><Label>Verification</Label><ERPCombobox value={f.verification_status} onValueChange={(v) => setF((p) => ({ ...p, verification_status: String(v) }))} options={VERIFICATION_OPTIONS} placeholder="Verification..." /></div>
      <div className="col-span-4"><Label>Renewal</Label><ERPCombobox value={f.renewal_status} onValueChange={(v) => setF((p) => ({ ...p, renewal_status: String(v) }))} options={RENEWAL_STATUS_OPTIONS} placeholder="Renewal..." /></div>
      <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={f.required_for_designation} onCheckedChange={(v) => setF((p) => ({ ...p, required_for_designation: v }))} /><Label>Required for Designation</Label></div>
      <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={f.required_for_site} onCheckedChange={(v) => setF((p) => ({ ...p, required_for_site: v }))} /><Label>Required for Site</Label></div>
      <div className="col-span-12"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
    </div>
  );

  const openAdd = () => setAddDialogOpen(true);
  const openEdit = (r: EmployeeTrainingCertificateRow) => {
    setEditing(r);
    setForm({
      dms_document_id: r.dms_document_id,
      training_category_id: r.training_category_id, training_type_id: r.training_type_id,
      provider: r.provider ?? "", approval_body: r.approval_body ?? "",
      certificate_number: r.certificate_number ?? "", issue_date: r.issue_date ?? "", expiry_date: r.expiry_date ?? "",
      validity_months: r.validity_months, required_for_designation: r.required_for_designation,
      required_for_site: r.required_for_site, status: r.status, verification_status: r.verification_status,
      renewal_status: r.renewal_status, notes: r.notes ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editing) return;
    const err = validateTraining(form);
    if (err) { toast.error(err); return; }
    startTransition(async () => {
      const result = await updateEmployeeTrainingCertificate(editing.id, buildPayload(form));
      if (result.success) {
        toast.success("Updated");
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.trainingCertificates(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) });
        setEditDialogOpen(false);
      } else toast.error(result.error ?? "Failed to save");
    });
  };

  const handleAddSaved = (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => {
    handleComplianceAddSaved(qc, employeeId, queryKeys.hr.compliance.trainingCertificates(employeeId), opts);
  };

  const handleArchive = async (id: number) => {
    const r = await archiveEmployeeTrainingCertificate(id);
    if (r.success) { toast.success("Archived"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.trainingCertificates(employeeId) }); }
    else toast.error(r.error);
  };

  const handleVerify = async (id: number) => {
    const r = await verifyEmployeeTrainingCertificate(id);
    if (r.success) { toast.success("Verified"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.trainingCertificates(employeeId) }); }
    else toast.error(r.error);
  };

  return (
    <div className="mb-8">
      <SectionHeader icon={GraduationCap} title="Training & Certifications" count={records?.length} onAdd={openAdd} canAdd={canManageDoc} />
      {isLoading && <Skeleton className="h-16 w-full" />}
      {!isLoading && (!records || records.length === 0) && <EmptyState message="No training certificates added yet." />}
      {!isLoading && records && records.length > 0 && (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="flex items-start justify-between p-3 border rounded-lg bg-card hover:bg-muted/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{r.training_type?.name_en ?? `Type ${r.training_type_id}`}</span>
                  <StatusBadge status={r.status} />
                  <VerificationBadge status={r.verification_status} />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {r.training_category?.name_en && <span>{r.training_category.name_en} · </span>}
                  {r.provider && <span>{r.provider}</span>}
                  {r.certificate_number && <span> · {r.certificate_number}</span>}
                </div>
                <div className="mt-1"><ExpiryBadge expiryDate={r.expiry_date} /></div>
              </div>
              {canManageDoc && (
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  {r.verification_status === "unverified" && <Button size="sm" variant="ghost" type="button" onClick={() => handleVerify(r.id)} title="Verify"><CheckCircle className="h-3.5 w-3.5" /></Button>}
                  <Button size="sm" variant="ghost" type="button" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => handleArchive(r.id)}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ComplianceDmsAddDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        employeeId={employeeId}
        recordKind="training_certificate"
        icon={<GraduationCap className="h-5 w-5" />}
        recordLabel="Training Certificate"
        submitLabel="Save Certificate"
        createEmptyForm={initialForm}
        validate={validateTraining}
        save={async (f) => createEmployeeTrainingCertificate(employeeId, buildPayload(f))}
        onSaved={handleAddSaved}
        renderReview={({ form: addForm, setForm: setAddForm, prefillMeta }) => renderTrainingFields(addForm, setAddForm, prefillMeta)}
      />

      <ERPChildDialogForm open={editDialogOpen} onOpenChange={setEditDialogOpen} title="Edit Certificate" icon={<GraduationCap className="h-5 w-5" />} mode="edit" size="lg" isSubmitting={isSubmitting} onSubmit={handleEditSubmit}>
        {renderTrainingFields(form, setForm, null)}
      </ERPChildDialogForm>
    </div>
  );
}

// ── 6. MEDICAL RECORDS SECTION (RESTRICTED) ───────────────────────────────────

function MedicalRecordsSection({ employeeId, canMedView, canMedManage, onChildOpen }: { employeeId: number; canMedView: boolean; canMedManage: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [addDialogOpen, setAddDialogOpenRaw] = useState(false);
  const [editDialogOpen, setEditDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeMedicalRecordRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const setAddDialogOpen = useCallback((open: boolean) => { setAddDialogOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);
  const setEditDialogOpen = useCallback((open: boolean) => { setEditDialogOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);

  const initialForm = () => ({
    dms_document_id: null as number | null,
    medical_record_type_id: null as number | null, medical_center: "", report_number: "",
    examination_date: "", result: "under_review" as string, fit_for_work: false,
    work_restrictions: false, restriction_details: "", expiry_date: "",
    required_for_visa: false, required_for_site: false, required_for_offshore: false,
    confidentiality_level: "restricted" as string, notes: "",
  });

  type MedicalRecordForm = ReturnType<typeof initialForm>;

  const [form, setForm] = useState(initialForm);

  const { data: records, isLoading } = useQuery({
    queryKey: queryKeys.hr.compliance.medicalRecords(employeeId),
    enabled: canMedView,
    queryFn: async () => { const r = await listEmployeeMedicalRecords(employeeId); return r.success ? r.data ?? [] : []; },
  });

  const { data: recTypes } = useQuery({
    queryKey: queryKeys.hr.medicalRecordTypes(),
    enabled: canMedView,
    queryFn: async () => {
      const r = await listHrMedicalRecordTypes({ is_active: true, page: 1, page_size: 100 });
      return r.success && r.data ? r.data.data as HrMedicalRecordTypeRow[] : [];
    },
  });

  if (!canMedView) {
    return (
      <div className="mb-8">
        <SectionHeader icon={Activity} title="Medical & Health Records" />
        <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg border">
          <Lock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <p className="text-sm text-muted-foreground">Medical records are restricted. You need the <strong>hr.medical.view</strong> permission to access this section.</p>
        </div>
      </div>
    );
  }

  const openAdd = () => setAddDialogOpen(true);
  const openEdit = (r: EmployeeMedicalRecordRow) => {
    setEditing(r);
    setForm({
      dms_document_id: r.dms_document_id,
      medical_record_type_id: r.medical_record_type_id, medical_center: r.medical_center ?? "",
      report_number: r.report_number ?? "", examination_date: r.examination_date, result: r.result,
      fit_for_work: r.fit_for_work, work_restrictions: r.work_restrictions,
      restriction_details: r.restriction_details ?? "", expiry_date: r.expiry_date ?? "",
      required_for_visa: r.required_for_visa, required_for_site: r.required_for_site,
      required_for_offshore: r.required_for_offshore, confidentiality_level: r.confidentiality_level,
      notes: r.notes ?? "",
    });
    setEditDialogOpen(true);
  };

  const buildPayload = (f: MedicalRecordForm) => ({
    ...f,
    dms_document_id: f.dms_document_id,
    medical_record_type_id: f.medical_record_type_id!,
    medical_center: f.medical_center || null,
    report_number: f.report_number || null,
    restriction_details: f.restriction_details || null,
    expiry_date: f.expiry_date || null,
    notes: f.notes || null,
  });

  const validateMedicalRecord = (f: MedicalRecordForm) => {
    if (!f.medical_record_type_id) return "Medical record type is required";
    if (!f.examination_date) return "Examination date is required";
    if (!f.result) return "Result is required";
    return null;
  };

  const handleEditSubmit = () => {
    if (!editing) return;
    const err = validateMedicalRecord(form);
    if (err) { toast.error(err); return; }
    startTransition(async () => {
      const result = await updateEmployeeMedicalRecord(editing.id, buildPayload(form));
      if (result.success) {
        toast.success("Updated");
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.medicalRecords(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) });
        setEditDialogOpen(false);
      } else toast.error(result.error ?? "Failed to save");
    });
  };

  const handleAddSaved = (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => {
    handleComplianceAddSaved(qc, employeeId, queryKeys.hr.compliance.medicalRecords(employeeId), opts);
  };

  const handleArchive = async (id: number) => {
    const r = await archiveEmployeeMedicalRecord(id);
    if (r.success) { toast.success("Archived"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.medicalRecords(employeeId) }); }
    else toast.error(r.error);
  };

  const recTypeOptions = (recTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));
  const resultOptions = [{ value: "fit", label: "Fit" }, { value: "unfit", label: "Unfit" }, { value: "conditionally_fit", label: "Conditionally Fit" }, { value: "under_review", label: "Under Review" }];
  const confidentialityOptions = [{ value: "internal", label: "Internal" }, { value: "restricted", label: "Restricted" }, { value: "medical_only", label: "Medical Only" }];

  const renderMedicalRecordFields = (
    f: MedicalRecordForm,
    setF: Dispatch<SetStateAction<MedicalRecordForm>>,
    prefillMeta: Parameters<typeof ComplianceDmsPrefillBanner>[0]["prefillMeta"]
  ) => (
    <div className="grid grid-cols-12 gap-4">
      <ComplianceDmsPrefillBanner prefillMeta={prefillMeta} />
      <div className="col-span-6"><Label>Medical Record Type <span className="text-destructive">*</span></Label><ERPCombobox value={f.medical_record_type_id} onValueChange={(v) => setF((p) => ({ ...p, medical_record_type_id: Number(v) }))} options={recTypeOptions} placeholder="Select type..." required /></div>
      <div className="col-span-6"><Label>Medical Center</Label><Input value={f.medical_center} onChange={(e) => setF((p) => ({ ...p, medical_center: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Report Number</Label><Input value={f.report_number} onChange={(e) => setF((p) => ({ ...p, report_number: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Examination Date <span className="text-destructive">*</span></Label><Input type="date" value={f.examination_date} onChange={(e) => setF((p) => ({ ...p, examination_date: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Result <span className="text-destructive">*</span></Label><ERPCombobox value={f.result} onValueChange={(v) => setF((p) => ({ ...p, result: String(v) }))} options={resultOptions} placeholder="Result..." required /></div>
      <div className="col-span-6"><Label>Expiry Date</Label><Input type="date" value={f.expiry_date} onChange={(e) => setF((p) => ({ ...p, expiry_date: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Confidentiality Level</Label><ERPCombobox value={f.confidentiality_level} onValueChange={(v) => setF((p) => ({ ...p, confidentiality_level: String(v) }))} options={confidentialityOptions} placeholder="Level..." /></div>
      <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={f.fit_for_work} onCheckedChange={(v) => setF((p) => ({ ...p, fit_for_work: v }))} /><Label>Fit for Work</Label></div>
      <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={f.work_restrictions} onCheckedChange={(v) => setF((p) => ({ ...p, work_restrictions: v }))} /><Label>Work Restrictions</Label></div>
      {f.work_restrictions && <div className="col-span-12"><Label>Restriction Details</Label><Textarea value={f.restriction_details} onChange={(e) => setF((p) => ({ ...p, restriction_details: e.target.value }))} rows={2} /></div>}
      <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={f.required_for_visa} onCheckedChange={(v) => setF((p) => ({ ...p, required_for_visa: v }))} /><Label>Required for Visa</Label></div>
      <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={f.required_for_site} onCheckedChange={(v) => setF((p) => ({ ...p, required_for_site: v }))} /><Label>Required for Site</Label></div>
      <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={f.required_for_offshore} onCheckedChange={(v) => setF((p) => ({ ...p, required_for_offshore: v }))} /><Label>Required for Offshore</Label></div>
      <div className="col-span-12"><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
    </div>
  );

  return (
    <div className="mb-8">
      <SectionHeader icon={Activity} title="Medical & Health Records" count={records?.length} onAdd={canMedManage ? openAdd : undefined} canAdd={canMedManage} />
      {isLoading && <Skeleton className="h-16 w-full" />}
      {!isLoading && (!records || records.length === 0) && <EmptyState message="No medical records added yet." />}
      {!isLoading && records && records.length > 0 && (
        <div className="space-y-2">
          {records.map((r) => {
            const resultCfg = getMedicalResultBadge(r.result);
            return (
              <div key={r.id} className="flex items-start justify-between p-3 border rounded-lg bg-card hover:bg-muted/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.medical_record_type?.name_en ?? `Type ${r.medical_record_type_id}`}</span>
                    <Badge variant={resultCfg.variant as "default" | "secondary" | "destructive" | "outline"} className="text-xs">{resultCfg.label}</Badge>
                    <Badge variant="outline" className="text-xs">{r.confidentiality_level}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.medical_center && <span>{r.medical_center} · </span>}
                    Examined: {formatDate(r.examination_date)}
                    {r.report_number && <span> · {r.report_number}</span>}
                  </div>
                  {r.expiry_date && <div className="mt-1"><ExpiryBadge expiryDate={r.expiry_date} /></div>}
                </div>
                {canMedManage && (
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <Button size="sm" variant="ghost" type="button" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" type="button" onClick={() => handleArchive(r.id)}><Archive className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canMedManage && (
        <>
          <ComplianceDmsAddDialog
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
            employeeId={employeeId}
            recordKind="medical_record"
            icon={<Activity className="h-5 w-5" />}
            recordLabel="Medical Record"
            submitLabel="Save Medical Record"
            createEmptyForm={initialForm}
            validate={validateMedicalRecord}
            save={async (f) => createEmployeeMedicalRecord(employeeId, buildPayload(f))}
            onSaved={handleAddSaved}
            renderReview={({ form: addForm, setForm: setAddForm, prefillMeta }) => renderMedicalRecordFields(addForm, setAddForm, prefillMeta)}
          />

          <ERPChildDialogForm open={editDialogOpen} onOpenChange={setEditDialogOpen} title="Edit Medical Record" icon={<Activity className="h-5 w-5" />} mode="edit" size="lg" isSubmitting={isSubmitting} onSubmit={handleEditSubmit}>
            {renderMedicalRecordFields(form, setForm, null)}
          </ERPChildDialogForm>
        </>
      )}
    </div>
  );
}

// ── MAIN COMPLIANCE TAB ───────────────────────────────────────────────────────

export function EmployeeComplianceTab({ employeeId, authContext, onChildOpen }: ComplianceTabProps) {
  const manage = canManage(authContext);
  const medView = canMedicalView(authContext);
  const medManage = canMedicalManage(authContext);

  if (!canView(authContext)) {
    return (
      <div className="flex items-center gap-3 p-6 bg-muted/30 rounded-lg border">
        <Lock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          You do not have permission to view compliance records. Please contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Compliance Records</h3>
        <Badge variant="secondary" className="text-xs">HR.3</Badge>
      </div>

      <IdentityDocumentsSection employeeId={employeeId} canManageDoc={manage} onChildOpen={onChildOpen} />
      <MedicalInsurancesSection employeeId={employeeId} canManageDoc={manage} onChildOpen={onChildOpen} />
      <DependentsSection employeeId={employeeId} canManageDoc={manage} onChildOpen={onChildOpen} />
      <AccessCardsSection employeeId={employeeId} canManageDoc={manage} onChildOpen={onChildOpen} />
      <TrainingCertificatesSection employeeId={employeeId} canManageDoc={manage} onChildOpen={onChildOpen} />
      <MedicalRecordsSection employeeId={employeeId} canMedView={medView} canMedManage={medManage} onChildOpen={onChildOpen} />
    </div>
  );
}
