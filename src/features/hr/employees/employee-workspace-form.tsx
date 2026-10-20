"use client";
import { reportWorkspaceFieldErrors } from "@/lib/workspace/field-errors";
import {useEmployeeSaveSession} from './use-employee-save-session';
import {useReadLifetime} from '@/hooks/use-read-lifetime';
import {hasHrReadCapability,hrReadIdentity} from '@/lib/reads/hr-read-identity';
import {EmployeeSaveRecovery} from './employee-save-recovery';
import type {NotificationTaskContext} from '@/lib/notifications/task-context';
import {NotificationTaskContextCard} from '@/features/notifications/notification-task-context';

/**
 * EmployeeWorkspaceForm — HR.2
 *
 * Full workspace record form for Employee Master.
 * Uses ERPRecordWorkspaceForm (UI.4C).
 *
 * Sections:
 *   Overview      — read-only summary + future placeholders
 *   Profile       — editable personal/employment/contract/emergency data
 *   Compliance    — placeholder (HR.3)
 *   Time          — placeholder (HR.4)
 *   Payroll & WPS — placeholder (HR.5)
 *   Operations    — placeholder (HR.6)
 *   HR Actions    — placeholder (HR.7)
 *   Documents     — placeholder (HR.3+)
 *   AI Review     — placeholder (HR.12)
 *   Audit         — placeholder
 */

import { DraftRestoredNotice } from "@/components/workspace/draft-restored-notice";
import type { ERPRecordStatusVariant } from "@/components/workspace/erp-record-header";
import type { ERPRecordSection } from "@/components/workspace/erp-record-section-nav";
import { ERPRecordSectionPanel, ERPRecordWorkspaceForm } from "@/components/workspace/erp-record-workspace-form";
import { DmsEntityDocumentsTab } from "@/features/dms/entity-documents";
import { HrAiReviewTab } from "@/features/hr/ai/hr-ai-review-tab";
import { EmployeeLettersForms } from "@/features/hr/employees/employee-letters-forms";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceFormOwner } from "@/hooks/use-workspace-form-owner";
import { useWorkspaceFormSection } from "@/hooks/use-workspace-form-section";
import { useWorkspaceControlledDraft, type WorkspaceDraftCodec } from "@/hooks/use-workspace-controlled-draft";
import { createSaveAdmission } from "@/lib/workspace/save-admission";
import type { AuthContext } from "@/lib/rbac/check";
import { hasPermission } from "@/lib/rbac/scope";
import type { EmployeeCreateInput, EmployeeListRow, EmployeeUpdateInput } from "@/server/actions/hr/employees";
import { createEmployee, updateEmployee } from "@/server/actions/hr/employees";
import {
  Brain,
  Briefcase,
  Clock,
  FileText,
  History,
  LayoutDashboard, Shield,
  User,
  Wallet,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateHrEmployee, invalidateHrEmployees } from "@/lib/query/invalidation";
import { toast } from "sonner";
import { EmployeeComplianceTab } from "./tabs/employee-compliance-tab";
import { EmployeeHrActionsTab } from "./tabs/employee-hr-actions-tab";
import { EmployeeOperationsTab } from "./tabs/employee-operations-tab";
import { EmployeeOverviewTab } from "./tabs/employee-overview-tab";
import {EmployeeEmploymentHistory} from './employee-employment-history';
import { EmployeePayrollTab } from "./tabs/employee-payroll-tab";
import { EmployeeProfileTab, type EmployeeProfileFormState } from "./tabs/employee-profile-tab";
import { EmployeeTimeTab } from "./tabs/employee-time-tab";

function checkPermission(ctx: AuthContext, code: string): boolean {
  return hasPermission(ctx, code);
}

const FORM_ID = "employee-workspace-form";

type Props = {
  employee?: EmployeeListRow | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  notificationTask?:NotificationTaskContext;
};

