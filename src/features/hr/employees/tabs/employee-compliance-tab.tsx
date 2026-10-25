"use client";
import {SubjectPhoto,SubjectPhotoReadOnly}from'../subject-photo';
import {useSubjectPhotoDraft} from '../use-subject-photo-draft';
import {PhotoRecoveryNotice} from '../photo-recovery-notice';
import{WorkforceReviewButton}from'../workforce-review';
import { useGuardedTransition as useTransition } from "@/hooks/use-guarded-transition";
import { RecordCollection } from "@/components/erp/table/record-collection";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import {useHrComplianceRecords} from "@/hooks/use-hr-compliance-records";
import {complianceReadIdentity, DEPENDENT_MEDICAL_FIELDS} from "@/lib/reads/hr-compliance-records-schema";
import {ComplianceReadPause, useComplianceReadAdmission, type ComplianceMutationAdmission} from "../compliance/compliance-read-admission";
import {useComplianceSave,ComplianceSaveRecovery} from '../compliance/use-compliance-save';
import {useDependentSaveSession} from '../compliance/use-dependent-save-session';

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

import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { CountrySelect } from "@/components/erp/geography/country-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ComplianceDmsAddDialog } from "@/features/hr/employees/compliance/compliance-dms-add-dialog";
import { ComplianceDmsPrefillBanner } from "@/features/hr/employees/compliance/compliance-dms-prefill-banner";
import {
  DependentDocumentLinksSection,
  EMPTY_DEP_LINK_CHANGES,
  type DependentDocLinkChanges,
} from "@/features/hr/employees/compliance/dependent-document-links-section";
import { IdentityDocumentAddDialog } from "@/features/hr/employees/compliance/identity-document-add-dialog";
import { IdentityDocumentFormFields } from "@/features/hr/employees/compliance/identity-document-form-fields";
import { HrDocumentToRecordWizard } from "@/features/hr/employees/document-to-record/hr-doc-to-record-wizard";
import {
  getComplianceStatusBadge,
  getExpiryStatus,
  getExpiryStatusBadge,
  getMedicalResultBadge,
  getVerificationStatusBadge
} from "@/lib/hr/compliance/expiry";
import {
  createEmptyIdentityDocumentForm,
  identityDocumentFormToPayload,
  type IdentityDocumentFormState,
} from "@/lib/hr/compliance/identity-document-form";
import {
  invalidateDmsEntityDocuments,
  invalidateHrEmployeeIdentityDocuments,
  invalidateHrEmployeeMedicalInsurances,
  invalidateHrEmployeeDependents,
  invalidateHrEmployeeAccessCards,
  invalidateHrEmployeeTrainingCertificates,
  invalidateHrEmployeeMedicalRecords,
} from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/query-keys";
import type { AuthContext } from "@/lib/rbac/check";
import {
  type EmployeeAccessCardRow,
  type EmployeeDependentRow,
  type EmployeeIdentityDocumentRow,
  type EmployeeMedicalInsuranceRow,
  type EmployeeMedicalRecordRow,
  type EmployeeTrainingCertificateRow,
} from "@/server/actions/hr/compliance";
import { checkHrDocumentToRecordEnabled } from "@/server/actions/hr/document-to-record";
import {
  type HrAccessCardTypeRow,
  type HrIdentityDocTypeRow,
  type HrMedicalRecordTypeRow,
  type HrSettingsRow,
  type HrTrainingTypeRow,
} from "@/server/actions/hr/settings";
import { listHrAccessCardTypes, listHrIdentityDocumentTypes, listHrMedicalRecordTypes, listHrRelationshipTypes, listHrTrainingCategories, listHrTrainingTypes } from "@/lib/reads/hr-record-choice-client";
import {useRecordReadActive} from "@/hooks/use-record-read-active";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity,
  Archive, CheckCircle,
  CreditCard,
  Edit2,
  FileStack,
  FileText,
  GraduationCap,
  Heart,
  Lock,
  Plus,
  Shield,
  Users
} from "lucide-react";
import { createContext, useContext, useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

// ── Prop Types ────────────────────────────────────────────────────────────────

type ComplianceTabProps = {
  employeeId: number;
  authContext: AuthContext;
  onChildOpen?: (open: boolean) => void;
  onChildLeaseChange?: (token: object, open: boolean) => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const ComplianceChildLeaseContext = createContext<ComplianceTabProps["onChildLeaseChange"]>(undefined);

function useComplianceChildLease(admission: ComplianceMutationAdmission, fallback?: (open: boolean) => void) {
  const sink = useContext(ComplianceChildLeaseContext);
  const {generation, isCurrent} = admission;
  useLayoutEffect(() => () => {
    // Retire only this section's lease; a replacement editor may already be open.
    if (sink) sink(generation, false); else fallback?.(false);
  }, [generation, sink, fallback]);
  return useCallback((open: boolean) => {
    if (!isCurrent()) return;
    if (sink) sink(generation, open); else fallback?.(open);
  }, [generation, isCurrent, sink, fallback]);
}

function useComplianceDialogOpen(admission: ComplianceMutationAdmission, notify: (open: boolean) => void, setOpen: Dispatch<SetStateAction<boolean>>) {
  const {isCurrent} = admission;
  return useCallback((open: boolean) => {
    if (!isCurrent()) return;
    setOpen(open); notify(open);
  }, [isCurrent, notify, setOpen]);
}

function canManage(ctx: AuthContext) {
  return ctx.permissionCodes?.includes("hr.compliance.manage") || ctx.permissionCodes?.includes("hr.admin") || ctx.roleCodes?.includes("system_admin") || ctx.roleCodes?.includes("group_admin");
}
function canView(ctx: AuthContext) {
  // These established F03 suffixes are request hints only. The counted reader
  // still verifies this exact employee and kind through the ordinary client.
  return ctx.isAccountActive && !ctx.profile?.must_change_password && (
    ["hr.compliance.view", "hr.compliance.view.self", "hr.compliance.view.team"].some(code => ctx.permissionCodes.includes(code)) || canManage(ctx));
}
function canMedicalView(ctx: AuthContext) {
  return ctx.isAccountActive && !ctx.profile?.must_change_password && (["hr.medical.view", "hr.medical.view.self", "hr.medical.view.team"].some(code => ctx.permissionCodes.includes(code)) ||
    !!ctx.roleAssignments?.some(a => a.ownerCompanyId === null && a.branchId === null && ["system_admin", "group_admin"].includes(a.roleCode)));
}
function canMedicalManage(ctx: AuthContext) {
  return ctx.isAccountActive && !ctx.profile?.must_change_password && (ctx.permissionCodes.includes("hr.medical.manage") ||
    !!ctx.roleAssignments?.some(a => a.ownerCompanyId === null && a.branchId === null && ["system_admin", "group_admin"].includes(a.roleCode)));
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
}

function SectionHeader({ icon: Icon, title, count, onAdd, canAdd, onAddFromDocs, canAddFromDocs }: { icon: React.ElementType; title: string; count?: number; onAdd?: () => void; canAdd?: boolean; onAddFromDocs?: () => void; canAddFromDocs?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{title}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="text-xs">{count}</Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {canAddFromDocs && onAddFromDocs && (
          <Button size="sm" variant="outline" onClick={onAddFromDocs} type="button" className="text-xs">
            <FileStack className="h-3.5 w-3.5 mr-1" /> From Documents
          </Button>
        )}
        {canAdd && onAdd && (
          <Button size="sm" variant="outline" onClick={onAdd} type="button">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        )}
      </div>
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

function IdentityDocumentsSection({ authContext, onSubjectDenied, employeeId, canManageDoc, onChildOpen, documentWizardEnabled }: { authContext: AuthContext; onSubjectDenied: () => void; employeeId: number; canManageDoc: boolean; onChildOpen?: (open: boolean) => void; documentWizardEnabled?: boolean }) {
  const qc = useQueryClient();
  const sectionActive = useRecordReadActive();
  const recordRead = useHrComplianceRecords("identity", employeeId, authContext, onSubjectDenied);
  const [addDialogOpen, setAddDialogOpenRaw] = useState(false);
  const [editDialogOpen, setEditDialogOpenRaw] = useState(false);
  const [dmsWizardOpen, setDmsWizardOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeIdentityDocumentRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();




  const [form, setForm] = useState<IdentityDocumentFormState>(() => createEmptyIdentityDocumentForm());

  const uiRead1 = recordRead.query;
  const docs = recordRead.rows;
  const isLoading = recordRead.busy;


  const uiRead2 = useQuery({
    queryKey: [...queryKeys.hr.identityDocumentTypes(), recordRead.identity, form.document_type_id],
    enabled: sectionActive && canManageDoc && recordRead.access.canManage,
    queryFn: async ({signal}) => {
      const r = await listHrIdentityDocumentTypes({ selectedId: form.document_type_id || null, signal });
      if (!r.success) throw new Error("Records or choices could not be loaded."); return r.success && r.data ? r.data.data as HrIdentityDocTypeRow[] : [];
    },
  });
  const { data: docTypes } = uiRead2;

  const admission = useComplianceReadAdmission(canManageDoc && recordRead.access.canManage, [...recordRead.reads, uiRead2], JSON.stringify([recordRead.owner, recordRead.denied, recordRead.restricted]));
  const complianceSave=useComplianceSave(authContext,employeeId,'identity-document',admission,recordRead.denied||recordRead.restricted);
  const notifyChildOpen = useComplianceChildLease(admission, onChildOpen);
  const setAddDialogOpen = useComplianceDialogOpen(admission, notifyChildOpen, setAddDialogOpenRaw);
  const setEditDialogOpen = useComplianceDialogOpen(admission, notifyChildOpen, setEditDialogOpenRaw);
  const setDmsWizardOpen = useComplianceDialogOpen(admission, notifyChildOpen, setDmsWizardOpenRaw);
  const [editorGeneration, setEditorGeneration] = useState(admission.generation);
  const generationChanged = editorGeneration !== admission.generation;
  const retireEditor = recordRead.denied || recordRead.restricted || recordRead.detailUnavailable;
  const [editorRetired, setEditorRetired] = useState(false);
  if (generationChanged || retireEditor && !editorRetired) {
    setEditorGeneration(admission.generation);
    setEditorRetired(retireEditor);
    setEditing(null); setForm(createEmptyIdentityDocumentForm()); setEditDialogOpenRaw(false);
    if (generationChanged || recordRead.restricted || recordRead.denied) setAddDialogOpenRaw(false);
    if (generationChanged || recordRead.restricted || recordRead.denied) setDmsWizardOpenRaw(false);
  }
  if (!retireEditor && editorRetired) setEditorRetired(false);
  const closeRetiredDetail = recordRead.closeDetail;
  useLayoutEffect(() => {
    if (retireEditor) {notifyChildOpen(false); closeRetiredDetail();}
  }, [retireEditor, closeRetiredDetail, notifyChildOpen]);

  const openAdd = () => {
    if (!admission.canDispatch() || complianceSave.pending || complianceSave.retired) return;
    setAddDialogOpen(true);
  };

  const openEdit = async (selected: {id: number}) => {
    if (!admission.canDispatch() || !!complianceSave.pending || !!complianceSave.retired) return;
    const doc = await recordRead.loadDetail(selected.id);
    if (!doc || !admission.isCurrent()) return;
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
    if (!editing || !admission.canDispatch() || !recordRead.isDetailCurrent(editing.id)) return;
    startTransition(async () => {
      if (!admission.canDispatch() || !recordRead.isDetailCurrent(editing.id)) return;
      const {issuing_authority:legacyAuthority,place_of_issue:legacyPlace,...payload} = identityDocumentFormToPayload(form);
      void legacyAuthority;void legacyPlace; // Not rendered: preserve the original native facts.
      const result = await complianceSave.send(editing.id,'update',payload,String(editing.workspace_revision));
      if (result.success) handleAddSaved({hasDmsDocument: !!payload.dms_document_id});
      if (!admission.isCurrent() || !recordRead.isDetailCurrent(editing.id)) return;
      if (result.success) {
        toast.success("Document updated");
        recordRead.closeDetail(); setEditDialogOpen(false);
      } else {
        toast.error(result.error ?? "Failed to save document");
      }
    });
  };

  const handleAddSaved = (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => {
    notifyComplianceWrite(qc, employeeId, invalidateHrEmployeeIdentityDocuments, opts);
  };

  const handleArchive = async (id: number) => {
    if (!admission.canDispatch()) return;
    const result = await complianceSave.act(id,'archive');
    if (result.success) handleAddSaved();
    if (!admission.isCurrent()) return;
    if (result.success) {
      toast.success("Document archived");
    } else toast.error(result.error ?? "Failed to archive");
  };

  const handleVerify = async (id: number) => {
    if (!admission.canDispatch()) return;
    const result = await complianceSave.act(id,'verify');
    if (result.success) handleAddSaved();
    if (!admission.isCurrent()) return;
    if (result.success) {
      toast.success("Document verified");
    } else toast.error(result.error ?? "Failed to verify");
  };

  const docTypeOptions = (docTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));

  if (recordRead.restricted || recordRead.denied) return <div role="alert" className="mb-8 rounded border p-4">This compliance collection is not available with your current access.</div>;

  return (
    <><ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/><QueryReadBoundary queries={[...recordRead.reads,uiRead2]}><div className="mb-8">
      <SectionHeader icon={FileText} title="Legal Documents" count={recordRead.serverRead.totalCount ?? undefined} onAdd={openAdd} canAdd={admission.ready} onAddFromDocs={() => { if (admission.canDispatch()) setDmsWizardOpen(true); }} canAddFromDocs={admission.ready && documentWizardEnabled} />

      {isLoading && <Skeleton className="h-20 w-full" />}
      {uiRead1.isSuccess && recordRead.serverRead.totalCount === 0 && !recordRead.invalid && <EmptyState message="No identity documents added yet." />}
      {!recordRead.denied && !recordRead.restricted && (
        <div className="space-y-2">
          <RecordCollection presentation="embedded" serverRead={recordRead.serverRead} isLoading={isLoading} message={recordRead.validationMessage ?? recordRead.detailError} userProfileId={authContext.profile?.id?.toString()} id="hr.employee-compliance-tab.IdentityDocumentsSection.docs" rows={docs} fields={[{"id":"document_number","path":"document_number","label":"Document Number"},{"id":"expiry_date","path":"expiry_date","label":"Expiry Date"}]} renderRecord={(doc) => (
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
              {canManageDoc && recordRead.access.canManage && (
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <WorkforceReviewButton employeeId={employeeId}kind="identity-document"sourceId={doc.id}authContext={authContext}canDispatch={admission.canDispatch}onChildOpen={onChildOpen}onDenied={onSubjectDenied}/>
                  {doc.verification_status === "unverified" && (
                    <Button aria-label="Verify" size="sm" variant="ghost" onClick={() => handleVerify(doc.id)} type="button" title="Verify">
                      <CheckCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button aria-label="Edit" size="sm" variant="ghost" onClick={() => openEdit(doc)} type="button" title="Edit">
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button aria-label="Archive" size="sm" variant="ghost" onClick={() => handleArchive(doc.id)} type="button" title="Archive">
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )} />
        </div>
      )}

      <IdentityDocumentAddDialog
        save={(payload)=>complianceSave.send(null,'create',payload,null)}
        closeDisabled={complianceSave.busy||!!complianceSave.pending}
        recovery={<ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/>}
        admission={admission}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        employeeId={employeeId}
        docTypes={docTypes ?? []}
        onSaved={handleAddSaved}
      />

      <ERPChildDialogForm
        open={editDialogOpen}
        onOpenChange={(open) => { if (!admission.isCurrent()) return; if (!open) recordRead.closeDetail(); setEditDialogOpen(open); }}
        title="Edit Identity Document"
        subtitle="Legal and identity documents for this employee"
        icon={<FileText className="h-5 w-5" />}
        mode="edit"
        recoveryActions={<ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/>}
        size="xl"
        isSubmitting={isSubmitting||complianceSave.busy}
        closeDisabled={complianceSave.busy||!!complianceSave.pending}
        submitDisabled={!admission.ready||complianceSave.blocked} onSubmit={handleEditSubmit}
      >
        <ComplianceReadPause admission={admission} />
        <IdentityDocumentFormFields
          form={form}
          setForm={setForm}
          docTypeOptions={docTypeOptions}
        />
      </ERPChildDialogForm>

      {(admission.ready || dmsWizardOpen) && <HrDocumentToRecordWizard
        authContext={authContext}
        employeeId={employeeId}
        targetType="identity_document"
        saveCompliance={(values)=>complianceSave.send(null,'create',{...values,entry_source:'document'},null)}
        compliancePending={complianceSave.busy||!!complianceSave.pending}
        complianceRecovery={<ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/>}
        admission={admission}
        open={dmsWizardOpen}
        onOpenChange={setDmsWizardOpen}
        onSaved={() => handleAddSaved()}
        onChildOpen={onChildOpen}
      />}
    </div></QueryReadBoundary></>
  );
}

function notifyComplianceWrite(
  qc: ReturnType<typeof useQueryClient>,
  employeeId: number,
  notifyKind: (client: ReturnType<typeof useQueryClient>, employeeId: number) => void,
  opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }
) {
  notifyKind(qc, employeeId);
  if (opts?.hasDmsDocument) {
    invalidateDmsEntityDocuments(qc, "employee", employeeId);
  }
}

// ── 2. MEDICAL INSURANCE SECTION ──────────────────────────────────────────────

function MedicalInsurancesSection({ authContext, onSubjectDenied, employeeId, canManageDoc, onChildOpen, documentWizardEnabled }: { authContext: AuthContext; onSubjectDenied: () => void; employeeId: number; canManageDoc: boolean; onChildOpen?: (open: boolean) => void; documentWizardEnabled?: boolean }) {
  const qc = useQueryClient();
  const recordRead = useHrComplianceRecords("insurance", employeeId, authContext, onSubjectDenied);
  const [addDialogOpen, setAddDialogOpenRaw] = useState(false);
  const [editDialogOpen, setEditDialogOpenRaw] = useState(false);
  const [dmsWizardOpen, setDmsWizardOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeMedicalInsuranceRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();




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

  const uiRead1 = recordRead.query;
  const records = recordRead.rows;
  const isLoading = recordRead.busy;



  const admission = useComplianceReadAdmission(canManageDoc && recordRead.access.canManage, [...recordRead.reads], JSON.stringify([recordRead.owner, recordRead.denied, recordRead.restricted]));
  const complianceSave=useComplianceSave(authContext,employeeId,'medical-insurance',admission,recordRead.denied||recordRead.restricted);
  const notifyChildOpen = useComplianceChildLease(admission, onChildOpen);
  const setAddDialogOpen = useComplianceDialogOpen(admission, notifyChildOpen, setAddDialogOpenRaw);
  const setEditDialogOpen = useComplianceDialogOpen(admission, notifyChildOpen, setEditDialogOpenRaw);
  const setDmsWizardOpen = useComplianceDialogOpen(admission, notifyChildOpen, setDmsWizardOpenRaw);
  const [editorGeneration, setEditorGeneration] = useState(admission.generation);
  const generationChanged = editorGeneration !== admission.generation;
  const retireEditor = recordRead.denied || recordRead.restricted || recordRead.detailUnavailable;
  const [editorRetired, setEditorRetired] = useState(false);
  if (generationChanged || retireEditor && !editorRetired) {
    setEditorGeneration(admission.generation);
    setEditorRetired(retireEditor);
    setEditing(null); setForm(initialForm()); setEditDialogOpenRaw(false);
    if (generationChanged || recordRead.restricted || recordRead.denied) setAddDialogOpenRaw(false);
    if (generationChanged || recordRead.restricted || recordRead.denied) setDmsWizardOpenRaw(false);
  }
  if (!retireEditor && editorRetired) setEditorRetired(false);
  const closeRetiredDetail = recordRead.closeDetail;
  useLayoutEffect(() => {
    if (retireEditor) {notifyChildOpen(false); closeRetiredDetail();}
  }, [retireEditor, closeRetiredDetail, notifyChildOpen]);
  const openAdd = () => {
    if (admission.canDispatch() && !complianceSave.pending && !complianceSave.retired) setAddDialogOpen(true); };
  const openEdit = async (selected: {id: number}) => {
    if (!admission.canDispatch() || !!complianceSave.pending || !!complianceSave.retired) return;
    const r = await recordRead.loadDetail(selected.id);
    if (!r || !admission.isCurrent()) return;
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
    if (!editing || !admission.canDispatch() || !recordRead.isDetailCurrent(editing.id)) return;
    const err = validateMedicalInsurance(form);
    if (err) { toast.error(err); return; }
    startTransition(async () => {
      if (!admission.canDispatch() || !recordRead.isDetailCurrent(editing.id)) return;
      const payload = buildPayload(form);
      const result = await complianceSave.send(editing.id,'update',payload,String(editing.workspace_revision));
      if (result.success) handleAddSaved({hasDmsDocument: !!payload.dms_document_id});
      if (!admission.isCurrent() || !recordRead.isDetailCurrent(editing.id)) return;
      if (result.success) {
        toast.success("Insurance updated");
        recordRead.closeDetail(); setEditDialogOpen(false);
      } else toast.error(result.error ?? "Failed to save");
    });
  };

  const handleAddSaved = (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => {
    notifyComplianceWrite(qc, employeeId, invalidateHrEmployeeMedicalInsurances, opts);
  };

  const handleArchive = async (id: number) => {
    if (!admission.canDispatch()) return;
    const result = await complianceSave.act(id,'archive');
    if (result.success) handleAddSaved();
    if (!admission.isCurrent()) return;
    if (result.success) { toast.success("Insurance archived"); }
    else toast.error(result.error ?? "Failed to archive");
  };

  const handleVerify = async (id: number) => {
    if (!admission.canDispatch()) return;
    const result = await complianceSave.act(id,'verify');
    if (result.success) handleAddSaved();
    if (!admission.isCurrent()) return;
    if (result.success) { toast.success("Verified"); }
    else toast.error(result.error ?? "Failed to verify");
  };

  if (recordRead.restricted || recordRead.denied) return <div role="alert" className="mb-8 rounded border p-4">This compliance collection is not available with your current access.</div>;

  return (
    <><ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/><QueryReadBoundary queries={[...recordRead.reads]}><div className="mb-8">
      <SectionHeader icon={Heart} title="Medical Insurance" count={recordRead.serverRead.totalCount ?? undefined} onAdd={openAdd} canAdd={admission.ready} onAddFromDocs={() => { if (admission.canDispatch()) setDmsWizardOpen(true); }} canAddFromDocs={admission.ready && documentWizardEnabled} />
      {isLoading && <Skeleton className="h-16 w-full" />}
      {uiRead1.isSuccess && recordRead.serverRead.totalCount === 0 && !recordRead.invalid && <EmptyState message="No medical insurance records added yet." />}
      {!recordRead.denied && !recordRead.restricted && (
        <div className="space-y-2">
          <RecordCollection presentation="embedded" serverRead={recordRead.serverRead} isLoading={isLoading} message={recordRead.validationMessage ?? recordRead.detailError} userProfileId={authContext.profile?.id?.toString()} id="hr.employee-compliance-tab.MedicalInsurancesSection.records" rows={records} fields={[{"id":"policy_number","path":"policy_number","label":"Policy Number"},{"id":"expiry_date","path":"expiry_date","label":"Expiry Date"}]} renderRecord={(r) => (
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
              {canManageDoc && recordRead.access.canManage && (
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <WorkforceReviewButton employeeId={employeeId}kind="medical-insurance"sourceId={r.id}authContext={authContext}canDispatch={admission.canDispatch}onChildOpen={onChildOpen}onDenied={onSubjectDenied}/>
                  {r.verification_status === "unverified" && <Button aria-label="Verify" size="sm" variant="ghost" type="button" onClick={() => handleVerify(r.id)} title="Verify"><CheckCircle className="h-3.5 w-3.5" /></Button>}
                  <Button aria-label="Edit record" size="sm" variant="ghost" type="button" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button aria-label="Archive record" size="sm" variant="ghost" type="button" onClick={() => handleArchive(r.id)}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      )}

      <ComplianceDmsAddDialog
        closeDisabled={complianceSave.busy||!!complianceSave.pending}
        recovery={<ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/>}
        admission={admission}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        employeeId={employeeId}
        recordKind="medical_insurance"
        icon={<Heart className="h-5 w-5" />}
        recordLabel="Medical Insurance"
        submitLabel="Save Medical Insurance"
        createEmptyForm={initialForm}
        validate={validateMedicalInsurance}
        save={async (f) => admission.canDispatch() ? complianceSave.send(null,'create',buildPayload(f),null) : {success: false, error: "Required record checks are not ready"}}
        onSaved={handleAddSaved}
        renderReview={({ form: addForm, setForm: setAddForm, prefillMeta }) => (
          <div className="grid grid-cols-12 gap-4">
            <ComplianceDmsPrefillBanner prefillMeta={prefillMeta} />
            <div className="col-span-6"><Label>Insurance Provider <span className="text-destructive">*</span></Label><Input aria-label="Insurance Provider" required value={addForm.insurance_provider} onChange={(e) => setAddForm((p) => ({ ...p, insurance_provider: e.target.value }))} /></div>
            <div className="col-span-6"><Label>TPA</Label><Input aria-label="TPA" value={addForm.tpa} onChange={(e) => setAddForm((p) => ({ ...p, tpa: e.target.value }))} placeholder="Third-party administrator" /></div>
            <div className="col-span-6"><Label>Policy Number <span className="text-destructive">*</span></Label><Input aria-label="Policy Number" required value={addForm.policy_number} onChange={(e) => setAddForm((p) => ({ ...p, policy_number: e.target.value }))} /></div>
            <div className="col-span-6"><Label>Insurance Card Number</Label><Input aria-label="Insurance Card Number" value={addForm.insurance_card_number} onChange={(e) => setAddForm((p) => ({ ...p, insurance_card_number: e.target.value }))} /></div>
            <div className="col-span-6"><Label>Network Class</Label><Input aria-label="Network Class" value={addForm.network_class} onChange={(e) => setAddForm((p) => ({ ...p, network_class: e.target.value }))} placeholder="e.g. Silver, Gold, Platinum" /></div>
            <div className="col-span-3"><Label>Issue Date</Label><Input aria-label="Issue Date" type="date" value={addForm.issue_date} onChange={(e) => setAddForm((p) => ({ ...p, issue_date: e.target.value }))} /></div>
            <div className="col-span-3"><Label>Expiry Date <span className="text-destructive">*</span></Label><Input aria-label="Expiry Date" required type="date" value={addForm.expiry_date} onChange={(e) => setAddForm((p) => ({ ...p, expiry_date: e.target.value }))} /></div>
            <div className="col-span-4"><Label>Status</Label><ERPCombobox ariaLabel="Status" value={addForm.status} onValueChange={(v) => setAddForm((p) => ({ ...p, status: String(v) }))} options={DOC_STATUS_OPTIONS} placeholder="Status..." /></div>
            <div className="col-span-4"><Label>Verification</Label><ERPCombobox ariaLabel="Verification" value={addForm.verification_status} onValueChange={(v) => setAddForm((p) => ({ ...p, verification_status: String(v) }))} options={VERIFICATION_OPTIONS} placeholder="Verification..." /></div>
            <div className="col-span-4"><Label>Renewal</Label><ERPCombobox ariaLabel="Renewal" value={addForm.renewal_status} onValueChange={(v) => setAddForm((p) => ({ ...p, renewal_status: String(v) }))} options={RENEWAL_STATUS_OPTIONS} placeholder="Renewal..." /></div>
            <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={addForm.employee_covered} onCheckedChange={(v) => setAddForm((p) => ({ ...p, employee_covered: v }))} /><Label>Employee Covered</Label></div>
            <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={addForm.dependent_coverage_included} onCheckedChange={(v) => setAddForm((p) => ({ ...p, dependent_coverage_included: v }))} /><Label>Dependent Coverage</Label></div>
            <div className="col-span-4"><Label>Dependents Covered</Label><Input aria-label="Dependents Covered" type="number" min={0} value={addForm.dependent_count_covered ?? ""} onChange={(e) => setAddForm((p) => ({ ...p, dependent_count_covered: e.target.value ? parseInt(e.target.value) : null }))} /></div>
            <div className="col-span-12"><Label>Notes</Label><Textarea aria-label="Notes" value={addForm.notes} onChange={(e) => setAddForm((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
          </div>
        )}
      />

      <ERPChildDialogForm open={editDialogOpen} onOpenChange={(open) => { if (!admission.isCurrent()) return; if (!open) recordRead.closeDetail(); setEditDialogOpen(open); }} title="Edit Medical Insurance" icon={<Heart className="h-5 w-5" />} mode="edit" size="lg" isSubmitting={isSubmitting||complianceSave.busy}
        closeDisabled={complianceSave.busy||!!complianceSave.pending} submitDisabled={!admission.ready||complianceSave.blocked} onSubmit={handleEditSubmit}>
        <ComplianceReadPause admission={admission} />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6"><Label>Insurance Provider <span className="text-destructive">*</span></Label><Input aria-label="Insurance Provider" required value={form.insurance_provider} onChange={(e) => setForm((p) => ({ ...p, insurance_provider: e.target.value }))} /></div>
          <div className="col-span-6"><Label>TPA</Label><Input aria-label="TPA" value={form.tpa} onChange={(e) => setForm((p) => ({ ...p, tpa: e.target.value }))} placeholder="Third-party administrator" /></div>
          <div className="col-span-6"><Label>Policy Number <span className="text-destructive">*</span></Label><Input aria-label="Policy Number" required value={form.policy_number} onChange={(e) => setForm((p) => ({ ...p, policy_number: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Insurance Card Number</Label><Input aria-label="Insurance Card Number" value={form.insurance_card_number} onChange={(e) => setForm((p) => ({ ...p, insurance_card_number: e.target.value }))} /></div>
          <div className="col-span-6"><Label>Network Class</Label><Input aria-label="Network Class" value={form.network_class} onChange={(e) => setForm((p) => ({ ...p, network_class: e.target.value }))} placeholder="e.g. Silver, Gold, Platinum" /></div>
          <div className="col-span-3"><Label>Issue Date</Label><Input aria-label="Issue Date" type="date" value={form.issue_date} onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))} /></div>
          <div className="col-span-3"><Label>Expiry Date <span className="text-destructive">*</span></Label><Input aria-label="Expiry Date" required type="date" value={form.expiry_date} onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))} /></div>
          <div className="col-span-4"><Label>Status</Label><ERPCombobox ariaLabel="Status" value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: String(v) }))} options={DOC_STATUS_OPTIONS} placeholder="Status..." /></div>
          <div className="col-span-4"><Label>Verification</Label><ERPCombobox ariaLabel="Verification" value={form.verification_status} onValueChange={(v) => setForm((p) => ({ ...p, verification_status: String(v) }))} options={VERIFICATION_OPTIONS} placeholder="Verification..." /></div>
          <div className="col-span-4"><Label>Renewal</Label><ERPCombobox ariaLabel="Renewal" value={form.renewal_status} onValueChange={(v) => setForm((p) => ({ ...p, renewal_status: String(v) }))} options={RENEWAL_STATUS_OPTIONS} placeholder="Renewal..." /></div>
          <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={form.employee_covered} onCheckedChange={(v) => setForm((p) => ({ ...p, employee_covered: v }))} /><Label>Employee Covered</Label></div>
          <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={form.dependent_coverage_included} onCheckedChange={(v) => setForm((p) => ({ ...p, dependent_coverage_included: v }))} /><Label>Dependent Coverage</Label></div>
          <div className="col-span-4"><Label>Dependents Covered</Label><Input aria-label="Dependents Covered" type="number" min={0} value={form.dependent_count_covered ?? ""} onChange={(e) => setForm((p) => ({ ...p, dependent_count_covered: e.target.value ? parseInt(e.target.value) : null }))} /></div>
          <div className="col-span-12"><Label>Notes</Label><Textarea aria-label="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
        </div>
      </ERPChildDialogForm>

      {(admission.ready || dmsWizardOpen) && <HrDocumentToRecordWizard
        authContext={authContext}
        employeeId={employeeId}
        targetType="medical_insurance"
        saveCompliance={(values)=>complianceSave.send(null,'create',{...values,entry_source:'document'},null)}
        compliancePending={complianceSave.busy||!!complianceSave.pending}
        complianceRecovery={<ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/>}
        admission={admission}
        open={dmsWizardOpen}
        onOpenChange={setDmsWizardOpen}
        onSaved={() => handleAddSaved()}
        onChildOpen={onChildOpen}
      />}
    </div></QueryReadBoundary></>
  );
}

// ── 3. DEPENDENTS SECTION ─────────────────────────────────────────────────────

function DependentsSection({ authContext, onSubjectDenied, employeeId, canManageDoc, canManageMedical, onChildOpen, documentWizardEnabled }: { authContext: AuthContext; onSubjectDenied: () => void; employeeId: number; canManageDoc: boolean; canManageMedical: boolean; onChildOpen?: (open: boolean) => void; documentWizardEnabled?: boolean }) {
  const qc = useQueryClient();
  const sectionActive = useRecordReadActive();
  const recordRead = useHrComplianceRecords("dependents", employeeId, authContext, onSubjectDenied);
  const [addDialogOpen, setAddDialogOpenRaw] = useState(false);
  const [dmsWizardOpen, setDmsWizardOpenRaw] = useState(false);
  const [editDialogOpen, setEditDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeDependentRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();


  const initialForm = () => ({
    dms_document_id: null as number | null,
    dependent_name_en: "", dependent_name_ar: "", relationship_type_id: null as number | null,
    photo_dms_document_id:null as number|null,photo_framing:'',photo_pending:'',
    date_of_birth: "", nationality_id: null as number | null,
    passport_number: "", passport_expiry: "", emirates_id_number: "", emirates_id_expiry: "",
    residence_visa_number: "", residence_visa_expiry: "", medical_insurance_provider: "",
    medical_insurance_policy: "", medical_insurance_card: "", medical_insurance_expiry: "",
    sponsored_by: "" as string, is_active: true, notes: "",
  });

  type DependentForm = ReturnType<typeof initialForm>;

  const [form, setForm] = useState(initialForm);

  const uiRead1 = recordRead.query;
  const records = recordRead.rows;
  const isLoading = recordRead.busy;


  const uiRead2 = useQuery({
    queryKey: [...queryKeys.hr.relationshipTypes(), recordRead.identity, form.relationship_type_id],
    enabled: sectionActive && canManageDoc && recordRead.access.canManage,
    queryFn: async ({signal}) => {
      const r = await listHrRelationshipTypes({ selectedId: form.relationship_type_id || null, signal });
      if (!r.success) throw new Error("Records or choices could not be loaded."); return r.success && r.data ? r.data.data as HrSettingsRow[] : [];
    },
  });
  const { data: relTypes } = uiRead2;

  const admission = useComplianceReadAdmission(canManageDoc && recordRead.access.canManage, [...recordRead.reads, uiRead2], JSON.stringify([recordRead.owner, recordRead.denied, recordRead.restricted]));
  const photoDraft=useSubjectPhotoDraft(recordRead.identity,'dependent:'+employeeId+':'+(editing?.id??'new'));
  const dependentSession=useDependentSaveSession(employeeId,authContext.profile?.id,JSON.stringify([recordRead.identity,recordRead.medicalViewRetired,recordRead.denied,recordRead.restricted]),admission.generation,'editor');
  const [archiveCandidate,setArchiveCandidate]=useState<{id:number;revision:string;name:string}|null>(null);
  const [archiveDialogOpen,setArchiveDialogOpenRaw]=useState(false);
  const notifyChildOpen = useComplianceChildLease(admission, onChildOpen);
  const setArchiveDialogOpen=useComplianceDialogOpen(admission,notifyChildOpen,setArchiveDialogOpenRaw);
  const setAddDialogOpen = useComplianceDialogOpen(admission, notifyChildOpen, setAddDialogOpenRaw);
  const setEditDialogOpen = useComplianceDialogOpen(admission, notifyChildOpen, setEditDialogOpenRaw);
  const setDmsWizardOpen = useComplianceDialogOpen(admission, notifyChildOpen, setDmsWizardOpenRaw);
  const [editorGeneration, setEditorGeneration] = useState(admission.generation);
  const generationChanged = editorGeneration !== admission.generation;
  const retireEditor = recordRead.denied || recordRead.restricted || recordRead.detailUnavailable;
  const [editorRetired, setEditorRetired] = useState(false);
  if (generationChanged || retireEditor && !editorRetired) {
    setEditorGeneration(admission.generation);
    setEditorRetired(retireEditor);
    setEditing(null); setForm(initialForm()); setEditDialogOpenRaw(false);
    setArchiveCandidate(null);setArchiveDialogOpenRaw(false);
    if (generationChanged || recordRead.restricted || recordRead.denied) setAddDialogOpenRaw(false);
    if (generationChanged || recordRead.restricted || recordRead.denied) setDmsWizardOpenRaw(false);
  }
  if (!retireEditor && editorRetired) setEditorRetired(false);
  const closeRetiredDetail = recordRead.closeDetail;
  useLayoutEffect(() => {
    if (retireEditor) {notifyChildOpen(false); closeRetiredDetail();}
  }, [retireEditor, closeRetiredDetail, notifyChildOpen]);

  const relTypeOptions = (relTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));
  const medicalAccess = useRef({view: false, manage: false, retired: false});
  const currentDependentForm = useRef(form);
  useLayoutEffect(() => {currentDependentForm.current = form;});
  const medicalView = recordRead.access.medicalView;
  const medicalManage = canManageMedical && recordRead.access.medicalManage;
  useLayoutEffect(() => {medicalAccess.current = {view: medicalView, manage: medicalManage, retired: recordRead.medicalViewRetired};});
  const redactMedicalForm = useCallback((value: DependentForm): DependentForm => recordRead.medicalViewRetired
    ? {...value, medical_insurance_provider: "", medical_insurance_policy: "", medical_insurance_card: "", medical_insurance_expiry: ""} : value, [recordRead.medicalViewRetired]);
  const [medicalRetired, setMedicalRetired] = useState(false);
  if (recordRead.medicalViewRetired && !medicalRetired) {
    setMedicalRetired(true); setForm(previous => redactMedicalForm(previous));
    setEditing(previous => previous ? {...previous, medical_insurance_provider: null, medical_insurance_policy: null, medical_insurance_card: null, medical_insurance_expiry: null} : previous);
  }
  if (!recordRead.medicalViewRetired && medicalRetired) setMedicalRetired(false);

  const buildPayload = (f: DependentForm) => {
    const payload = ({
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
    if (!medicalAccess.current.view || !medicalAccess.current.manage || medicalAccess.current.retired) for (const key of DEPENDENT_MEDICAL_FIELDS) delete (payload as Partial<typeof payload>)[key];
    return payload;
  };

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
      <div className="col-span-12"><SubjectPhoto draft={photoDraft} framing={f.photo_framing} onFraming={(frame,pending)=>setF(previous=>({...previous,photo_framing:frame,...(pending===undefined?{}:{photo_pending:pending?'file':''})}))} subject="dependent"employee={editing?.id?employeeId:null}dependent={editing?.id??null}identity={recordRead.identity}value={f.photo_dms_document_id}disabled={dependentSession.saving||!!dependentSession.pending}onValue={value=>setF(previous=>({...previous,photo_dms_document_id:value}))}/></div>
      <div className="col-span-6"><Label>Name (English) <span className="text-destructive">*</span></Label><Input aria-label="Name (English)" required value={f.dependent_name_en} onChange={(e) => setF((p) => ({ ...p, dependent_name_en: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Name (Arabic)</Label><Input aria-label="Name (Arabic)" value={f.dependent_name_ar} onChange={(e) => setF((p) => ({ ...p, dependent_name_ar: e.target.value }))} dir="rtl" /></div>
      <div className="col-span-6"><Label>Relationship <span className="text-destructive">*</span></Label><ERPCombobox ariaLabel="Relationship" value={f.relationship_type_id} onValueChange={(v) => setF((p) => ({ ...p, relationship_type_id: Number(v) }))} options={relTypeOptions} placeholder="Select relationship..." required /></div>
      <div className="col-span-3"><Label>Date of Birth</Label><Input aria-label="Date of Birth" type="date" value={f.date_of_birth} onChange={(e) => setF((p) => ({ ...p, date_of_birth: e.target.value }))} /></div>
      <div className="col-span-3"><Label>Nationality</Label><CountrySelect value={f.nationality_id} onValueChange={(v) => setF((p) => ({ ...p, nationality_id: v }))} /></div>
      <div className="col-span-12 border-t pt-3"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Document Details</p></div>
      <div className="col-span-6"><Label>Passport Number</Label><Input aria-label="Passport Number" value={f.passport_number} onChange={(e) => setF((p) => ({ ...p, passport_number: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Passport Expiry</Label><Input aria-label="Passport Expiry" type="date" value={f.passport_expiry} onChange={(e) => setF((p) => ({ ...p, passport_expiry: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Emirates ID Number</Label><Input aria-label="Emirates ID Number" value={f.emirates_id_number} onChange={(e) => setF((p) => ({ ...p, emirates_id_number: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Emirates ID Expiry</Label><Input aria-label="Emirates ID Expiry" type="date" value={f.emirates_id_expiry} onChange={(e) => setF((p) => ({ ...p, emirates_id_expiry: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Residence Visa Number</Label><Input aria-label="Residence Visa Number" value={f.residence_visa_number} onChange={(e) => setF((p) => ({ ...p, residence_visa_number: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Residence Visa Expiry</Label><Input aria-label="Residence Visa Expiry" type="date" value={f.residence_visa_expiry} onChange={(e) => setF((p) => ({ ...p, residence_visa_expiry: e.target.value }))} /></div>
      {medicalView && <>
      <div className="col-span-12 border-t pt-3"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Medical Insurance</p></div>
      <div className="col-span-6"><Label>Insurance Provider</Label><Input disabled={!medicalManage} aria-label="Insurance Provider" value={f.medical_insurance_provider} onChange={(e) => setF((p) => ({ ...p, medical_insurance_provider: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Insurance Policy</Label><Input disabled={!medicalManage} aria-label="Insurance Policy" value={f.medical_insurance_policy} onChange={(e) => setF((p) => ({ ...p, medical_insurance_policy: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Insurance Card</Label><Input disabled={!medicalManage} aria-label="Insurance Card" value={f.medical_insurance_card} onChange={(e) => setF((p) => ({ ...p, medical_insurance_card: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Insurance Expiry</Label><Input disabled={!medicalManage} aria-label="Insurance Expiry" type="date" value={f.medical_insurance_expiry} onChange={(e) => setF((p) => ({ ...p, medical_insurance_expiry: e.target.value }))} /></div>
      </>}
      <div className="col-span-6">
        <Label>Sponsored By</Label>
        <ERPCombobox ariaLabel="Sponsored By" value={f.sponsored_by || null} onValueChange={(v) => setF((p) => ({ ...p, sponsored_by: v ? String(v) : "" }))} options={[{ value: "employee", label: "Employee" }, { value: "company", label: "Company" }]} placeholder="Select..." />
      </div>
      <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={f.is_active} onCheckedChange={(v) => setF((p) => ({ ...p, is_active: v }))} /><Label>Active</Label></div>
      <div className="col-span-12"><Label>Notes</Label><Textarea aria-label="Notes" value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
    </div>
  );

  // HR.DOCLINK.1B — staged document link changes, applied on Save
  const depLinkChangesRef = useRef<DependentDocLinkChanges>(EMPTY_DEP_LINK_CHANGES);
  const isCurrentDependent = admission.isCurrent;
  useLayoutEffect(() => {depLinkChangesRef.current = EMPTY_DEP_LINK_CHANGES;}, [admission.generation]);
  const handleDepLinkChanges = useCallback((c: DependentDocLinkChanges) => {
    if (!isCurrentDependent()) return;
    depLinkChangesRef.current = c;
  }, [isCurrentDependent]);

  const openAdd = () => {
    if (!admission.canDispatch()) return;
    if(photoDraft.pending||photoDraft.createdPerson){toast.error('Finish the retained photo in its original dependent form before opening another.');return;}
    if(!dependentSession.startNew()){toast.error("Reconcile the previous dependent save before opening another record.");return;}
    setEditing(null);
    depLinkChangesRef.current = EMPTY_DEP_LINK_CHANGES;
    setAddDialogOpen(true);
  };
  const openEdit = async (selected: {id: number}) => {
    if (!admission.canDispatch()) return;
    if((photoDraft.pending||photoDraft.createdPerson)&&!(photoDraft.recovered?.dependent===selected.id&&!photoDraft.recovered.savePending)){toast.error('Finish the retained photo in its original dependent form before opening another.');return;}
    if(!dependentSession.startNew()){toast.error("Reconcile the previous dependent save first.");return;}
    const r = await recordRead.loadDetail(selected.id);
    if (!r || !admission.isCurrent()) return;
    depLinkChangesRef.current = EMPTY_DEP_LINK_CHANGES;
    setEditing(r);
    setForm({
      dms_document_id: r.dms_document_id,
      photo_dms_document_id:r.photo_dms_document_id??null,photo_framing:r.photo_framing?JSON.stringify(r.photo_framing):'',photo_pending:'',
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
    if(!editing||!admission.canDispatch()||!recordRead.isDetailCurrent(editing.id))return;
    const err=validateDependent(currentDependentForm.current);if(err){toast.error(err);return;}
    startTransition(async()=>{
      if(!admission.canDispatch()||!recordRead.isDetailCurrent(editing.id))return;
      let reviewed=currentDependentForm.current;
      try{if(photoDraft.pending||reviewed.photo_pending){const photo=await photoDraft.resolve(employeeId,editing.id,reviewed);reviewed={...reviewed,...photo};setForm(previous=>({...previous,...photo}));}}
      catch(e){toast.error(e instanceof Error?e.message:'Photo remains pending');return;}
      if(!admission.canDispatch()||!recordRead.isDetailCurrent(editing.id))return;
      const values=buildPayload(reviewed),changes=depLinkChangesRef.current;
      const result=await dependentSession.submit({employeeId,id:editing.id,kind:'save',revision:String(editing.workspace_revision),values,addDocumentIds:changes.addDocumentIds,removeDocumentIds:changes.removeDocumentIds},photoDraft.pending?(request,contract)=>photoDraft.saveDependent(request,contract,reviewed):undefined);
      if(result.success){handleAddSaved({hasDmsDocument:!!values.dms_document_id});void qc.invalidateQueries({queryKey:['hr','dependent-doc-links']});}
      if(!admission.isCurrent()||!recordRead.isDetailCurrent(editing.id))return;
      if(result.success){try{await photoDraft.confirmed();}catch(e){toast.error(e instanceof Error?e.message:'Photo confirmation pending');return;}toast.success('Dependent and document links saved together');recordRead.closeDetail();setEditDialogOpen(false);}else toast.error(result.error??'Dependent save unconfirmed');
    });
  };

  const handleAddSaved = (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => {
    notifyComplianceWrite(qc, employeeId, invalidateHrEmployeeDependents, opts);
  };

  const handleArchive = async(id:number)=>{
    if(photoDraft.pending||photoDraft.createdPerson){toast.error('Finish the retained photo before opening another operation.');return;}
    if(!admission.canDispatch()||!dependentSession.startNew())return;
    const current=await recordRead.loadDetail(id);if(!current||!admission.isCurrent())return;
    // The fresh detail query settles before React commits its admission state.
    // Review the exact revision in a guarded dialog; never dispatch from that
    // render-timing gap or silently drop the user's archive request.
    setArchiveCandidate({id,revision:String(current.workspace_revision),name:current.dependent_name_en});setArchiveDialogOpen(true);
  };
  const confirmArchive=async()=>{
    if(!archiveCandidate||!admission.canDispatch()||!recordRead.isDetailCurrent(archiveCandidate.id))return;
    const result=await dependentSession.submit({employeeId,id:archiveCandidate.id,kind:'archive',revision:archiveCandidate.revision,values:{},addDocumentIds:[],removeDocumentIds:[]});
    if(result.success)handleAddSaved();
    if(admission.isCurrent()){if(result.success){toast.success('Dependent archived');setArchiveDialogOpen(false);recordRead.closeDetail();}else toast.error(result.error??'Archive unconfirmed');}
  };
  const recovery=(dependentSession.pending||dependentSession.error||dependentSession.blocked)&&<div role="alert" className="mb-3 rounded border p-3 text-sm">
    <p>{dependentSession.error??'An earlier dependent save needs reconciliation before another change.'}</p>
    {dependentSession.pending&&<Button type="button" variant="outline" disabled={!admission.ready||dependentSession.saving} onClick={async()=>{
      const original=dependentSession.pending?.request;
      const result=await dependentSession.retry();
      if(result.success){handleAddSaved();void qc.invalidateQueries({queryKey:['hr','dependent-doc-links']});if(admission.isCurrent()){
        if(photoDraft.pending||photoDraft.createdPerson){
          if(original?.id===null&&result.data){photoDraft.rememberPerson({id:result.data.id,revision:result.data.revision});toast.success('Person created. Use Save to finish the photo.');}
          else if(original?.values.photo_dms_document_id===photoDraft.retained?.receipt?.documentId){try{await photoDraft.confirmed();}catch(e){toast.error(e instanceof Error?e.message:'Photo confirmation pending');return;}toast.success('Dependent and photo save confirmed');recordRead.closeDetail();setEditDialogOpen(false);setAddDialogOpen(false);}
          else toast.success('Original person save confirmed. Use Save to finish the photo.');
        }else{toast.success('Original dependent save confirmed');recordRead.closeDetail();setEditDialogOpen(false);setAddDialogOpen(false);}
      }}
      else if(admission.isCurrent())toast.error(result.error??'Original request remains unconfirmed');
    }}>Retry original dependent save</Button>}
    {dependentSession.retired&&<Button type="button" variant="outline" disabled={!admission.ready||dependentSession.saving} onClick={async()=>{const result=await dependentSession.reconcileRetired();if(result.success){handleAddSaved();toast.success('Earlier dependent save confirmed without replaying private fields');}else toast.error(result.error??'Earlier save remains unresolved');}}>Check earlier saved result</Button>}
  </div>;

  if (recordRead.restricted || recordRead.denied) return <div role="alert" className="mb-8 rounded border p-4">This compliance collection is not available with your current access.</div>;

  return (
    <QueryReadBoundary queries={[...recordRead.reads,uiRead2]}><div className="mb-8">
      {recovery}
      <PhotoRecoveryNotice draft={photoDraft} onOpenDependent={id=>void openEdit({id})}/>
      <SectionHeader icon={Users} title="Dependents" count={recordRead.serverRead.totalCount ?? undefined} onAdd={openAdd} canAdd={admission.ready} onAddFromDocs={() => { if (admission.canDispatch()) setDmsWizardOpen(true); }} canAddFromDocs={admission.ready && documentWizardEnabled} />
      {isLoading && <Skeleton className="h-16 w-full" />}
      {uiRead1.isSuccess && recordRead.serverRead.totalCount === 0 && !recordRead.invalid && <EmptyState message="No dependents added yet." />}
      {!recordRead.denied && !recordRead.restricted && (
        <div className="space-y-2">
          <RecordCollection presentation="embedded" serverRead={recordRead.serverRead} isLoading={isLoading} message={recordRead.validationMessage ?? recordRead.detailError} userProfileId={authContext.profile?.id?.toString()} id="hr.employee-compliance-tab.DependentsSection.records" rows={records} fields={[{"id":"dependent_name_en","path":"dependent_name_en","label":"Dependent Name En"}]} renderRecord={(r) => (
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
                <SubjectPhotoReadOnly key={recordRead.identity+':'+r.id} employee={employeeId} dependent={r.id} subject="dependent" identity={recordRead.identity}/>
              </div>
              {canManageDoc && recordRead.access.canManage && (
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <WorkforceReviewButton employeeId={employeeId}kind="dependent"sourceId={r.id}authContext={authContext}canDispatch={admission.canDispatch}onChildOpen={onChildOpen}onDenied={onSubjectDenied}/>
                  <Button aria-label="Edit record" size="sm" variant="ghost" type="button" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button aria-label="Archive record" size="sm" variant="ghost" type="button" onClick={() => handleArchive(r.id)}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      )}

      <ComplianceDmsAddDialog
        admission={admission}
        open={addDialogOpen}
        onOpenChange={open=>{if(!open&&!photoDraft.retained&&!photoDraft.createdPerson&&!photoDraft.busy&&!photoDraft.blocked)photoDraft.discard();setAddDialogOpen(open);}}
        employeeId={employeeId}
        recordKind="dependent"
        privacyRevision={recordRead.medicalViewRetired ? "medical-retired" : "medical-current"}
        redactForm={redactMedicalForm}
        icon={<Users className="h-5 w-5" />}
        recordLabel="Dependent"
        submitLabel="Save Dependent"
        size="xl"
        createEmptyForm={initialForm}
        validate={validateDependent}
        closeDisabled={!!dependentSession.pending||photoDraft.busy||!!photoDraft.retained||!!photoDraft.createdPerson||photoDraft.blocked}
        recovery={recovery}
        save={async(f)=>{
          if(!admission.canDispatch())return {success:false,error:'Required record checks are not ready'};
          try{
            const changes=depLinkChangesRef.current;
            const staged=photoDraft.pending||!!f.photo_pending||!!photoDraft.createdPerson;
            if(staged)photoDraft.validate(f);
            if(!staged){
              if(dependentSession.receipt&&!dependentSession.startNew())return {success:false,error:'Prior result needs reconciliation'};
              return dependentSession.submit({employeeId,id:null,kind:'save',revision:null,values:buildPayload(f),addDocumentIds:changes.addDocumentIds,removeDocumentIds:changes.removeDocumentIds});
            }
            let person=photoDraft.createdPerson;
            if(!person){
              const base=await dependentSession.submit({employeeId,id:null,kind:'save',revision:null,values:buildPayload({...f,photo_dms_document_id:null,photo_framing:'',photo_pending:''}),addDocumentIds:changes.addDocumentIds,removeDocumentIds:changes.removeDocumentIds},(request,contract)=>photoDraft.saveDependent(request,contract,f));
              if(!base.success||!base.data||base.retired)return base;
              person={id:base.data.id,revision:base.data.revision};photoDraft.rememberPerson(person);
            }
            const photo=await photoDraft.resolve(employeeId,person.id,f);
            if(!admission.canDispatch())return {success:false,error:'Photo update paused; reopen with current access.'};
            if(dependentSession.receipt&&!dependentSession.startNew())return {success:false,error:'Prior result needs reconciliation'};
            const result=await dependentSession.submit({employeeId,id:person.id,kind:'save',revision:person.revision,values:buildPayload({...f,...photo}),addDocumentIds:[],removeDocumentIds:[]},(request,contract)=>photoDraft.saveDependent(request,contract,f));
            if(result.success&&!result.retired)await photoDraft.confirmed();
            return result;
          }catch(e){return {success:false,error:e instanceof Error?e.message:'Person created; photo update remains pending. Retry Save.'};}
        }}
        onSaved={handleAddSaved}
        renderReview={({ form: addForm, setForm: setAddForm, prefillMeta }) => (
          <>
            {renderDependentFields(addForm, setAddForm, prefillMeta)}
            <DependentDocumentLinksSection
              employeeId={employeeId} admission={admission}
              dependentId={null}
              onChangesChange={handleDepLinkChanges}
            />
          </>
        )}
      />

      <ERPChildDialogForm open={archiveDialogOpen} onOpenChange={open=>{if(!admission.isCurrent()||dependentSession.hasPending)return;if(!open)recordRead.closeDetail();setArchiveDialogOpen(open);}} closeDisabled={!!dependentSession.pending} title="Archive Dependent" mode="edit" size="sm" submitLabel="Archive dependent" isSubmitting={dependentSession.saving} submitDisabled={!admission.ready||!archiveCandidate} onSubmit={confirmArchive}>
        <ComplianceReadPause admission={admission}/>{recovery}
        <p>Archive {archiveCandidate?.name}? The saved revision will be checked. Linked documents and their history will not be deleted.</p>
      </ERPChildDialogForm>
      <ERPChildDialogForm open={editDialogOpen} onOpenChange={(open) => { if (!admission.isCurrent()||dependentSession.pending||photoDraft.busy||photoDraft.retained||photoDraft.blocked) return; if (!open) {photoDraft.discard();recordRead.closeDetail();} setEditDialogOpen(open); }} closeDisabled={!!dependentSession.pending||photoDraft.busy||!!photoDraft.retained||photoDraft.blocked} title="Edit Dependent" icon={<Users className="h-5 w-5" />} mode="edit" size="xl" isSubmitting={isSubmitting} submitDisabled={!admission.ready} onSubmit={handleEditSubmit}>
        <ComplianceReadPause admission={admission} />
        {recovery}
        {renderDependentFields(form, setForm, null)}
        <DependentDocumentLinksSection
              employeeId={employeeId} admission={admission}
          key={editing?.id ?? "none"}
          dependentId={editing?.id ?? null}
          onChangesChange={handleDepLinkChanges}
        />
      </ERPChildDialogForm>

      {(admission.ready || dmsWizardOpen) && <HrDocumentToRecordWizard
        employeeId={employeeId}
        targetType="dependent"
        authContext={authContext}
        admission={admission}
        open={dmsWizardOpen}
        onOpenChange={setDmsWizardOpen}
        onSaved={() => handleAddSaved()}
        onChildOpen={onChildOpen}
      />}
    </div></QueryReadBoundary>
  );
}

// ── 4. ACCESS CARDS SECTION ───────────────────────────────────────────────────

function AccessCardsSection({ authContext, onSubjectDenied, employeeId, canManageDoc, onChildOpen }: { authContext: AuthContext; onSubjectDenied: () => void; employeeId: number; canManageDoc: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const sectionActive = useRecordReadActive();
  const recordRead = useHrComplianceRecords("cards", employeeId, authContext, onSubjectDenied);
  const [addDialogOpen, setAddDialogOpenRaw] = useState(false);
  const [editDialogOpen, setEditDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeAccessCardRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();


  const initialForm = () => ({
    dms_document_id: null as number | null,
    access_type_id: null as number | null, client_authority: "", work_site_id: null as number | null,
    card_number: "", application_reference: "", issue_date: "", expiry_date: "",
    status: "pending" as string, renewal_status: "not_required" as string, notes: "",
  });

  type AccessCardForm = ReturnType<typeof initialForm>;

  const [form, setForm] = useState(initialForm);

  const uiRead1 = recordRead.query;
  const records = recordRead.rows;
  const isLoading = recordRead.busy;


  const uiRead2 = useQuery({
    queryKey: [...queryKeys.hr.accessCardTypes(), recordRead.identity, form.access_type_id],
    enabled: sectionActive && canManageDoc && recordRead.access.canManage,
    queryFn: async ({signal}) => {
      const r = await listHrAccessCardTypes({ selectedId: form.access_type_id || null, signal });
      if (!r.success) throw new Error("Records or choices could not be loaded."); return r.success && r.data ? r.data.data as HrAccessCardTypeRow[] : [];
    },
  });
  const { data: cardTypes } = uiRead2;

  const admission = useComplianceReadAdmission(canManageDoc && recordRead.access.canManage, [...recordRead.reads, uiRead2], JSON.stringify([recordRead.owner, recordRead.denied, recordRead.restricted]));
  const complianceSave=useComplianceSave(authContext,employeeId,'access-card',admission,recordRead.denied||recordRead.restricted);
  const notifyChildOpen = useComplianceChildLease(admission, onChildOpen);
  const setAddDialogOpen = useComplianceDialogOpen(admission, notifyChildOpen, setAddDialogOpenRaw);
  const setEditDialogOpen = useComplianceDialogOpen(admission, notifyChildOpen, setEditDialogOpenRaw);
  const [editorGeneration, setEditorGeneration] = useState(admission.generation);
  const generationChanged = editorGeneration !== admission.generation;
  const retireEditor = recordRead.denied || recordRead.restricted || recordRead.detailUnavailable;
  const [editorRetired, setEditorRetired] = useState(false);
  if (generationChanged || retireEditor && !editorRetired) {
    setEditorGeneration(admission.generation);
    setEditorRetired(retireEditor);
    setEditing(null); setForm(initialForm()); setEditDialogOpenRaw(false);
    if (generationChanged || recordRead.restricted || recordRead.denied) setAddDialogOpenRaw(false);
  }
  if (!retireEditor && editorRetired) setEditorRetired(false);
  const closeRetiredDetail = recordRead.closeDetail;
  useLayoutEffect(() => {
    if (retireEditor) {notifyChildOpen(false); closeRetiredDetail();}
  }, [retireEditor, closeRetiredDetail, notifyChildOpen]);

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
      <div className="col-span-6"><Label>Access Type <span className="text-destructive">*</span></Label><ERPCombobox ariaLabel="Access Type" value={f.access_type_id} onValueChange={(v) => setF((p) => ({ ...p, access_type_id: Number(v) }))} options={cardTypeOptions} placeholder="Select type..." required /></div>
      <div className="col-span-6"><Label>Client / Authority</Label><Input aria-label="Client / Authority" value={f.client_authority} onChange={(e) => setF((p) => ({ ...p, client_authority: e.target.value }))} placeholder="e.g. CICPA, ADNOC" /></div>
      <div className="col-span-6"><Label>Card Number</Label><Input aria-label="Card Number" value={f.card_number} onChange={(e) => setF((p) => ({ ...p, card_number: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Application Reference</Label><Input aria-label="Application Reference" value={f.application_reference} onChange={(e) => setF((p) => ({ ...p, application_reference: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Issue Date</Label><Input aria-label="Issue Date" type="date" value={f.issue_date} onChange={(e) => setF((p) => ({ ...p, issue_date: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Expiry Date</Label><Input aria-label="Expiry Date" type="date" value={f.expiry_date} onChange={(e) => setF((p) => ({ ...p, expiry_date: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Status</Label><ERPCombobox ariaLabel="Status" value={f.status} onValueChange={(v) => setF((p) => ({ ...p, status: String(v) }))} options={accessStatusOptions} placeholder="Status..." /></div>
      <div className="col-span-6"><Label>Renewal</Label><ERPCombobox ariaLabel="Renewal" value={f.renewal_status} onValueChange={(v) => setF((p) => ({ ...p, renewal_status: String(v) }))} options={RENEWAL_STATUS_OPTIONS} placeholder="Renewal..." /></div>
      <div className="col-span-12"><Label>Notes</Label><Textarea aria-label="Notes" value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
    </div>
  );

  const openAdd = () => {
    if (admission.canDispatch() && !complianceSave.pending && !complianceSave.retired) setAddDialogOpen(true); };
  const openEdit = async (selected: {id: number}) => {
    if (!admission.canDispatch() || !!complianceSave.pending || !!complianceSave.retired) return;
    const r = await recordRead.loadDetail(selected.id);
    if (!r || !admission.isCurrent()) return;
    setEditing(r);
    setForm({
      dms_document_id: r.dms_document_id,
      access_type_id: r.access_type_id, client_authority: r.client_authority ?? "", work_site_id: r.work_site_id,
      card_number: r.card_number ?? "", application_reference: r.application_reference ?? "",
      issue_date: r.issue_date ?? "", expiry_date: r.expiry_date ?? "", status: r.status,
      renewal_status: r.renewal_status, notes: r.notes ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editing || !admission.canDispatch() || !recordRead.isDetailCurrent(editing.id)) return;
    const err = validateAccessCard(form);
    if (err) { toast.error(err); return; }
    startTransition(async () => {
      if (!admission.canDispatch() || !recordRead.isDetailCurrent(editing.id)) return;
      const payload = buildPayload(form);
      const result = await complianceSave.send(editing.id,'update',payload,String(editing.workspace_revision));
      if (result.success) handleAddSaved({hasDmsDocument: !!payload.dms_document_id});
      if (!admission.isCurrent() || !recordRead.isDetailCurrent(editing.id)) return;
      if (result.success) {
        toast.success("Updated");
        recordRead.closeDetail(); setEditDialogOpen(false);
      } else toast.error(result.error ?? "Failed to save");
    });
  };

  const handleAddSaved = (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => {
    notifyComplianceWrite(qc, employeeId, invalidateHrEmployeeAccessCards, opts);
  };

  const handleArchive = async (id: number) => {
    if (!admission.canDispatch()) return;
    const r = await complianceSave.act(id,'archive');
    if (r.success) handleAddSaved();
    if (!admission.isCurrent()) return;
    if (r.success) { toast.success("Archived"); }
    else toast.error(r.error);
  };

  if (recordRead.restricted || recordRead.denied) return <div role="alert" className="mb-8 rounded border p-4">This compliance collection is not available with your current access.</div>;

  return (
    <><ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/><QueryReadBoundary queries={[...recordRead.reads,uiRead2]}><div className="mb-8">
      <SectionHeader icon={CreditCard} title="Access Cards & Passes" count={recordRead.serverRead.totalCount ?? undefined} onAdd={openAdd} canAdd={admission.ready} />
      {isLoading && <Skeleton className="h-16 w-full" />}
      {uiRead1.isSuccess && recordRead.serverRead.totalCount === 0 && !recordRead.invalid && <EmptyState message="No access cards or passes added yet." />}
      {!recordRead.denied && !recordRead.restricted && (
        <div className="space-y-2">
          <RecordCollection presentation="embedded" serverRead={recordRead.serverRead} isLoading={isLoading} message={recordRead.validationMessage ?? recordRead.detailError} userProfileId={authContext.profile?.id?.toString()} id="hr.employee-compliance-tab.AccessCardsSection.records" rows={records} fields={[{"id":"card_number","path":"card_number","label":"Card Number"},{"id":"expiry_date","path":"expiry_date","label":"Expiry Date"}]} renderRecord={(r) => (
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
              {canManageDoc && recordRead.access.canManage && (
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <WorkforceReviewButton employeeId={employeeId}kind="access-card"sourceId={r.id}authContext={authContext}canDispatch={admission.canDispatch}onChildOpen={onChildOpen}onDenied={onSubjectDenied}/>
                  <Button aria-label="Edit record" size="sm" variant="ghost" type="button" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button aria-label="Archive record" size="sm" variant="ghost" type="button" onClick={() => handleArchive(r.id)}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      )}

      <ComplianceDmsAddDialog
        closeDisabled={complianceSave.busy||!!complianceSave.pending}
        recovery={<ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/>}
        admission={admission}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        employeeId={employeeId}
        recordKind="access_card"
        icon={<CreditCard className="h-5 w-5" />}
        recordLabel="Access Card"
        submitLabel="Save Access Card"
        createEmptyForm={initialForm}
        validate={validateAccessCard}
        save={async (f) => admission.canDispatch() ? complianceSave.send(null,'create',buildPayload(f),null) : {success: false, error: "Required record checks are not ready"}}
        onSaved={handleAddSaved}
        renderReview={({ form: addForm, setForm: setAddForm, prefillMeta }) => renderAccessCardFields(addForm, setAddForm, prefillMeta)}
      />

      <ERPChildDialogForm open={editDialogOpen} onOpenChange={(open) => { if (!admission.isCurrent()) return; if (!open) recordRead.closeDetail(); setEditDialogOpen(open); }} title="Edit Access Card" icon={<CreditCard className="h-5 w-5" />} mode="edit" size="lg" isSubmitting={isSubmitting||complianceSave.busy}
        closeDisabled={complianceSave.busy||!!complianceSave.pending} submitDisabled={!admission.ready||complianceSave.blocked} onSubmit={handleEditSubmit}>
        <ComplianceReadPause admission={admission} />
        {renderAccessCardFields(form, setForm, null)}
      </ERPChildDialogForm>
    </div></QueryReadBoundary></>
  );
}

// ── 5. TRAINING CERTIFICATES SECTION ─────────────────────────────────────────

function TrainingCertificatesSection({ authContext, onSubjectDenied, employeeId, canManageDoc, onChildOpen }: { authContext: AuthContext; onSubjectDenied: () => void; employeeId: number; canManageDoc: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const sectionActive = useRecordReadActive();
  const recordRead = useHrComplianceRecords("training", employeeId, authContext, onSubjectDenied);
  const [addDialogOpen, setAddDialogOpenRaw] = useState(false);
  const [editDialogOpen, setEditDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeTrainingCertificateRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();


  const initialForm = () => ({
    dms_document_id: null as number | null,
    training_category_id: null as number | null, training_type_id: null as number | null,
    provider: "", approval_body: "", certificate_number: "", completion_date: "", expiry_date: "",
    required_for_designation: false, required_for_site: false,
    status: "valid" as string, verification_status: "unverified" as string, notes: "",
  });

  type TrainingForm = ReturnType<typeof initialForm>;

  const [form, setForm] = useState(initialForm);

  const uiRead1 = recordRead.query;
  const records = recordRead.rows;
  const isLoading = recordRead.busy;


  const uiRead2 = useQuery({
    queryKey: [...queryKeys.hr.trainingCategories(), recordRead.identity, form.training_category_id],
    enabled: sectionActive && canManageDoc && recordRead.access.canManage,
    queryFn: async ({signal}) => {
      const r = await listHrTrainingCategories({ selectedId: form.training_category_id || null, signal });
      if (!r.success) throw new Error("Records or choices could not be loaded."); return r.success && r.data ? r.data.data as HrSettingsRow[] : [];
    },
  });
  const { data: trainCategories } = uiRead2;

  const uiRead3 = useQuery({
    queryKey: [...queryKeys.hr.trainingTypes(), recordRead.identity, form.training_type_id],
    enabled: sectionActive && canManageDoc && recordRead.access.canManage,
    queryFn: async ({signal}) => {
      const r = await listHrTrainingTypes({ selectedId: form.training_type_id || null, signal });
      if (!r.success) throw new Error("Records or choices could not be loaded."); return r.success && r.data ? r.data.data as HrTrainingTypeRow[] : [];
    },
  });
  const { data: trainTypes } = uiRead3;

  const admission = useComplianceReadAdmission(canManageDoc && recordRead.access.canManage, [...recordRead.reads, uiRead2, uiRead3], JSON.stringify([recordRead.owner, recordRead.denied, recordRead.restricted]));
  const complianceSave=useComplianceSave(authContext,employeeId,'training-certificate',admission,recordRead.denied||recordRead.restricted);
  const notifyChildOpen = useComplianceChildLease(admission, onChildOpen);
  const setAddDialogOpen = useComplianceDialogOpen(admission, notifyChildOpen, setAddDialogOpenRaw);
  const setEditDialogOpen = useComplianceDialogOpen(admission, notifyChildOpen, setEditDialogOpenRaw);
  const [editorGeneration, setEditorGeneration] = useState(admission.generation);
  const generationChanged = editorGeneration !== admission.generation;
  const retireEditor = recordRead.denied || recordRead.restricted || recordRead.detailUnavailable;
  const [editorRetired, setEditorRetired] = useState(false);
  if (generationChanged || retireEditor && !editorRetired) {
    setEditorGeneration(admission.generation);
    setEditorRetired(retireEditor);
    setEditing(null); setForm(initialForm()); setEditDialogOpenRaw(false);
    if (generationChanged || recordRead.restricted || recordRead.denied) setAddDialogOpenRaw(false);
  }
  if (!retireEditor && editorRetired) setEditorRetired(false);
  const closeRetiredDetail = recordRead.closeDetail;
  useLayoutEffect(() => {
    if (retireEditor) {notifyChildOpen(false); closeRetiredDetail();}
  }, [retireEditor, closeRetiredDetail, notifyChildOpen]);

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
    completion_date: f.completion_date || null,
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
      <div className="col-span-6"><Label>Training Category</Label><ERPCombobox ariaLabel="Training Category" value={f.training_category_id} onValueChange={(v) => setF((p) => ({ ...p, training_category_id: Number(v) }))} options={catOptions} placeholder="Select category..." /></div>
      <div className="col-span-6"><Label>Training Type <span className="text-destructive">*</span></Label><ERPCombobox ariaLabel="Training Type" value={f.training_type_id} onValueChange={(v) => setF((p) => ({ ...p, training_type_id: Number(v) }))} options={typeOptions} placeholder="Select type..." required /></div>
      <div className="col-span-6"><Label>Provider</Label><Input aria-label="Provider" value={f.provider} onChange={(e) => setF((p) => ({ ...p, provider: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Approval Body</Label><Input aria-label="Approval Body" value={f.approval_body} onChange={(e) => setF((p) => ({ ...p, approval_body: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Certificate Number</Label><Input aria-label="Certificate Number" value={f.certificate_number} onChange={(e) => setF((p) => ({ ...p, certificate_number: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Completion Date</Label><Input aria-label="Completion Date" type="date" value={f.completion_date} onChange={(e) => setF((p) => ({ ...p, completion_date: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Expiry Date</Label><Input aria-label="Expiry Date" type="date" value={f.expiry_date} onChange={(e) => setF((p) => ({ ...p, expiry_date: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Status</Label><ERPCombobox ariaLabel="Status" value={f.status} onValueChange={(v) => setF((p) => ({ ...p, status: String(v) }))} options={trainStatusOptions} placeholder="Status..." /></div>
      <div className="col-span-6"><Label>Verification</Label><ERPCombobox ariaLabel="Verification" value={f.verification_status} onValueChange={(v) => setF((p) => ({ ...p, verification_status: String(v) }))} options={VERIFICATION_OPTIONS} placeholder="Verification..." /></div>
      <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={f.required_for_designation} onCheckedChange={(v) => setF((p) => ({ ...p, required_for_designation: v }))} /><Label>Required for Designation</Label></div>
      <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={f.required_for_site} onCheckedChange={(v) => setF((p) => ({ ...p, required_for_site: v }))} /><Label>Required for Site</Label></div>
      <div className="col-span-12"><Label>Notes</Label><Textarea aria-label="Notes" value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
    </div>
  );

  const openAdd = () => {
    if (admission.canDispatch() && !complianceSave.pending && !complianceSave.retired) setAddDialogOpen(true); };
  const openEdit = async (selected: {id: number}) => {
    if (!admission.canDispatch() || !!complianceSave.pending || !!complianceSave.retired) return;
    const r = await recordRead.loadDetail(selected.id);
    if (!r || !admission.isCurrent()) return;
    setEditing(r);
    setForm({
      dms_document_id: r.dms_document_id,
      training_category_id: r.training_category_id, training_type_id: r.training_type_id,
      provider: r.provider ?? "", approval_body: r.approval_body ?? "",
      certificate_number: r.certificate_number ?? "", completion_date: r.completion_date ?? "", expiry_date: r.expiry_date ?? "",
      required_for_designation: r.required_for_designation,
      required_for_site: r.required_for_site, status: r.status, verification_status: r.verification_status,
      notes: r.notes ?? "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editing || !admission.canDispatch() || !recordRead.isDetailCurrent(editing.id)) return;
    const err = validateTraining(form);
    if (err) { toast.error(err); return; }
    startTransition(async () => {
      if (!admission.canDispatch() || !recordRead.isDetailCurrent(editing.id)) return;
      const payload = buildPayload(form);
      const result = await complianceSave.send(editing.id,'update',payload,String(editing.workspace_revision));
      if (result.success) handleAddSaved({hasDmsDocument: !!payload.dms_document_id});
      if (!admission.isCurrent() || !recordRead.isDetailCurrent(editing.id)) return;
      if (result.success) {
        toast.success("Updated");
        recordRead.closeDetail(); setEditDialogOpen(false);
      } else toast.error(result.error ?? "Failed to save");
    });
  };

  const handleAddSaved = (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => {
    notifyComplianceWrite(qc, employeeId, invalidateHrEmployeeTrainingCertificates, opts);
  };

  const handleArchive = async (id: number) => {
    if (!admission.canDispatch()) return;
    const r = await complianceSave.act(id,'archive');
    if (r.success) handleAddSaved();
    if (!admission.isCurrent()) return;
    if (r.success) { toast.success("Archived"); }
    else toast.error(r.error);
  };

  const handleVerify = async (id: number) => {
    if (!admission.canDispatch()) return;
    const r = await complianceSave.act(id,'verify');
    if (r.success) handleAddSaved();
    if (!admission.isCurrent()) return;
    if (r.success) { toast.success("Verified"); }
    else toast.error(r.error);
  };

  if (recordRead.restricted || recordRead.denied) return <div role="alert" className="mb-8 rounded border p-4">This compliance collection is not available with your current access.</div>;

  return (
    <><ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/><QueryReadBoundary queries={[...recordRead.reads,uiRead2,uiRead3]}><div className="mb-8">
      <SectionHeader icon={GraduationCap} title="Training & Certifications" count={recordRead.serverRead.totalCount ?? undefined} onAdd={openAdd} canAdd={admission.ready} />
      {isLoading && <Skeleton className="h-16 w-full" />}
      {uiRead1.isSuccess && recordRead.serverRead.totalCount === 0 && !recordRead.invalid && <EmptyState message="No training certificates added yet." />}
      {!recordRead.denied && !recordRead.restricted && (
        <div className="space-y-2">
          <RecordCollection presentation="embedded" serverRead={recordRead.serverRead} isLoading={isLoading} message={recordRead.validationMessage ?? recordRead.detailError} userProfileId={authContext.profile?.id?.toString()} id="hr.employee-compliance-tab.TrainingCertificatesSection.records" rows={records} fields={[{"id":"certificate_number","path":"certificate_number","label":"Certificate Number"},{"id":"expiry_date","path":"expiry_date","label":"Expiry Date"}]} renderRecord={(r) => (
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
              {canManageDoc && recordRead.access.canManage && (
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <WorkforceReviewButton employeeId={employeeId}kind="training-certificate"sourceId={r.id}authContext={authContext}canDispatch={admission.canDispatch}onChildOpen={onChildOpen}onDenied={onSubjectDenied}/>
                  {r.verification_status === "unverified" && <Button aria-label="Verify" size="sm" variant="ghost" type="button" onClick={() => handleVerify(r.id)} title="Verify"><CheckCircle className="h-3.5 w-3.5" /></Button>}
                  <Button aria-label="Edit record" size="sm" variant="ghost" type="button" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button aria-label="Archive record" size="sm" variant="ghost" type="button" onClick={() => handleArchive(r.id)}><Archive className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      )}

      <ComplianceDmsAddDialog
        closeDisabled={complianceSave.busy||!!complianceSave.pending}
        recovery={<ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/>}
        admission={admission}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        employeeId={employeeId}
        recordKind="training_certificate"
        icon={<GraduationCap className="h-5 w-5" />}
        recordLabel="Training Certificate"
        submitLabel="Save Certificate"
        createEmptyForm={initialForm}
        validate={validateTraining}
        save={async (f) => admission.canDispatch() ? complianceSave.send(null,'create',buildPayload(f),null) : {success: false, error: "Required record checks are not ready"}}
        onSaved={handleAddSaved}
        renderReview={({ form: addForm, setForm: setAddForm, prefillMeta }) => renderTrainingFields(addForm, setAddForm, prefillMeta)}
      />

      <ERPChildDialogForm open={editDialogOpen} onOpenChange={(open) => { if (!admission.isCurrent()) return; if (!open) recordRead.closeDetail(); setEditDialogOpen(open); }} title="Edit Certificate" icon={<GraduationCap className="h-5 w-5" />} mode="edit" size="lg" isSubmitting={isSubmitting||complianceSave.busy}
        closeDisabled={complianceSave.busy||!!complianceSave.pending} submitDisabled={!admission.ready||complianceSave.blocked} onSubmit={handleEditSubmit}>
        <ComplianceReadPause admission={admission} />
        {renderTrainingFields(form, setForm, null)}
      </ERPChildDialogForm>
    </div></QueryReadBoundary></>
  );
}

// ── 6. MEDICAL RECORDS SECTION (RESTRICTED) ───────────────────────────────────

function MedicalRecordsSection({ authContext, onSubjectDenied, employeeId, canMedView, canMedManage, onChildOpen }: { authContext: AuthContext; onSubjectDenied: () => void; employeeId: number; canMedView: boolean; canMedManage: boolean; onChildOpen?: (open: boolean) => void }) {
  const qc = useQueryClient();
  const sectionActive = useRecordReadActive();
  const recordRead = useHrComplianceRecords("medical", employeeId, authContext, onSubjectDenied);
  const [addDialogOpen, setAddDialogOpenRaw] = useState(false);
  const [editDialogOpen, setEditDialogOpenRaw] = useState(false);
  const [editing, setEditing] = useState<EmployeeMedicalRecordRow | null>(null);
  const [isSubmitting, startTransition] = useTransition();


  const initialForm = () => ({
    dms_document_id: null as number | null,
    medical_record_type_id: null as number | null, medical_center: "", report_number: "",
    examination_date: "", result: "under_review" as string, fit_for_work: false,
    work_restrictions: false, restriction_details: "", next_examination_date: "",
    required_for_visa: false, required_for_site: false, required_for_noc: false,
    notes: "",
  });

  type MedicalRecordForm = ReturnType<typeof initialForm>;

  const [form, setForm] = useState(initialForm);

  const uiRead1 = recordRead.query;
  const records = recordRead.rows;
  const isLoading = recordRead.busy;


  const uiRead2 = useQuery({
    queryKey: [...queryKeys.hr.medicalRecordTypes(), recordRead.identity, form.medical_record_type_id],
    enabled: sectionActive && canMedManage && recordRead.access.canManage,
    queryFn: async ({signal}) => {
      const r = await listHrMedicalRecordTypes({ selectedId: form.medical_record_type_id || null, signal });
      if (!r.success) throw new Error("Records or choices could not be loaded."); return r.success && r.data ? r.data.data as HrMedicalRecordTypeRow[] : [];
    },
  });
  const { data: recTypes } = uiRead2;

  const admission = useComplianceReadAdmission(canMedManage && recordRead.access.canManage, [...recordRead.reads, uiRead2], JSON.stringify([recordRead.owner, recordRead.denied, recordRead.restricted]));
  const complianceSave=useComplianceSave(authContext,employeeId,'medical-record',admission,recordRead.denied||recordRead.restricted);
  const notifyChildOpen = useComplianceChildLease(admission, onChildOpen);
  const setAddDialogOpen = useComplianceDialogOpen(admission, notifyChildOpen, setAddDialogOpenRaw);
  const setEditDialogOpen = useComplianceDialogOpen(admission, notifyChildOpen, setEditDialogOpenRaw);
  const [editorGeneration, setEditorGeneration] = useState(admission.generation);
  const generationChanged = editorGeneration !== admission.generation;
  const retireEditor = recordRead.denied || recordRead.restricted || recordRead.detailUnavailable;
  const [editorRetired, setEditorRetired] = useState(false);
  if (generationChanged || retireEditor && !editorRetired) {
    setEditorGeneration(admission.generation);
    setEditorRetired(retireEditor);
    setEditing(null); setForm(initialForm()); setEditDialogOpenRaw(false);
    if (generationChanged || recordRead.restricted || recordRead.denied) setAddDialogOpenRaw(false);
  }
  if (!retireEditor && editorRetired) setEditorRetired(false);
  const closeRetiredDetail = recordRead.closeDetail;
  useLayoutEffect(() => {
    if (retireEditor) {notifyChildOpen(false); closeRetiredDetail();}
  }, [retireEditor, closeRetiredDetail, notifyChildOpen]);

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

  const openAdd = () => {
    if (admission.canDispatch() && !complianceSave.pending && !complianceSave.retired) setAddDialogOpen(true); };
  const openEdit = async (selected: {id: number}) => {
    if (!admission.canDispatch() || !!complianceSave.pending || !!complianceSave.retired) return;
    const r = await recordRead.loadDetail(selected.id);
    if (!r || !admission.isCurrent()) return;
    setEditing(r);
    setForm({
      dms_document_id: r.dms_document_id,
      medical_record_type_id: r.medical_record_type_id, medical_center: r.medical_center ?? "",
      report_number: r.report_number ?? "", examination_date: r.examination_date, result: r.result,
      fit_for_work: r.fit_for_work, work_restrictions: r.work_restrictions,
      restriction_details: r.restriction_details ?? "", next_examination_date: r.next_examination_date ?? "",
      required_for_visa: r.required_for_visa, required_for_site: r.required_for_site,
      required_for_noc: r.required_for_noc,
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
    next_examination_date: f.next_examination_date || null,
    notes: f.notes || null,
  });

  const validateMedicalRecord = (f: MedicalRecordForm) => {
    if (!f.medical_record_type_id) return "Medical record type is required";
    if (!f.examination_date) return "Examination date is required";
    if (!f.result) return "Result is required";
    return null;
  };

  const handleEditSubmit = () => {
    if (!editing || !admission.canDispatch() || !recordRead.isDetailCurrent(editing.id)) return;
    const err = validateMedicalRecord(form);
    if (err) { toast.error(err); return; }
    startTransition(async () => {
      if (!admission.canDispatch() || !recordRead.isDetailCurrent(editing.id)) return;
      const payload = buildPayload(form);
      const result = await complianceSave.send(editing.id,'update',payload,String(editing.workspace_revision));
      if (result.success) handleAddSaved({hasDmsDocument: !!payload.dms_document_id});
      if (!admission.isCurrent() || !recordRead.isDetailCurrent(editing.id)) return;
      if (result.success) {
        toast.success("Updated");
        recordRead.closeDetail(); setEditDialogOpen(false);
      } else toast.error(result.error ?? "Failed to save");
    });
  };

  const handleAddSaved = (opts?: { dmsLinkCreated?: boolean; hasDmsDocument?: boolean }) => {
    notifyComplianceWrite(qc, employeeId, invalidateHrEmployeeMedicalRecords, opts);
  };

  const handleArchive = async (id: number) => {
    if (!admission.canDispatch()) return;
    const r = await complianceSave.act(id,'archive');
    if (r.success) handleAddSaved();
    if (!admission.isCurrent()) return;
    if (r.success) { toast.success("Archived"); }
    else toast.error(r.error);
  };

  const recTypeOptions = (recTypes ?? []).map((t) => ({ value: t.id, label: t.name_en }));
  const resultOptions = [{ value: "fit", label: "Fit" }, { value: "unfit", label: "Unfit" }, { value: "conditionally_fit", label: "Conditionally Fit" }, { value: "under_review", label: "Under Review" }];

  const renderMedicalRecordFields = (
    f: MedicalRecordForm,
    setF: Dispatch<SetStateAction<MedicalRecordForm>>,
    prefillMeta: Parameters<typeof ComplianceDmsPrefillBanner>[0]["prefillMeta"]
  ) => (
    <div className="grid grid-cols-12 gap-4">
      <ComplianceDmsPrefillBanner prefillMeta={prefillMeta} />
      <div className="col-span-6"><Label>Medical Record Type <span className="text-destructive">*</span></Label><ERPCombobox ariaLabel="Medical Record Type" value={f.medical_record_type_id} onValueChange={(v) => setF((p) => ({ ...p, medical_record_type_id: Number(v) }))} options={recTypeOptions} placeholder="Select type..." required /></div>
      <div className="col-span-6"><Label>Medical Center</Label><Input aria-label="Medical Center" value={f.medical_center} onChange={(e) => setF((p) => ({ ...p, medical_center: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Report Number</Label><Input aria-label="Report Number" value={f.report_number} onChange={(e) => setF((p) => ({ ...p, report_number: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Examination Date <span className="text-destructive">*</span></Label><Input aria-label="Examination Date" required type="date" value={f.examination_date} onChange={(e) => setF((p) => ({ ...p, examination_date: e.target.value }))} /></div>
      <div className="col-span-6"><Label>Result <span className="text-destructive">*</span></Label><ERPCombobox ariaLabel="Result" value={f.result} onValueChange={(v) => setF((p) => ({ ...p, result: String(v) }))} options={resultOptions} placeholder="Result..." required /></div>
      <div className="col-span-6"><Label>Next Examination Date</Label><Input aria-label="Next Examination Date" type="date" value={f.next_examination_date} onChange={(e) => setF((p) => ({ ...p, next_examination_date: e.target.value }))} /></div>
      <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={f.fit_for_work} onCheckedChange={(v) => setF((p) => ({ ...p, fit_for_work: v }))} /><Label>Fit for Work</Label></div>
      <div className="col-span-6 flex items-center gap-2 pt-5"><Switch checked={f.work_restrictions} onCheckedChange={(v) => setF((p) => ({ ...p, work_restrictions: v }))} /><Label>Work Restrictions</Label></div>
      {f.work_restrictions && <div className="col-span-12"><Label>Restriction Details</Label><Textarea aria-label="Restriction Details" value={f.restriction_details} onChange={(e) => setF((p) => ({ ...p, restriction_details: e.target.value }))} rows={2} /></div>}
      <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={f.required_for_visa} onCheckedChange={(v) => setF((p) => ({ ...p, required_for_visa: v }))} /><Label>Required for Visa</Label></div>
      <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={f.required_for_site} onCheckedChange={(v) => setF((p) => ({ ...p, required_for_site: v }))} /><Label>Required for Site</Label></div>
      <div className="col-span-4 flex items-center gap-2 pt-5"><Switch checked={f.required_for_noc} onCheckedChange={(v) => setF((p) => ({ ...p, required_for_noc: v }))} /><Label>Required for NOC</Label></div>
      <div className="col-span-12"><Label>Notes</Label><Textarea aria-label="Notes" value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} rows={2} /></div>
    </div>
  );

  if (recordRead.restricted || recordRead.denied) return <div role="alert" className="mb-8 rounded border p-4">This compliance collection is not available with your current access.</div>;

  return (
    <><ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/><QueryReadBoundary queries={[...recordRead.reads,uiRead2]}><div className="mb-8">
      <SectionHeader icon={Activity} title="Medical & Health Records" count={recordRead.serverRead.totalCount ?? undefined} onAdd={canMedManage ? openAdd : undefined} canAdd={admission.ready} />
      {isLoading && <Skeleton className="h-16 w-full" />}
      {uiRead1.isSuccess && recordRead.serverRead.totalCount === 0 && !recordRead.invalid && <EmptyState message="No medical records added yet." />}
      {!recordRead.denied && !recordRead.restricted && (
        <div className="space-y-2">
          <RecordCollection presentation="embedded" serverRead={recordRead.serverRead} isLoading={isLoading} message={recordRead.validationMessage ?? recordRead.detailError} userProfileId={authContext.profile?.id?.toString()} id="hr.employee-compliance-tab.MedicalRecordsSection.records" rows={records} fields={[{"id":"examination_date","path":"examination_date","label":"Examination Date"}]} renderRecord={(r) => {
            const resultCfg = getMedicalResultBadge(r.result);
            return (
              <div key={r.id} className="flex items-start justify-between p-3 border rounded-lg bg-card hover:bg-muted/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.medical_record_type?.name_en ?? `Type ${r.medical_record_type_id}`}</span>
                    <Badge variant={resultCfg.variant as "default" | "secondary" | "destructive" | "outline"} className="text-xs">{resultCfg.label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.medical_center && <span>{r.medical_center} · </span>}
                    Examined: {formatDate(r.examination_date)}
                    {r.report_number && <span> · {r.report_number}</span>}
                  </div>
                  {r.next_examination_date && <div className="mt-1"><ExpiryBadge expiryDate={r.next_examination_date} /></div>}
                </div>
                {canMedManage && recordRead.access.canManage && (
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <WorkforceReviewButton employeeId={employeeId}kind="medical-record"sourceId={r.id}authContext={authContext}canDispatch={admission.canDispatch}onChildOpen={onChildOpen}onDenied={onSubjectDenied}/>
                    <Button aria-label="Edit record" size="sm" variant="ghost" type="button" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button aria-label="Archive record" size="sm" variant="ghost" type="button" onClick={() => handleArchive(r.id)}><Archive className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
            );
          }} />
        </div>
      )}

      {(canMedManage || editDialogOpen || addDialogOpen) && (
        <>
          <ComplianceDmsAddDialog
        closeDisabled={complianceSave.busy||!!complianceSave.pending}
        recovery={<ComplianceSaveRecovery session={complianceSave} onConfirmed={handleAddSaved}/>}
        admission={admission}
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
            employeeId={employeeId}
            recordKind="medical_record"
            icon={<Activity className="h-5 w-5" />}
            recordLabel="Medical Record"
            submitLabel="Save Medical Record"
            createEmptyForm={initialForm}
            validate={validateMedicalRecord}
            save={async (f) => admission.canDispatch() ? complianceSave.send(null,'create',buildPayload(f),null) : {success: false, error: "Required record checks are not ready"}}
            onSaved={handleAddSaved}
            renderReview={({ form: addForm, setForm: setAddForm, prefillMeta }) => renderMedicalRecordFields(addForm, setAddForm, prefillMeta)}
          />

          <ERPChildDialogForm open={editDialogOpen} onOpenChange={(open) => { if (!admission.isCurrent()) return; if (!open) recordRead.closeDetail(); setEditDialogOpen(open); }} title="Edit Medical Record" icon={<Activity className="h-5 w-5" />} mode="edit" size="lg" isSubmitting={isSubmitting||complianceSave.busy}
        closeDisabled={complianceSave.busy||!!complianceSave.pending} submitDisabled={!admission.ready||complianceSave.blocked} onSubmit={handleEditSubmit}>
        <ComplianceReadPause admission={admission} />
            {renderMedicalRecordFields(form, setForm, null)}
          </ERPChildDialogForm>
        </>
      )}
    </div></QueryReadBoundary></>
  );
}

// ── MAIN COMPLIANCE TAB ───────────────────────────────────────────────────────

export function EmployeeComplianceTab(props: ComplianceTabProps) {
  const principal = JSON.stringify([props.employeeId, props.authContext.profile?.id, props.authContext.profile?.auth_user_id]);
  return <ComplianceSession key={principal} {...props} />;
}

function ComplianceSession({ employeeId, authContext, onChildOpen, onChildLeaseChange }: ComplianceTabProps) {
  const sectionActive = useRecordReadActive();
  const [subjectDenied, setSubjectDenied] = useState(false);
  const denySubject = useCallback(() => {setSubjectDenied(true); onChildOpen?.(false);}, [onChildOpen]);
  const manage = canManage(authContext);
  const medView = canMedicalView(authContext);
  const medManage = canMedicalManage(authContext);

  // HR.14B — check if document-to-record wizard is enabled for this user
  const uiRead1 = useQuery({
    queryKey: ["hr14b", "wizard-enabled", complianceReadIdentity(authContext)],
    enabled: sectionActive && !subjectDenied && manage,
    queryFn: async () => {
      const r = await checkHrDocumentToRecordEnabled();
      return r.data?.enabled ?? false;
    },
    staleTime: 60_000,
  });
  const { data: wizardStatus } = uiRead1;
  const documentWizardEnabled = wizardStatus ?? false;

  if (subjectDenied || !canView(authContext) && !medView) {
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
    <ComplianceChildLeaseContext.Provider value={onChildLeaseChange}>
    <QueryReadBoundary queries={[uiRead1]}><div className="space-y-2">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Compliance Records</h3>
        <Badge variant="secondary" className="text-xs">HR.3</Badge>
      </div>

      {canView(authContext) && <IdentityDocumentsSection authContext={authContext} onSubjectDenied={denySubject} employeeId={employeeId} canManageDoc={manage} onChildOpen={onChildOpen} documentWizardEnabled={documentWizardEnabled} />}
      {medView && <MedicalInsurancesSection authContext={authContext} onSubjectDenied={denySubject} employeeId={employeeId} canManageDoc={medManage} onChildOpen={onChildOpen} documentWizardEnabled={documentWizardEnabled} />}
      {canView(authContext) && <DependentsSection authContext={authContext} onSubjectDenied={denySubject} employeeId={employeeId} canManageDoc={manage} canManageMedical={medManage} onChildOpen={onChildOpen} documentWizardEnabled={documentWizardEnabled} />}
      {canView(authContext) && <AccessCardsSection authContext={authContext} onSubjectDenied={denySubject} employeeId={employeeId} canManageDoc={manage} onChildOpen={onChildOpen} />}
      {canView(authContext) && <TrainingCertificatesSection authContext={authContext} onSubjectDenied={denySubject} employeeId={employeeId} canManageDoc={manage} onChildOpen={onChildOpen} />}
      <MedicalRecordsSection authContext={authContext} onSubjectDenied={denySubject} employeeId={employeeId} canMedView={medView} canMedManage={medManage} onChildOpen={onChildOpen} />
    </div></QueryReadBoundary>
    </ComplianceChildLeaseContext.Provider>
  );
}
