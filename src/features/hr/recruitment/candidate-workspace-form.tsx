"use client";
import { reportWorkspaceFieldErrors } from "@/lib/workspace/field-errors";
import {useWorkspaceSaveSession} from "@/hooks/use-workspace-save-session";

import type { ERPRecordStatusVariant } from "@/components/workspace/erp-record-header";
import type { ERPRecordSection } from "@/components/workspace/erp-record-section-nav";
import { ERPRecordSectionPanel, ERPRecordWorkspaceForm } from "@/components/workspace/erp-record-workspace-form";
import type { AuthContext } from "@/lib/rbac/check";
import type { CandidateRow } from "@/server/actions/hr/recruitment";
import { createCandidate, updateCandidate, getRecruitmentSalaryAccess } from "@/server/actions/hr/recruitment";
import { useQuery } from "@tanstack/react-query";
import { Calendar, CheckSquare, FileText, Gift, LayoutDashboard, User, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceFormOwner } from "@/hooks/use-workspace-form-owner";
import { useWorkspaceFormSection } from "@/hooks/use-workspace-form-section";
import { useWorkspaceControlledDraft, type WorkspaceDraftCodec } from "@/hooks/use-workspace-controlled-draft";
import { createSaveAdmission } from "@/lib/workspace/save-admission";
import { DraftRestoredNotice } from "@/components/workspace/draft-restored-notice";
import { toast } from "sonner";
import { CandidateConversionTab } from "./tabs/candidate-conversion-tab";
import { CandidateDocumentsTab } from "./tabs/candidate-documents-tab";
import { CandidateInterviewsTab } from "./tabs/candidate-interviews-tab";
import { CandidateOffersTab } from "./tabs/candidate-offers-tab";
import { CandidateOnboardingTab } from "./tabs/candidate-onboarding-tab";
import { CandidateOverviewTab } from "./tabs/candidate-overview-tab";
import { CandidateProfileTab } from "./tabs/candidate-profile-tab";

function checkPermission(ctx: AuthContext, code: string): boolean {
  return ctx.permissionCodes.includes(code) || ctx.roleCodes.includes("system_admin") || ctx.roleCodes.includes("group_admin");
}

type Props = {
  candidate?: CandidateRow | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const SECTIONS: ERPRecordSection[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "profile", label: "Profile", icon: User },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "interviews", label: "Interviews", icon: Calendar },
  { id: "offers", label: "Offers", icon: Gift },
  { id: "onboarding", label: "Onboarding", icon: CheckSquare },
  { id: "conversion", label: "Conversion", icon: UserCheck },
];

function candidateStatusVariant(status: string): ERPRecordStatusVariant {
  const map: Record<string, ERPRecordStatusVariant> = {
    new: "default",
    screening: "muted",
    shortlisted: "muted",
    interview: "muted",
    selected: "success",
    offered: "success",
    accepted: "success",
    rejected: "danger",
    withdrawn: "warning",
    hired: "success",
    blacklisted: "danger",
  };
  return map[status] ?? "default";
}

type FormState = {
  full_name_en: string;
  full_name_ar: string;
  requisition_id: number | null;
  gender: string;
  nationality_id: number | null;
  date_of_birth: string;
  mobile_number: string;
  email: string;
  current_location: string;
  source: string;
  agency_name: string;
  referred_by_employee_id: number | null;
  current_employer: string;
  current_position: string;
  expected_salary: string;
  notice_period_days: string;
  candidate_status: string;
  pipeline_stage: string;
  rating: string;
  availability_date: string;
  notes: string;
};

function buildInitial(c?: CandidateRow | null): FormState {
  return {
    full_name_en: c?.full_name_en ?? "",
    full_name_ar: c?.full_name_ar ?? "",
    requisition_id: c?.requisition_id ?? null,
    gender: c?.gender ?? "",
    nationality_id: c?.nationality_id ?? null,
    date_of_birth: c?.date_of_birth ?? "",
    mobile_number: c?.mobile_number ?? "",
    email: c?.email ?? "",
    current_location: c?.current_location ?? "",
    source: c?.source ?? "",
    agency_name: c?.agency_name ?? "",
    referred_by_employee_id: c?.referred_by_employee_id ?? null,
    current_employer: c?.current_employer ?? "",
    current_position: c?.current_position ?? "",
    expected_salary: c?.expected_salary != null ? String(c.expected_salary) : "",
    notice_period_days: c?.notice_period_days != null ? String(c.notice_period_days) : "",
    candidate_status: c?.candidate_status ?? "new",
    pipeline_stage: c?.pipeline_stage ?? "new",
    rating: c?.rating ?? "",
    availability_date: c?.availability_date ?? "",
    notes: c?.notes ?? "",
  };
}

