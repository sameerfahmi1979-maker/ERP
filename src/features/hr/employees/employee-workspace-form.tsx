"use client";

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

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  User, LayoutDashboard, Shield, Clock, Wallet, Briefcase, Zap, FileText, Brain, History,
} from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";

function checkPermission(ctx: AuthContext, code: string): boolean {
  return (
    ctx.permissionCodes.includes(code) ||
    ctx.roleCodes.includes("system_admin") ||
    ctx.roleCodes.includes("group_admin")
  );
}
import type { EmployeeListRow, EmployeeCreateInput, EmployeeUpdateInput } from "@/server/actions/hr/employees";
import { createEmployee, updateEmployee } from "@/server/actions/hr/employees";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import type { ERPRecordSection } from "@/components/workspace/erp-record-section-nav";
import type { ERPRecordStatusVariant } from "@/components/workspace/erp-record-header";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { useWorkspaceTabDirty } from "@/hooks/use-workspace-tab-dirty";
import { Badge } from "@/components/ui/badge";
import { EmployeeOverviewTab } from "./tabs/employee-overview-tab";
import { EmployeeProfileTab, type EmployeeProfileFormState } from "./tabs/employee-profile-tab";
import { EmployeePlaceholderTab } from "./tabs/employee-placeholder-tab";
import { EmployeeComplianceTab } from "./tabs/employee-compliance-tab";
import { EmployeeTimeTab } from "./tabs/employee-time-tab";
import { EmployeePayrollTab } from "./tabs/employee-payroll-tab";
import { EmployeeOperationsTab } from "./tabs/employee-operations-tab";
import { EmployeeHrActionsTab } from "./tabs/employee-hr-actions-tab";
import { DmsEntityDocumentsTab } from "@/features/dms/entity-documents";
import { HrLetterGenerator } from "@/features/report-center/hr-letter-generator";
import { HrAiReviewTab } from "@/features/hr/ai/hr-ai-review-tab";

const FORM_ID = "employee-workspace-form";

// Draft denylist — defensive exclusions for future sensitive fields
const DRAFT_DENYLIST = [
  "passport_number",
  "emirates_id_number",
  "iban",
  "account_number",
  "salary",
  "medical_result",
  "restriction_details",
  "disciplinary_details",
];

