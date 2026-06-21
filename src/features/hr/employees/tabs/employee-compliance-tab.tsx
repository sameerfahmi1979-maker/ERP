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

import { useState, useTransition, useCallback } from "react";
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

// ── 2. MEDICAL INSURANCE SECTION ──────────────────────────────────────────────

function MedicalInsurancesSection({ employeeId, canManageDoc, onChildOpen }: { employeeId: number; canManageDoc: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeMedicalInsuranceRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const setDialogOpen = useCallback((open: boolean) => {
    setDialogOpenRaw(open);
    onChildOpen?.(open);
  }, [onChildOpen]);

  const initialForm = () => ({
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

  const [form, setForm] = useState(initialForm);

  const { data: records, isLoading } = useQuery({
    queryKey: queryKeys.hr.compliance.medicalInsurances(employeeId),
    queryFn: async () => {
      const r = await listEmployeeMedicalInsurances(employeeId);
      return r.success ? r.data ?? [] : [];
    },
  });

  const openAdd = () => { setEditing(null); setForm(initialForm()); setDialogOpen(true); };
  const openEdit = (r: EmployeeMedicalInsuranceRow) => {
    setEditing(r);
    setForm({
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
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const payload = { ...form, tpa: form.tpa || null, insurance_card_number: form.insurance_card_number || null, network_class: form.network_class || null, issue_date: form.issue_date || null, notes: form.notes || null };
      const result = editing
        ? await updateEmployeeMedicalInsurance(editing.id, payload)
        : await createEmployeeMedicalInsurance(employeeId, payload);
      if (result.success) {
        toast.success(editing ? "Insurance updated" : "Insurance added");
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.medicalInsurances(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) });
        setDialogOpen(false);
      } else toast.error(result.error ?? "Failed to save");
    });
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

      <ERPChildDialogForm open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit Medical Insurance" : "Add Medical Insurance"} icon={<Heart className="h-5 w-5" />} mode={editing ? "edit" : "add"} size="lg" isSubmitting={isSubmitting} onSubmit={handleSubmit}>
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
  const [dialogOpen, setDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeDependentRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const setDialogOpen = useCallback((open: boolean) => { setDialogOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);

  const initialForm = () => ({
    dependent_name_en: "", dependent_name_ar: "", relationship_type_id: null as number | null,
    date_of_birth: "", nationality_id: null as number | null,
    passport_number: "", passport_expiry: "", emirates_id_number: "", emirates_id_expiry: "",
    residence_visa_number: "", residence_visa_expiry: "", medical_insurance_provider: "",
    medical_insurance_policy: "", medical_insurance_card: "", medical_insurance_expiry: "",
    sponsored_by: "" as string, is_active: true, notes: "",
  });

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

  const openAdd = () => { setEditing(null); setForm(initialForm()); setDialogOpen(true); };
  const openEdit = (r: EmployeeDependentRow) => {
    setEditing(r);
    setForm({
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
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const payload = {
        ...form, relationship_type_id: form.relationship_type_id!,
        date_of_birth: form.date_of_birth || null, passport_number: form.passport_number || null,
        passport_expiry: form.passport_expiry || null, emirates_id_number: form.emirates_id_number || null,
        emirates_id_expiry: form.emirates_id_expiry || null, residence_visa_number: form.residence_visa_number || null,
        residence_visa_expiry: form.residence_visa_expiry || null, medical_insurance_provider: form.medical_insurance_provider || null,
        medical_insurance_policy: form.medical_insurance_policy || null, medical_insurance_card: form.medical_insurance_card || null,
        medical_insurance_expiry: form.medical_insurance_expiry || null, sponsored_by: form.sponsored_by || null,
        notes: form.notes || null, dependent_name_ar: form.dependent_name_ar || null,
      };
      const result = editing ? await updateEmployeeDependent(editing.id, payload) : await createEmployeeDependent(employeeId, payload);
      if (result.success) {
        toast.success(editing ? "Dependent updated" : "Dependent added");
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.dependents(employeeId) });
        qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) });
        setDialogOpen(false);
      } else toast.error(result.error ?? "Failed to save");
    });
  };

  const handleArchive = async (id: number) => {
    const result = await archiveEmployeeDependent(id);
    if (result.success) { toast.success("Archived"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.dependents(employeeId) }); }
    else toast.error(result.error);
  };

  const relTypeOptions = (relTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));

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

      <ERPChildDialogForm open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit Dependent" : "Add Dependent"} icon={<Users className="h-5 w-5" />} mode={editing ? "edit" : "add"} size="xl" isSubmitting={isSubmitting} onSubmit={handleSubmit}>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6"><Label>Name (English) <span className="text-destructive">*</span></Label><Input value={form.dependent_name_en} onChange={(e) => setForm((p) => ({ ...p, dependent_name_en: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Name (Arabic)</Label><Input value={form.dependent_name_ar} onChange={(e) => setForm((p) => ({ ...p, dependent_name_ar: e.target.value }))} dir="rtl" /></div>
          <div className="col-span-6"><Label>Relationship <span className="text-destructive">*</span></Label><ERPCombobox value={form.relationship_type_id} onValueChange={(v) => setForm((p) => ({ ...p, relationship_type_id: Number(v) }))} options={relTypeOptions} placeholder="Select relationship..." required /></div>
          <div className="col-span-3"><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={(e) => setForm((p) => ({ ...p, date_of_birth: e.target.value }))} /></div>
          <div className="col-span-3"><Label>Nationality</Label><CountrySelect value={form.nationality_id} onValueChange={(v) => setForm((p) => ({ ...p, nationality_id: v }))} /></div>
          <div className="col-span-12 border-t pt-3"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Document Details</p></div>
          <div className="col-span-6"><Label>Passport Number</Label><Input value={form.passport_number} onChange={(e) => setForm((p) => ({ ...p, passport_number: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Passport Expiry</Label><Input type="date" value={form.passport_expiry} onChange={(e) => setForm((p) => ({ ...p, passport_expiry: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Emirates ID Number</Label><Input value={form.emirates_id_number} onChange={(e) => setForm((p) => ({ ...p, emirates_id_number: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Emirates ID Expiry</Label><Input type="date" value={form.emirates_id_expiry} onChange={(e) => setForm((p) => ({ ...p, emirates_id_expiry: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Residence Visa Number</Label><Input value={form.residence_visa_number} onChange={(e) => setForm((p) => ({ ...p, residence_visa_number: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Residence Visa Expiry</Label><Input type="date" value={form.residence_visa_expiry} onChange={(e) => setForm((p) => ({ ...p, residence_visa_expiry: e.target.value }))} /></div>
          <div className="col-span-12 border-t pt-3"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Medical Insurance</p></div>
          <div className="col-span-6"><Label>Insurance Provider</Label><Input value={form.medical_insurance_provider} onChange={(e) => setForm((p) => ({ ...p, medical_insurance_provider: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Insurance Policy</Label><Input value={form.medical_insurance_policy} onChange={(e) => setForm((p) => ({ ...p, medical_insurance_policy: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Insurance Card</Label><Input value={form.medical_insurance_card} onChange={(e) => setForm((p) => ({ ...p, medical_insurance_card: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Insurance Expiry</Label><Input type="date" value={form.medical_insurance_expiry} onChange={(e) => setForm((p) => ({ ...p, medical_insurance_expiry: e.target.value }))} /></div>
          <div className="col-span-6">
            <Label>Sponsored By</Label>
            <ERPCombobox value={form.sponsored_by || null} onValueChange={(v) => setForm((p) => ({ ...p, sponsored_by: v ? String(v) : "" }))} options={[{ value: "employee", label: "Employee" }, { value: "company", label: "Company" }]} placeholder="Select..." />
          </div>
          <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={form.is_active} onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))} /><Label>Active</Label></div>
          <div className="col-span-12"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}

// ── 4. ACCESS CARDS SECTION ───────────────────────────────────────────────────

function AccessCardsSection({ employeeId, canManageDoc, onChildOpen }: { employeeId: number; canManageDoc: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeAccessCardRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const setDialogOpen = useCallback((open: boolean) => { setDialogOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);

  const initialForm = () => ({
    access_type_id: null as number | null, client_authority: "", work_site_id: null as number | null,
    card_number: "", application_reference: "", issue_date: "", expiry_date: "",
    status: "pending" as string, access_level: "", renewal_status: "not_required" as string, notes: "",
  });

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

  const openAdd = () => { setEditing(null); setForm(initialForm()); setDialogOpen(true); };
  const openEdit = (r: EmployeeAccessCardRow) => {
    setEditing(r);
    setForm({ access_type_id: r.access_type_id, client_authority: r.client_authority ?? "", work_site_id: r.work_site_id, card_number: r.card_number ?? "", application_reference: r.application_reference ?? "", issue_date: r.issue_date ?? "", expiry_date: r.expiry_date ?? "", status: r.status, access_level: r.access_level ?? "", renewal_status: r.renewal_status, notes: r.notes ?? "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const payload = { ...form, access_type_id: form.access_type_id!, client_authority: form.client_authority || null, card_number: form.card_number || null, application_reference: form.application_reference || null, issue_date: form.issue_date || null, expiry_date: form.expiry_date || null, access_level: form.access_level || null, notes: form.notes || null };
      const result = editing ? await updateEmployeeAccessCard(editing.id, payload) : await createEmployeeAccessCard(employeeId, payload);
      if (result.success) { toast.success(editing ? "Updated" : "Added"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.accessCards(employeeId) }); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) }); setDialogOpen(false); }
      else toast.error(result.error ?? "Failed to save");
    });
  };

  const handleArchive = async (id: number) => {
    const r = await archiveEmployeeAccessCard(id);
    if (r.success) { toast.success("Archived"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.accessCards(employeeId) }); }
    else toast.error(r.error);
  };

  const cardTypeOptions = (cardTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));
  const accessStatusOptions = [
    { value: "active", label: "Active" }, { value: "expired", label: "Expired" }, { value: "cancelled", label: "Cancelled" },
    { value: "suspended", label: "Suspended" }, { value: "pending", label: "Pending" }, { value: "in_application", label: "In Application" },
  ];

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

      <ERPChildDialogForm open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit Access Card" : "Add Access Card"} icon={<CreditCard className="h-5 w-5" />} mode={editing ? "edit" : "add"} size="lg" isSubmitting={isSubmitting} onSubmit={handleSubmit}>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6"><Label>Access Type <span className="text-destructive">*</span></Label><ERPCombobox value={form.access_type_id} onValueChange={(v) => setForm((p) => ({ ...p, access_type_id: Number(v) }))} options={cardTypeOptions} placeholder="Select type..." required /></div>
          <div className="col-span-6"><Label>Client / Authority</Label><Input value={form.client_authority} onChange={(e) => setForm((p) => ({ ...p, client_authority: e.target.value }))} placeholder="e.g. CICPA, ADNOC" /></div>
          <div className="col-span-6"><Label>Card Number</Label><Input value={form.card_number} onChange={(e) => setForm((p) => ({ ...p, card_number: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Application Reference</Label><Input value={form.application_reference} onChange={(e) => setForm((p) => ({ ...p, application_reference: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Issue Date</Label><Input type="date" value={form.issue_date} onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Expiry Date</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))} /></div>
          <div className="col-span-4"><Label>Status</Label><ERPCombobox value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: String(v) }))} options={accessStatusOptions} placeholder="Status..." /></div>
          <div className="col-span-4"><Label>Access Level</Label><Input value={form.access_level} onChange={(e) => setForm((p) => ({ ...p, access_level: e.target.value }))} placeholder="e.g. Level 1, Zone A" /></div>
          <div className="col-span-4"><Label>Renewal</Label><ERPCombobox value={form.renewal_status} onValueChange={(v) => setForm((p) => ({ ...p, renewal_status: String(v) }))} options={RENEWAL_STATUS_OPTIONS} placeholder="Renewal..." /></div>
          <div className="col-span-12"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}

// ── 5. TRAINING CERTIFICATES SECTION ─────────────────────────────────────────

function TrainingCertificatesSection({ employeeId, canManageDoc, onChildOpen }: { employeeId: number; canManageDoc: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeTrainingCertificateRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const setDialogOpen = useCallback((open: boolean) => { setDialogOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);

  const initialForm = () => ({
    training_category_id: null as number | null, training_type_id: null as number | null,
    provider: "", approval_body: "", certificate_number: "", issue_date: "", expiry_date: "",
    validity_months: null as number | null, required_for_designation: false, required_for_site: false,
    status: "valid" as string, verification_status: "unverified" as string, renewal_status: "not_required" as string, notes: "",
  });

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

  const openAdd = () => { setEditing(null); setForm(initialForm()); setDialogOpen(true); };
  const openEdit = (r: EmployeeTrainingCertificateRow) => {
    setEditing(r);
    setForm({ training_category_id: r.training_category_id, training_type_id: r.training_type_id, provider: r.provider ?? "", approval_body: r.approval_body ?? "", certificate_number: r.certificate_number ?? "", issue_date: r.issue_date ?? "", expiry_date: r.expiry_date ?? "", validity_months: r.validity_months, required_for_designation: r.required_for_designation, required_for_site: r.required_for_site, status: r.status, verification_status: r.verification_status, renewal_status: r.renewal_status, notes: r.notes ?? "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const payload = { ...form, training_type_id: form.training_type_id!, provider: form.provider || null, approval_body: form.approval_body || null, certificate_number: form.certificate_number || null, issue_date: form.issue_date || null, expiry_date: form.expiry_date || null, notes: form.notes || null };
      const result = editing ? await updateEmployeeTrainingCertificate(editing.id, payload) : await createEmployeeTrainingCertificate(employeeId, payload);
      if (result.success) { toast.success(editing ? "Updated" : "Added"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.trainingCertificates(employeeId) }); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) }); setDialogOpen(false); }
      else toast.error(result.error ?? "Failed to save");
    });
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

  const catOptions = (trainCategories ?? []).map((t) => ({ value: t.id, label: t.name_en }));
  const typeOptions = (trainTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));
  const trainStatusOptions = [{ value: "valid", label: "Valid" }, { value: "expired", label: "Expired" }, { value: "pending", label: "Pending" }, { value: "in_progress", label: "In Progress" }];

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

      <ERPChildDialogForm open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit Certificate" : "Add Certificate"} icon={<GraduationCap className="h-5 w-5" />} mode={editing ? "edit" : "add"} size="lg" isSubmitting={isSubmitting} onSubmit={handleSubmit}>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6"><Label>Training Category</Label><ERPCombobox value={form.training_category_id} onValueChange={(v) => setForm((p) => ({ ...p, training_category_id: Number(v) }))} options={catOptions} placeholder="Select category..." /></div>
          <div className="col-span-6"><Label>Training Type <span className="text-destructive">*</span></Label><ERPCombobox value={form.training_type_id} onValueChange={(v) => setForm((p) => ({ ...p, training_type_id: Number(v) }))} options={typeOptions} placeholder="Select type..." required /></div>
          <div className="col-span-6"><Label>Provider</Label><Input value={form.provider} onChange={(e) => setForm((p) => ({ ...p, provider: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Approval Body</Label><Input value={form.approval_body} onChange={(e) => setForm((p) => ({ ...p, approval_body: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Certificate Number</Label><Input value={form.certificate_number} onChange={(e) => setForm((p) => ({ ...p, certificate_number: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Validity Months</Label><Input type="number" min={0} value={form.validity_months ?? ""} onChange={(e) => setForm((p) => ({ ...p, validity_months: e.target.value ? parseInt(e.target.value) : null }))} /></div>
          <div className="col-span-6"><Label>Issue Date</Label><Input type="date" value={form.issue_date} onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Expiry Date</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))} /></div>
          <div className="col-span-4"><Label>Status</Label><ERPCombobox value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: String(v) }))} options={trainStatusOptions} placeholder="Status..." /></div>
          <div className="col-span-4"><Label>Verification</Label><ERPCombobox value={form.verification_status} onValueChange={(v) => setForm((p) => ({ ...p, verification_status: String(v) }))} options={VERIFICATION_OPTIONS} placeholder="Verification..." /></div>
          <div className="col-span-4"><Label>Renewal</Label><ERPCombobox value={form.renewal_status} onValueChange={(v) => setForm((p) => ({ ...p, renewal_status: String(v) }))} options={RENEWAL_STATUS_OPTIONS} placeholder="Renewal..." /></div>
          <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={form.required_for_designation} onCheckedChange={(v) => setForm((p) => ({ ...p, required_for_designation: v }))} /><Label>Required for Designation</Label></div>
          <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={form.required_for_site} onCheckedChange={(v) => setForm((p) => ({ ...p, required_for_site: v }))} /><Label>Required for Site</Label></div>
          <div className="col-span-12"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}

// ── 6. MEDICAL RECORDS SECTION (RESTRICTED) ───────────────────────────────────

function MedicalRecordsSection({ employeeId, canMedView, canMedManage, onChildOpen }: { employeeId: number; canMedView: boolean; canMedManage: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeMedicalRecordRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const setDialogOpen = useCallback((open: boolean) => { setDialogOpenRaw(open); onChildOpen?.(open); }, [onChildOpen]);

  const initialForm = () => ({
    medical_record_type_id: null as number | null, medical_center: "", report_number: "",
    examination_date: "", result: "under_review" as string, fit_for_work: false,
    work_restrictions: false, restriction_details: "", expiry_date: "",
    required_for_visa: false, required_for_site: false, required_for_offshore: false,
    confidentiality_level: "restricted" as string, notes: "",
  });

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

  const openAdd = () => { setEditing(null); setForm(initialForm()); setDialogOpen(true); };
  const openEdit = (r: EmployeeMedicalRecordRow) => {
    setEditing(r);
    setForm({ medical_record_type_id: r.medical_record_type_id, medical_center: r.medical_center ?? "", report_number: r.report_number ?? "", examination_date: r.examination_date, result: r.result, fit_for_work: r.fit_for_work, work_restrictions: r.work_restrictions, restriction_details: r.restriction_details ?? "", expiry_date: r.expiry_date ?? "", required_for_visa: r.required_for_visa, required_for_site: r.required_for_site, required_for_offshore: r.required_for_offshore, confidentiality_level: r.confidentiality_level, notes: r.notes ?? "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const payload = { ...form, medical_record_type_id: form.medical_record_type_id!, medical_center: form.medical_center || null, report_number: form.report_number || null, restriction_details: form.restriction_details || null, expiry_date: form.expiry_date || null, notes: form.notes || null };
      const result = editing ? await updateEmployeeMedicalRecord(editing.id, payload) : await createEmployeeMedicalRecord(employeeId, payload);
      if (result.success) { toast.success(editing ? "Updated" : "Added"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.medicalRecords(employeeId) }); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.summary(employeeId) }); setDialogOpen(false); }
      else toast.error(result.error ?? "Failed to save");
    });
  };

  const handleArchive = async (id: number) => {
    const r = await archiveEmployeeMedicalRecord(id);
    if (r.success) { toast.success("Archived"); qc.invalidateQueries({ queryKey: queryKeys.hr.compliance.medicalRecords(employeeId) }); }
    else toast.error(r.error);
  };

  const recTypeOptions = (recTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));
  const resultOptions = [{ value: "fit", label: "Fit" }, { value: "unfit", label: "Unfit" }, { value: "conditionally_fit", label: "Conditionally Fit" }, { value: "under_review", label: "Under Review" }];
  const confidentialityOptions = [{ value: "internal", label: "Internal" }, { value: "restricted", label: "Restricted" }, { value: "medical_only", label: "Medical Only" }];

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
        <ERPChildDialogForm open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit Medical Record" : "Add Medical Record"} icon={<Activity className="h-5 w-5" />} mode={editing ? "edit" : "add"} size="lg" isSubmitting={isSubmitting} onSubmit={handleSubmit}>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6"><Label>Medical Record Type <span className="text-destructive">*</span></Label><ERPCombobox value={form.medical_record_type_id} onValueChange={(v) => setForm((p) => ({ ...p, medical_record_type_id: Number(v) }))} options={recTypeOptions} placeholder="Select type..." required /></div>
            <div className="col-span-6"><Label>Medical Center</Label><Input value={form.medical_center} onChange={(e) => setForm((p) => ({ ...p, medical_center: e.target.value }))} /></div>
            <div className="col-span-6"><Label>Report Number</Label><Input value={form.report_number} onChange={(e) => setForm((p) => ({ ...p, report_number: e.target.value }))} /></div>
            <div className="col-span-6"><Label>Examination Date <span className="text-destructive">*</span></Label><Input type="date" value={form.examination_date} onChange={(e) => setForm((p) => ({ ...p, examination_date: e.target.value }))} /></div>
            <div className="col-span-6"><Label>Result <span className="text-destructive">*</span></Label><ERPCombobox value={form.result} onValueChange={(v) => setForm((p) => ({ ...p, result: String(v) }))} options={resultOptions} placeholder="Result..." required /></div>
            <div className="col-span-6"><Label>Expiry Date</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))} /></div>
            <div className="col-span-6"><Label>Confidentiality Level</Label><ERPCombobox value={form.confidentiality_level} onValueChange={(v) => setForm((p) => ({ ...p, confidentiality_level: String(v) }))} options={confidentialityOptions} placeholder="Level..." /></div>
            <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={form.fit_for_work} onCheckedChange={(v) => setForm((p) => ({ ...p, fit_for_work: v }))} /><Label>Fit for Work</Label></div>
            <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={form.work_restrictions} onCheckedChange={(v) => setForm((p) => ({ ...p, work_restrictions: v }))} /><Label>Work Restrictions</Label></div>
            {form.work_restrictions && <div className="col-span-12"><Label>Restriction Details</Label><Textarea value={form.restriction_details} onChange={(e) => setForm((p) => ({ ...p, restriction_details: e.target.value }))} rows={2} /></div>}
            <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={form.required_for_visa} onCheckedChange={(v) => setForm((p) => ({ ...p, required_for_visa: v }))} /><Label>Required for Visa</Label></div>
            <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={form.required_for_site} onCheckedChange={(v) => setForm((p) => ({ ...p, required_for_site: v }))} /><Label>Required for Site</Label></div>
            <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={form.required_for_offshore} onCheckedChange={(v) => setForm((p) => ({ ...p, required_for_offshore: v }))} /><Label>Required for Offshore</Label></div>
            <div className="col-span-12"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
          </div>
        </ERPChildDialogForm>
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