const FORM_ID = "candidate-workspace-form";
const SECTION_IDS = SECTIONS.map(section => section.id);
const NULLABLE_ID_FIELDS = new Set(["requisition_id", "nationality_id", "referred_by_employee_id"]);
const candidateCodec: WorkspaceDraftCodec<FormState> = {
  encode: value => Object.fromEntries(Object.entries(value).map(([field, entry]) => [field, entry == null ? "" : String(entry)])),
  restore: (initial, read) => Object.fromEntries(Object.entries(initial).map(([field, fallback]) => {
    const raw = read(field, fallback);
    const id = Number(raw);
    return [field, NULLABLE_ID_FIELDS.has(field) ? (raw && Number.isSafeInteger(id) && id > 0 ? id : null) : raw];
  })) as FormState,
};

export function CandidateWorkspaceForm(props: Props) {
  return <CandidateWorkspaceFormInstance key={`${props.candidate?.id ?? "new"}:${props.mode}`} {...props} />;
}

function CandidateWorkspaceFormInstance({ candidate, mode, authContext }: Props) {
  const router = useRouter();
  const owner = useWorkspaceFormOwner();
  const {closeTab, markDirty, updateTabRoute, isTabActive} = useWorkspace();
  const [activeSection, setActiveSection] = useWorkspaceFormSection(FORM_ID, "overview", SECTION_IDS);
  const [isPending, setIsPending] = useState(false);
  const [admission] = useState(createSaveAdmission);
  const saveSession = useWorkspaceSaveSession(FORM_ID, candidate?.id ?? null, candidate?.workspace_revision);
  const savedId = useRef(saveSession.id);
  const [childDialogOpen, setChildDialogOpen] = useState(false);

  const canManage = checkPermission(authContext, "hr.recruitment.manage");
  const editable = canManage && mode !== "view";
  const {value: form, setValue: setForm, isDirty, acceptSaved, restoredFromDraft, getCurrent} = useWorkspaceControlledDraft({
    formId: FORM_ID, initialValue: buildInitial(candidate), codec: candidateCodec, enabled: editable,
  });
  const canView = checkPermission(authContext, "hr.recruitment.view") || canManage;
  const canCreateEmployee = checkPermission(authContext, "hr.employees.create");
  const {data:salaryAccess}=useQuery({queryKey:['security','recruitment-salary',form.requisition_id],
    queryFn:()=>getRecruitmentSalaryAccess(form.requisition_id),retry:false,staleTime:0,gcTime:0});
  const canManageSalary=salaryAccess?.success===true&&salaryAccess.data?.canManage===true;

  const isNew = mode === "add";
  const title = isNew ? "New Candidate" : (candidate?.full_name_en ?? "Candidate");
  const subtitle = isNew ? "Add new recruitment candidate" : (candidate?.candidate_code ?? "");

  async function handleSave(closeAfter = false): Promise<boolean> {
    if (!editable || !admission.enter()) return false;
    setIsPending(true);
    const submitted = getCurrent();
    const submittedForm = document.getElementById(FORM_ID);
    try {
      if (!submitted.full_name_en.trim()) {
        setActiveSection("profile");
        reportWorkspaceFieldErrors(submittedForm, { full_name_en: "Enter the candidate's name." });
        toast.error("Enter the candidate's name before saving.");
        return false;
      }
      // Freeze the accepted revision; edits made while awaiting the server stay dirty.
      const form = submitted;
      const payload = {
        full_name_en: form.full_name_en,
        full_name_ar: form.full_name_ar || null,
        requisition_id: form.requisition_id,
        gender: (form.gender as "male" | "female") || null,
        nationality_id: form.nationality_id,
        date_of_birth: form.date_of_birth || null,
        mobile_number: form.mobile_number || null,
        email: form.email || null,
        current_location: form.current_location || null,
        source: (form.source as "direct" | "referral" | "agency" | "walk_in" | "online" | "other") || null,
        agency_name: form.agency_name || null,
        referred_by_employee_id: form.referred_by_employee_id,
        current_employer: form.current_employer || null,
        current_position: form.current_position || null,
        ...(canManageSalary?{expected_salary:form.expected_salary?parseFloat(form.expected_salary):null}:{}),
        notice_period_days: form.notice_period_days ? parseInt(form.notice_period_days) : null,
        candidate_status: (form.candidate_status as "new" | "screening" | "shortlisted" | "interview" | "selected" | "offered" | "accepted" | "rejected" | "withdrawn" | "hired" | "blacklisted"),
        pipeline_stage: (form.pipeline_stage as "new" | "screening" | "shortlisted" | "interview" | "offer" | "onboarding" | "hired" | "closed"),
        rating: (form.rating as "excellent" | "good" | "average" | "weak" | "not_suitable") || null,
        availability_date: form.availability_date || null,
        notes: form.notes || null,
      };

      const wasNew = savedId.current === null;
      const result = wasNew ? await createCandidate(payload, saveSession.begin(payload)) : await updateCandidate(savedId.current!, payload, saveSession.begin(payload));
      if (!result.success) { if (!result.uncertain) saveSession.rejected(); reportWorkspaceFieldErrors(submittedForm, result.fieldErrors); toast.error(result.error ?? "Failed to save candidate"); return false; }
      if (!result.data?.revision) { toast.error("Save response incomplete. Retry the same values to reconcile it."); return false; }
      saveSession.accept(result.data);
      if (wasNew) {
        const id = result.data?.id;
        if (!id) { toast.error("The save response is incomplete. Check the candidate list before retrying."); return false; }
        savedId.current = id;
      }
      const unchanged = acceptSaved(submitted);
      const route = `/admin/hr/recruitment/candidates/record/${savedId.current}`;
      if (owner) {
        markDirty(owner.id, !unchanged);
        updateTabRoute(owner.id, route, savedId.current!, "edit");
      }
      toast.success(wasNew ? "Candidate created" : "Candidate updated");
      if (closeAfter && unchanged && owner) closeTab(owner.id, {force:true});
      else if (wasNew && owner && isTabActive(owner.id)) router.replace(route);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The save could not be confirmed. Your input is retained; check the candidate list before retrying.");
      return false;
    } finally { admission.leave(); setIsPending(false); }
  }

  return (
    <ERPRecordWorkspaceForm
      isDirty={isDirty}
      title={title}
      subtitle={subtitle}
      mode={mode}
      sections={SECTIONS}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onSave={editable ? () => handleSave() : undefined}
      onSaveAndClose={editable ? () => handleSave(true) : undefined}
      onRequestClose={() => { if (owner) closeTab(owner.id); }}
      isSubmitting={isPending}
      isChildDialogOpen={childDialogOpen}
      statusVariant={candidate ? candidateStatusVariant(candidate.candidate_status) : "default"}
      statusLabel={candidate ? candidate.candidate_status.replace(/_/g, " ").toUpperCase() : undefined}
    >
      <DraftRestoredNotice visible={editable && restoredFromDraft} />
      <ERPRecordSectionPanel id="overview" activeId={activeSection}>
        {candidate && (
          <CandidateOverviewTab
            candidate={candidate}
            canManage={canManage}
          />
        )}
        {isNew && (
          <div className="p-6 text-muted-foreground text-sm">Fill the Profile tab to create a new candidate.</div>
        )}
      </ERPRecordSectionPanel>

      <form id={FORM_ID} onSubmit={event => { event.preventDefault(); void handleSave(); }}>
      <ERPRecordSectionPanel id="profile" activeId={activeSection}>
        <CandidateProfileTab
          form={form}
          setForm={setForm}
          mode={mode}
          canManage={canManage}
          canManageSalary={canManageSalary}
        />
      </ERPRecordSectionPanel>
      </form>

      <ERPRecordSectionPanel id="documents" activeId={activeSection}>
        {candidate ? (
          <CandidateDocumentsTab
            candidateId={candidate.id}
            canManage={canManage}
            onChildOpen={setChildDialogOpen}
          />
        ) : (
          <div className="p-6 text-muted-foreground text-sm">Save candidate first to manage documents.</div>
        )}
      </ERPRecordSectionPanel>

      <ERPRecordSectionPanel id="interviews" activeId={activeSection}>
        {candidate ? (
          <CandidateInterviewsTab
            candidateId={candidate.id}
            canManage={canManage}
            onChildOpen={setChildDialogOpen}
          />
        ) : (
          <div className="p-6 text-muted-foreground text-sm">Save candidate first to schedule interviews.</div>
        )}
      </ERPRecordSectionPanel>

      <ERPRecordSectionPanel id="offers" activeId={activeSection}>
        {candidate ? (
          <CandidateOffersTab
            candidateId={candidate.id}
            canManage={canManage}
            authContext={authContext}
            defaultCompanyId={salaryAccess?.data?.companyId??null}
            defaultBranchId={salaryAccess?.data?.branchId??null}
            onChildOpen={setChildDialogOpen}
          />
        ) : (
          <div className="p-6 text-muted-foreground text-sm">Save candidate first to manage offers.</div>
        )}
      </ERPRecordSectionPanel>

      <ERPRecordSectionPanel id="onboarding" activeId={activeSection}>
        {candidate ? (
          <CandidateOnboardingTab
            candidateId={candidate.id}
            canManage={canManage}
            onChildOpen={setChildDialogOpen}
          />
        ) : (
          <div className="p-6 text-muted-foreground text-sm">Save candidate first to manage onboarding tasks.</div>
        )}
      </ERPRecordSectionPanel>

      <ERPRecordSectionPanel id="conversion" activeId={activeSection}>
        {candidate ? (
          <CandidateConversionTab
            candidate={candidate}
            canManage={canManage}
            canCreateEmployee={canCreateEmployee}
            onChildOpen={setChildDialogOpen}
          />
        ) : (
          <div className="p-6 text-muted-foreground text-sm">Save candidate first to manage conversion.</div>
        )}
      </ERPRecordSectionPanel>
    </ERPRecordWorkspaceForm>
  );
}