const SECTIONS: ERPRecordSection[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "profile", label: "Profile", icon: User },
  { id: "compliance", label: "Compliance", icon: Shield },
  { id: "time", label: "Time", icon: Clock },
  { id: "payroll", label: "Payroll & WPS", icon: Wallet },
  { id: "operations", label: "Operations", icon: Briefcase },
  { id: "hr-actions", label: "HR Actions", icon: Zap },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "letters", label: "Letters & Forms", icon: FileText },
  { id: "ai-review", label: "AI Review", icon: Brain },
  { id: "audit", label: "Audit", icon: History },
];

const STATUS_VARIANT: Record<string, ERPRecordStatusVariant> = {
  active: "success",
  probation: "warning",
  on_leave: "warning",
  inactive: "muted",
  suspended: "danger",
  terminated: "danger",
  archived: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  probation: "Probation",
  on_leave: "On Leave",
  inactive: "Inactive",
  suspended: "Suspended",
  terminated: "Terminated",
  archived: "Archived",
};

/** Combobox fields holding numeric ids — used to type draft values back (WS.3). */
const COMBOBOX_NUMERIC_FIELDS = new Set<keyof EmployeeProfileFormState>([
  "owner_company_id",
  "branch_id",
  "department_id",
  "designation_id",
  "employee_category_id",
  "employment_type_id",
  "nationality_id",
  "reporting_manager_id",
  "supervisor_id",
  "primary_work_site_id",
  "sponsor_company_id",
  "mohre_establishment_id",
  "emergency_contact_relationship_type_id",
]);

const SECTION_IDS = SECTIONS.map(section => section.id);
const employeeCodec: WorkspaceDraftCodec<EmployeeProfileFormState> = {
  encode: value => Object.fromEntries(Object.entries(value).map(([field, entry]) => [field, entry == null ? "" : String(entry)])),
  restore: (initial, read) => Object.fromEntries(Object.entries(initial).map(([field, fallback]) => {
    const raw = read(field, fallback);
    const id = Number(raw);
    return [field, COMBOBOX_NUMERIC_FIELDS.has(field as keyof EmployeeProfileFormState)
      ? (raw && Number.isSafeInteger(id) && id > 0 ? id : null) : raw];
  })) as EmployeeProfileFormState,
};

function buildInitialFormState(employee: EmployeeListRow | null | undefined): EmployeeProfileFormState {
  return {
    employment_change_reason: '',
    employment_effective_date: '',
    full_name_en: employee?.full_name_en ?? "",
    full_name_ar: employee?.full_name_ar ?? "",
    known_name: employee?.known_name ?? "",
    date_of_birth: employee?.date_of_birth ?? "",
    mobile_number: employee?.mobile_number ?? "",
    personal_email: employee?.personal_email ?? "",
    uae_address: employee?.uae_address ?? "",
    home_country_address: employee?.home_country_address ?? "",
    joining_date: employee?.joining_date ?? "",
    actual_joining_date: employee?.actual_joining_date ?? "",
    contract_start_date: employee?.contract_start_date ?? "",
    contract_end_date: employee?.contract_end_date ?? "",
    probation_start_date: employee?.probation_start_date ?? "",
    probation_end_date: employee?.probation_end_date ?? "",
    notice_period_days: employee?.notice_period_days == null ? "" : String(employee.notice_period_days),
    emergency_contact_name: employee?.emergency_contact_name ?? "",
    emergency_contact_mobile: employee?.emergency_contact_mobile ?? "",
    owner_company_id: employee?.owner_company_id ?? null,
    branch_id: employee?.branch_id ?? null,
    department_id: employee?.department_id ?? null,
    designation_id: employee?.designation_id ?? null,
    employee_category_id: employee?.employee_category_id ?? null,
    employment_type_id: employee?.employment_type_id ?? null,
    employee_status: employee?.employee_status ?? "active",
    nationality_id: employee?.nationality_id ?? null,
    reporting_manager_id: employee?.reporting_manager_id ?? null,
    supervisor_id: employee?.supervisor_id ?? null,
    primary_work_site_id: employee?.primary_work_site_id ?? null,
    sponsor_company_id: employee?.sponsor_company_id ?? null,
    mohre_establishment_id: employee?.mohre_establishment_id ?? null,
    gender: employee?.gender ?? "",
    marital_status: employee?.marital_status ?? "",
    blood_group: employee?.blood_group ?? "",
    contract_type: employee?.contract_type ?? "",
    emergency_contact_relationship_type_id: employee?.emergency_contact_relationship_type_id ?? null,
  };
}

