"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { User, LayoutDashboard, FileText, Calendar, Gift, CheckSquare, UserCheck } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import type { CandidateRow } from "@/server/actions/hr/recruitment";
import { createCandidate, updateCandidate } from "@/server/actions/hr/recruitment";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import type { ERPRecordSection } from "@/components/workspace/erp-record-section-nav";
import type { ERPRecordStatusVariant } from "@/components/workspace/erp-record-header";
import { CandidateOverviewTab } from "./tabs/candidate-overview-tab";
import { CandidateProfileTab } from "./tabs/candidate-profile-tab";
import { CandidateDocumentsTab } from "./tabs/candidate-documents-tab";
import { CandidateInterviewsTab } from "./tabs/candidate-interviews-tab";
import { CandidateOffersTab } from "./tabs/candidate-offers-tab";
import { CandidateOnboardingTab } from "./tabs/candidate-onboarding-tab";
import { CandidateConversionTab } from "./tabs/candidate-conversion-tab";

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

export function CandidateWorkspaceForm({ candidate, mode, authContext }: Props) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("overview");
  const [form, setForm] = useState<FormState>(buildInitial(candidate));
  const [isPending, startTransition] = useTransition();
  const [childDialogOpen, setChildDialogOpen] = useState(false);

  const canManage = checkPermission(authContext, "hr.recruitment.manage");
  const canView = checkPermission(authContext, "hr.recruitment.view") || canManage;
  const canCreateEmployee = checkPermission(authContext, "hr.employees.create");

  const isNew = mode === "add";
  const title = isNew ? "New Candidate" : (candidate?.full_name_en ?? "Candidate");
  const subtitle = isNew ? "Add new recruitment candidate" : (candidate?.candidate_code ?? "");

  function handleSave() {
    startTransition(async () => {
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
        expected_salary: form.expected_salary ? parseFloat(form.expected_salary) : null,
        notice_period_days: form.notice_period_days ? parseInt(form.notice_period_days) : null,
        candidate_status: (form.candidate_status as "new" | "screening" | "shortlisted" | "interview" | "selected" | "offered" | "accepted" | "rejected" | "withdrawn" | "hired" | "blacklisted"),
        pipeline_stage: (form.pipeline_stage as "new" | "screening" | "shortlisted" | "interview" | "offer" | "onboarding" | "hired" | "closed"),
        rating: (form.rating as "excellent" | "good" | "average" | "weak" | "not_suitable") || null,
        availability_date: form.availability_date || null,
        notes: form.notes || null,
      };

      if (isNew) {
        const res = await createCandidate(payload);
        if (res.success && res.data) {
          toast.success("Candidate created");
          router.push(`/admin/hr/recruitment/candidates/record/${res.data.id}`);
        } else {
          toast.error(res.error ?? "Failed to create candidate");
        }
      } else if (candidate) {
        const res = await updateCandidate(candidate.id, payload);
        if (res.success) {
          toast.success("Candidate updated");
        } else {
          toast.error(res.error ?? "Failed to update candidate");
        }
      }
    });
  }

  return (
    <ERPRecordWorkspaceForm
      isDirty={false}
      title={title}
      subtitle={subtitle}
      mode={mode}
      sections={SECTIONS}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onSave={canManage ? handleSave : undefined}
      isSubmitting={isPending}
      isChildDialogOpen={childDialogOpen}
      statusVariant={candidate ? candidateStatusVariant(candidate.candidate_status) : "default"}
      statusLabel={candidate ? candidate.candidate_status.replace(/_/g, " ").toUpperCase() : undefined}
    >
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

      <ERPRecordSectionPanel id="profile" activeId={activeSection}>
        <CandidateProfileTab
          form={form}
          setForm={setForm}
          mode={mode}
          canManage={canManage}
        />
      </ERPRecordSectionPanel>

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