type Props = {
  employee?: EmployeeListRow | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
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

function buildInitialFormState(employee: EmployeeListRow | null | undefined): EmployeeProfileFormState {
  return {
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

export function EmployeeWorkspaceForm({ employee, mode, authContext }: Props) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab, renameTab, updateTabRoute } = useWorkspace();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const [childDialogOpen, setChildDialogOpen] = useState(false);
  const [comboboxForm, setComboboxForm] = useState<EmployeeProfileFormState>(
    buildInitialFormState(employee)
  );

  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const isAdding = mode === "add";
  const disabled = isViewing;

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  useWorkspaceTabDirty({ isDirty, enabled: !isViewing });

  const { getDraftDefault, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({
    formId: FORM_ID,
    enabled: !isViewing,
    entityType: "employee",
    entityId: employee?.id ?? null,
  });

  // When employee changes (e.g. after redirect on create), re-init combobox form
  useEffect(() => {
    setComboboxForm(buildInitialFormState(employee));
  }, [employee?.id]);

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const gatherFormData = (): Record<string, unknown> => {
    const formEl = document.getElementById(FORM_ID) as HTMLFormElement | null;
    if (!formEl) return {};
    const fd = new FormData(formEl);

    const str = (k: string) => (fd.get(k) as string) || null;
    const date = (k: string) => (fd.get(k) as string) || null;
    const num = (k: string) => {
      const v = fd.get(k) as string;
      return v ? parseInt(v, 10) : null;
    };

    return {
      full_name_en: (fd.get("full_name_en") as string) || "",
      full_name_ar: str("full_name_ar"),
      known_name: str("known_name"),
      gender: comboboxForm.gender || "male",
      nationality_id: comboboxForm.nationality_id,
      date_of_birth: date("date_of_birth") || "",
      marital_status: comboboxForm.marital_status || null,
      mobile_number: (fd.get("mobile_number") as string) || "",
      personal_email: str("personal_email"),
      uae_address: str("uae_address"),
      home_country_address: str("home_country_address"),
      blood_group: comboboxForm.blood_group || null,
      // Employment
      owner_company_id: comboboxForm.owner_company_id ?? 0,
      branch_id: comboboxForm.branch_id,
      department_id: comboboxForm.department_id,
      designation_id: comboboxForm.designation_id,
      employee_category_id: comboboxForm.employee_category_id,
      employment_type_id: comboboxForm.employment_type_id,
      joining_date: date("joining_date") || "",
      actual_joining_date: date("actual_joining_date"),
      employee_status: comboboxForm.employee_status || "active",
      reporting_manager_id: comboboxForm.reporting_manager_id,
      supervisor_id: comboboxForm.supervisor_id,
      primary_work_site_id: comboboxForm.primary_work_site_id,
      sponsor_company_id: comboboxForm.sponsor_company_id,
      mohre_establishment_id: comboboxForm.mohre_establishment_id,
      // Contract
      contract_type: comboboxForm.contract_type || null,
      contract_start_date: date("contract_start_date"),
      contract_end_date: date("contract_end_date"),
      probation_start_date: date("probation_start_date"),
      probation_end_date: date("probation_end_date"),
      notice_period_days: num("notice_period_days"),
      // Emergency
      emergency_contact_name: (fd.get("emergency_contact_name") as string) || "",
      emergency_contact_mobile: (fd.get("emergency_contact_mobile") as string) || "",
      emergency_contact_relationship_type_id: comboboxForm.emergency_contact_relationship_type_id,
    };
  };

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    setIsSubmitting(true);
    try {
      const data = gatherFormData();

      let result;
      if (isAdding) {
        result = await createEmployee(data as EmployeeCreateInput);
      } else {
        result = await updateEmployee(employee!.id, data as EmployeeUpdateInput);
      }

      if (result.success) {
        toast.success(isAdding ? "Employee created" : "Employee updated");
        clearDraft();
        resetDirty();
        if (isAdding && (result as { data?: { id: number; employee_code: string } }).data?.id) {
          const newId = (result as { data?: { id: number } }).data!.id;
          const employeeCode = (result as { data?: { employee_code?: string } }).data?.employee_code ?? "";
          const displayName = (data.full_name_en as string) || employeeCode;
          const newRoute = `/admin/hr/employees/record/${newId}?mode=edit`;
          if (activeTab?.id) {
            renameTab(activeTab.id, `Employee — ${displayName}`, employeeCode);
            updateTabRoute(activeTab.id, newRoute, newId, "edit");
          }
          router.replace(newRoute);
        }
        // Ensure the employees list re-fetches fresh data once the tab is returned to.
        router.refresh();
        return true;
      }
      toast.error(result.error ?? "Failed to save employee");
      return false;
    } catch {
      toast.error("An unexpected error occurred");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndClose = async () => {
    const ok = await handleSave();
    if (ok) {
      forceCloseActiveTab();
      router.refresh();
    }
  };

  const employeeStatus = employee?.employee_status;
  const statusLabel = employeeStatus ? STATUS_LABEL[employeeStatus] ?? employeeStatus : undefined;
  const statusVariant = employeeStatus ? STATUS_VARIANT[employeeStatus] ?? "outline" : undefined;

  const profileTabProps = {
    employee: employee ?? null,
    mode,
    formId: FORM_ID,
    getDraftDefault,
    syncDraft,
    writeDraftField,
    form: comboboxForm,
    setForm: setComboboxForm,
  };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
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
      onSave={isViewing ? undefined : handleSave}
      onSaveAndClose={isViewing ? undefined : handleSaveAndClose}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
      isChildDialogOpen={childDialogOpen}
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault();
          handleSaveAndClose();
        }}
        onInput={syncDraft}
        onChange={syncDraft}
      >
        {/* Overview — lazyMount: many useQuery hooks; mounts on first paint (default section) */}
        <ERPRecordSectionPanel id="overview" activeId={activeSection} title="Overview" lazyMount>
          {employee ? (
            <EmployeeOverviewTab
              employee={employee}
              canViewCompliance={checkPermission(authContext, "hr.compliance.view")}
              canViewTime={checkPermission(authContext, "hr.attendance.view")}
              canViewPayroll={checkPermission(authContext, "hr.payroll.view")}
              canViewOperations={checkPermission(authContext, "hr.assignments.view")}
              canViewHrActions={checkPermission(authContext, "hr.actions.view")}
              canViewRecruitment={checkPermission(authContext, "hr.recruitment.view") || checkPermission(authContext, "hr.recruitment.manage")}
            />
          ) : (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Save the employee first to view the overview.
            </div>
          )}
        </ERPRecordSectionPanel>

        {/* Profile */}
        <ERPRecordSectionPanel id="profile" activeId={activeSection} title="Employee Profile">
          <EmployeeProfileTab {...profileTabProps} />
        </ERPRecordSectionPanel>

        {/* Compliance — HR.3 */}
        <ERPRecordSectionPanel id="compliance" activeId={activeSection} title="Compliance" lazyMount>
          {employee ? (
            <EmployeeComplianceTab
              employeeId={employee.id}
              authContext={authContext}
              onChildOpen={setChildDialogOpen}
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

        {/* Letters & Forms — HR.11 / REPORT.4 */}
        <ERPRecordSectionPanel id="letters" activeId={activeSection} title="Generate Letters & Forms" lazyMount>
          {employee ? (
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-3">
                Generate official HR letters, certificates, and forms for this employee.
                Each document opens in the global Report Center and can be exported as PDF or printed.
              </p>
              <HrLetterGenerator
                employeeId={employee.id}
                employeeName={employee.full_name_en ?? undefined}
                canViewPayroll={checkPermission(authContext, "hr.payroll.view")}
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
          <EmployeePlaceholderTab
            title="Employee Audit Timeline"
            description="Employee audit timeline will be expanded in later phases. HR.2 logs employee create/update/archive/status events."
            availableIn="HR.3+"
          />
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