export function EmployeeWorkspaceForm(props: Props) {
  return <EmployeeWorkspaceFormInstance key={`${props.authContext.profile?.id ?? 'none'}:${props.authContext.profile?.auth_user_id ?? 'none'}:${props.employee?.id ?? "new"}:${props.mode}`} {...props} />;
}

function EmployeeWorkspaceFormInstance({ employee, mode, authContext,notificationTask }: Props) {
  const { closeTab, markDirty, updateTabRoute, isTabActive } = useWorkspace();
  const owner = useWorkspaceFormOwner();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useWorkspaceFormSection(FORM_ID, employee ? "overview" : "profile", SECTION_IDS);
  const [childDialogOpen, setChildDialogOpen] = useState(false);
  const [complianceChildLeases, setComplianceChildLeases] = useState<Set<object>>(() => new Set());
  const handleComplianceChildLease = useCallback((token: object, open: boolean) => {
    setComplianceChildLeases(previous => {
      if (previous.has(token) === open) return previous;
      const next = new Set(previous);
      if (open) next.add(token); else next.delete(token);
      return next;
    });
  }, []);
  const [admission] = useState(createSaveAdmission);
  const actor = `${authContext.profile?.id ?? 'none'}:${authContext.profile?.auth_user_id ?? 'none'}`;
  const formId = `${FORM_ID}:actor:${actor}`;
  const recoveryScope = `f11-employee:${actor}:record:${employee?.id ?? owner?.id ?? 'new'}`;
  const saveSession = useEmployeeSaveSession(formId, employee?.id ?? null, employee?.workspace_revision, actor, {
    retirementScope: recoveryScope, recordScope: id => `f11-employee:${actor}:record:${id}`,
  });
  const identity = hrReadIdentity(authContext), lifetime = useReadLifetime(identity);
  const mounted = useRef(false);
  const openingIdentity = useRef(identity);
  const [, showRetirement] = useState(0);
  const canRead = authContext.isAccountActive && !authContext.profile?.must_change_password && (employee
    ? hasHrReadCapability(authContext, 'hr.employees.view') || hasHrReadCapability(authContext, 'hr.employee_profile.view')
    : checkPermission(authContext, 'hr.employees.create'));
  const canEdit = canRead && (employee
    ? checkPermission(authContext, 'hr.employees.update') || checkPermission(authContext, 'hr.employee_profile.manage')
    : checkPermission(authContext, 'hr.employees.create'));
  const recordId = useRef(saveSession.id);
  const [savedId, setSavedId] = useState(employee?.id ?? null);
  const isViewing = mode === "view";
  const isAdding = savedId === null;
  const isEditing = !isViewing && !isAdding;
  const {value: form, setValue: setForm, isDirty, acceptSaved, getCurrent, restoredFromDraft, retire, redact} = useWorkspaceControlledDraft({
    formId, initialValue: buildInitialFormState(employee), codec: employeeCodec, enabled: !isViewing,
  });
  useLayoutEffect(() => {
    if (openingIdentity.current !== identity) {
      openingIdentity.current = identity;
      if (saveSession.hasPending) {
        saveSession.retireForAccessLoss();
        // This external memory session has no subscription. Publish its opaque
        // retirement after commit so the receipt-only recovery action appears.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        showRetirement(version => version + 1);
      }
    }
    if (!canRead) {saveSession.retireForAccessLoss(); retire(buildInitialFormState(null));}
    else if (!checkPermission(authContext, 'hr.medical.view') || employee?.medical_field_unavailable) redact({blood_group: ''});
  }, [identity, canRead, authContext, employee?.medical_field_unavailable, saveSession, retire, redact]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (saveSession.hasPending) {saveSession.retireForAccessLoss(); retire(buildInitialFormState(null));}
    };
  }, [saveSession, retire]);

  const handleRequestClose = () => { if (owner) closeTab(owner.id); };

  const handleSave = async (closeAfter = false): Promise<boolean> => {
    if (isViewing || !canEdit || !lifetime.active || saveSession.isRetired || saveSession.requiresReconciliation || !admission.enter()) return false;
    setIsSubmitting(true);
    const submitted = getCurrent();
    let confirmed = false;
    try {
      const formElement = document.getElementById(formId) as HTMLFormElement | null;
      const missingSelection = !submitted.gender ? "gender"
        : !submitted.owner_company_id ? "owner_company_id"
        : !submitted.employee_category_id && (isAdding || employee?.employee_category_id != null) ? "employee_category_id" : null;
      if (!formElement || !formElement.checkValidity() || missingSelection) {
        setActiveSection("profile");
        if (missingSelection) reportWorkspaceFieldErrors(formElement, { [missingSelection]: "Select a value before saving." });
        else requestAnimationFrame(() => formElement?.reportValidity());
        toast.error("Check the required employee fields before saving.");
        return false;
      }
      const data = {
        ...submitted,
        employment_change_reason: submitted.employment_change_reason || undefined,
        employment_effective_date: submitted.employment_effective_date || undefined,
        full_name_ar: submitted.full_name_ar || null,
        known_name: submitted.known_name || null,
        marital_status: submitted.marital_status || null,
        personal_email: submitted.personal_email || null,
        uae_address: submitted.uae_address || null,
        home_country_address: submitted.home_country_address || null,
        // A masked/unavailable unchanged value is not a request to clear a
        // medical fact while saving unrelated profile fields.
        blood_group: employee?.medical_field_unavailable || !checkPermission(authContext,'hr.medical.manage') || submitted.blood_group === (employee?.blood_group ?? '') ? undefined : submitted.blood_group || null,
        actual_joining_date: submitted.actual_joining_date || null,
        contract_type: submitted.contract_type || null,
        contract_start_date: submitted.contract_start_date || null,
        contract_end_date: submitted.contract_end_date || null,
        probation_start_date: submitted.probation_start_date || null,
        probation_end_date: submitted.probation_end_date || null,
        notice_period_days: submitted.notice_period_days ? Number(submitted.notice_period_days) : null,
      };
      const wasNew = recordId.current === null;
      const wasPending = saveSession.hasPending;
      const result = wasNew
        ? await createEmployee(data as EmployeeCreateInput, saveSession.begin(data))
        : await updateEmployee(recordId.current!, data as EmployeeUpdateInput, saveSession.begin(data));
      if (!lifetime.active || saveSession.isRetired) return false;
      if (!result.success) { if (!wasPending && !result.uncertain) saveSession.rejected(); reportWorkspaceFieldErrors(formElement, result.fieldErrors); toast.error(result.error ?? "Failed to save employee"); return false; }
      if (!result.data || !Number.isSafeInteger(result.data.id) || result.data.id <= 0 || (recordId.current !== null && result.data.id !== recordId.current) || !/^[1-9]\d*$/.test(result.data.revision) || typeof result.data.replayed !== 'boolean') { toast.error("Save response incomplete. Retry the same values to reconcile it."); return false; }
      confirmed = true;
      saveSession.accept(result.data);
      if (wasNew) {
        const id = (result as {data?: {id: number}}).data?.id;
        if (!id) { toast.error("The save response is incomplete. Check the employee list before retrying."); return false; }
        recordId.current = id;
        setSavedId(id);
      }
      try {
        invalidateHrEmployees(queryClient);
        invalidateHrEmployee(queryClient, recordId.current!);
        void queryClient.invalidateQueries({queryKey:['hr','employment-history',identity,recordId.current!]});
      } catch {toast.error('Employee saved, but related views could not refresh. Reopen them to see the latest values.');}
      const unchanged = acceptSaved(submitted);
      const route = `/admin/hr/employees/record/${recordId.current}?mode=edit`;
      if (owner) { markDirty(owner.id, !unchanged); updateTabRoute(owner.id, route, recordId.current!, "edit"); }
      toast.success(wasNew ? "Employee created" : "Employee updated");
      if (closeAfter && unchanged && owner) closeTab(owner.id, {force:true});
      else if (wasNew && owner && isTabActive(owner.id)) router.replace(route);
      // Refresh only the owning, unchanged record. Never refresh a destination form.
      else if (unchanged && owner && isTabActive(owner.id)) router.refresh();
      return true;
    } catch (error) {
      if (!lifetime.active || saveSession.isRetired) return false;
      if (confirmed) {toast.error('Employee saved, but this workspace could not finish refreshing. Reopen the latest record before another change.'); return true;}
      toast.error(error instanceof Error ? error.message : "The save could not be confirmed. Your input is retained; check the employee list before retrying.");
      return false;
    } finally { admission.leave(); if (mounted.current) setIsSubmitting(false); }
  };

  const employeeStatus = employee?.employee_status;
  const statusLabel = employeeStatus ? STATUS_LABEL[employeeStatus] ?? employeeStatus : undefined;
  const statusVariant = employeeStatus ? STATUS_VARIANT[employeeStatus] ?? "outline" : undefined;

  const profileTabProps = {
    employee: employee ?? null,
    mode: canEdit ? mode : 'view' as const,
    form,
    setForm,
  };

  if (!canRead) return <p role="alert">Employee access is no longer available. Private drafts have been retired; reopen with current authorization.</p>;
  return (
    <ERPRecordWorkspaceForm
      mode={isViewing ? "view" : isAdding ? "add" : "edit"}
      title={
        isAdding
          ? "New Employee"
          : isEditing
          ? `Edit Employee — ${employee?.employee_code ?? ""}`
          : `Employee — ${employee?.employee_code ?? ""}`
      }
      subtitle={
        isAdding
          ? "Create a new employee record"
          : employee
          ? `${employee.full_name_en}${employee.full_name_ar ? ` / ${employee.full_name_ar}` : ""}`
          : undefined
      }
      recordCode={employee?.employee_code}
      statusLabel={statusLabel}
      statusVariant={statusVariant}
      sections={SECTIONS}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={isDirty}
      onSave={isViewing || !canEdit ? undefined : () => handleSave()}
      onSaveAndClose={isViewing || !canEdit ? undefined : () => handleSave(true)}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
      isChildDialogOpen={childDialogOpen || complianceChildLeases.size > 0}
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        {/* WS.3: visible signal that unsaved values from a previous visit were restored */}
        <DraftRestoredNotice visible={!isViewing && restoredFromDraft} className="mb-3" />
        <EmployeeSaveRecovery key={identity} session={saveSession} scope={saveSession.id === null ? recoveryScope : `f11-employee:${actor}:record:${saveSession.id}`}/>
        {notificationTask&&<NotificationTaskContextCard task={notificationTask} onSection={setActiveSection} blocked={isSubmitting||childDialogOpen||complianceChildLeases.size>0}/>}

        {/* Overview — one authorized read composition; retained after its first mount. */}
        <ERPRecordSectionPanel id="overview" activeId={activeSection} title="Overview" lazyMount>
          {employee ? (
            <EmployeeOverviewTab
              employee={employee}
              authContext={authContext}
            />
          ) : (
            <div className="space-y-3 p-6 text-sm">
              <h3 className="font-semibold">Start with the employee profile</h3>
              <p className="text-muted-foreground">Enter the verified personal, employment and emergency contact details. After saving, return here to review related work and records.</p>
              <button type="button" className="text-primary underline focus-visible:outline-2" onClick={()=>setActiveSection('profile')}>Complete employee profile</button>
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* Profile */}
        <ERPRecordSectionPanel id="profile" activeId={activeSection} title="Employee Profile">
          <EmployeeProfileTab {...profileTabProps} authContext={authContext} canManageMedical={checkPermission(authContext,"hr.medical.manage")} />
        </ERPRecordSectionPanel>

        {/* Compliance — HR.3 */}
        <ERPRecordSectionPanel id="compliance" activeId={activeSection} title="Compliance" lazyMount>
          {employee ? (
            <EmployeeComplianceTab
              employeeId={employee.id}
              authContext={authContext}
              onChildLeaseChange={handleComplianceChildLease}
            />
          ) : (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Save the employee first to manage compliance records.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* Time — HR.4 */}
        <ERPRecordSectionPanel id="time" activeId={activeSection} title="Time" lazyMount>
          {employee ? (
            <EmployeeTimeTab
              employeeId={employee.id}
              authContext={authContext}
              onChildOpen={setChildDialogOpen}
            />
          ) : (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Save the employee first to manage time records.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* Payroll & WPS — HR.5 */}
        <ERPRecordSectionPanel id="payroll" activeId={activeSection} title="Payroll & WPS" lazyMount>
          {employee ? (
            <EmployeePayrollTab
              employeeId={employee.id}
              authContext={authContext}
              onChildOpen={setChildDialogOpen}
            />
          ) : (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Save the employee first to manage payroll records.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* Operations — HR.6 */}
        <ERPRecordSectionPanel id="operations" activeId={activeSection} title="Operations" lazyMount>
          {employee ? (
            <EmployeeOperationsTab
              employeeId={employee.id}
              authContext={authContext}
              onChildOpen={setChildDialogOpen}
            />
          ) : (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Save the employee first to view operations.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* HR Actions — HR.7 */}
        <ERPRecordSectionPanel id="hr-actions" activeId={activeSection} title="HR Actions" lazyMount>
          {employee ? (
            <EmployeeHrActionsTab
              employeeId={employee.id}
              authContext={authContext}
              onChildOpen={setChildDialogOpen}
            />
          ) : (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Save the employee first to manage HR actions.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* Documents — HR.3 */}
        <ERPRecordSectionPanel id="documents" activeId={activeSection} title="Documents" lazyMount>
          {employee ? (
            <DmsEntityDocumentsTab
              authContext={authContext}
              entityType="employee"
              entityId={employee.id}
              entityLabel="Employee"
              canUpload={checkPermission(authContext, "hr.employees.update")}
              canLinkExisting={checkPermission(authContext, "hr.employees.update")}
              canUnlink={checkPermission(authContext, "hr.employees.update")}
            />
          ) : (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Save the employee first to manage documents.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* Letters & Forms — OUTPUT.4 (global output framework first adopter) */}
        <ERPRecordSectionPanel id="letters" activeId={activeSection} title="Letters & Forms" lazyMount>
          {employee ? (
            <div className="p-4">
              <EmployeeLettersForms
                authContext={authContext}
                employeeId={employee.id}
                employeeName={employee.full_name_en ?? undefined}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Save the employee first to generate letters and forms.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* AI Review — HR.12 */}
        <ERPRecordSectionPanel id="ai-review" activeId={activeSection} title="AI Review" lazyMount>
          {employee ? (
            <HrAiReviewTab
              employeeId={employee.id}
              authContext={authContext}
            />
          ) : (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Save the employee first to use AI Review features.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* Audit */}
        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit" lazyMount>
          {employee?<EmployeeEmploymentHistory employeeId={employee.id} authContext={authContext}/>:<p>Complete the employee profile first. Employment history begins when the employee is saved.</p>}
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
