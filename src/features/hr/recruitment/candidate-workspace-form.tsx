"use client";
import { reportWorkspaceFieldErrors } from "@/lib/workspace/field-errors";
import {useWorkspaceSaveSession} from "@/hooks/use-workspace-save-session";
import type {NotificationTaskContext} from '@/lib/notifications/task-context';
import {NotificationTaskContextCard} from '@/features/notifications/notification-task-context';

import type { ERPRecordStatusVariant } from "@/components/workspace/erp-record-header";
import type { ERPRecordSection } from "@/components/workspace/erp-record-section-nav";
import { ERPRecordSectionPanel, ERPRecordWorkspaceForm } from "@/components/workspace/erp-record-workspace-form";
import type { AuthContext } from "@/lib/rbac/check";
import type { CandidateRow } from "@/server/actions/hr/recruitment";
import { createCandidate, updateCandidate } from "@/server/actions/hr/recruitment";
import {useQueryClient} from "@tanstack/react-query";
import {hasPermission} from "@/lib/rbac/scope";
import {useHrCandidateRecord, useCandidateSalaryAccess, candidateRecordKey} from "@/hooks/use-hr-candidate-record";
import type {CandidateRecordInitial, CandidateRecordRead} from "@/lib/reads/hr-candidate-record-schema";
import {Button} from "@/components/ui/button";
import {queryKeys} from "@/lib/query/query-keys";
import { Calendar, CheckSquare, FileText, Gift, LayoutDashboard, User, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import{CandidateProgressControls}from'./candidate-progress-controls';

type Props = {
  candidate?: CandidateRow | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  initialRead?: CandidateRecordInitial;
  notificationTask?:NotificationTaskContext;
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

type CandidateFormLease = {token: object; active: boolean; accessRetired: boolean};
type CandidateSaveAdmission = {lease: CandidateFormLease; requisitionId: number | null; admitted: boolean; canManageSalary: boolean};

export function CandidateWorkspaceForm(props: Props) {
  const read = useHrCandidateRecord(props.candidate?.id ?? null, props.authContext, props.initialRead);
  return <CandidateWorkspaceFormInstance key={`${props.candidate?.id ?? "new"}:${props.mode}`} {...props} read={read} />;
}

function CandidateWorkspaceFormInstance({ candidate: openingCandidate, mode, authContext, read,notificationTask }: Props & {read: ReturnType<typeof useHrCandidateRecord>}) {
  const router = useRouter();
  const owner = useWorkspaceFormOwner();
  const {closeTab, markDirty, updateTabRoute, isTabActive} = useWorkspace();
  const [activeSection, setActiveSection] = useWorkspaceFormSection(FORM_ID, "overview", SECTION_IDS);
  const [isPending, setIsPending] = useState(false);
  const [admission] = useState(createSaveAdmission);
  const saveSession = useWorkspaceSaveSession(FORM_ID, openingCandidate?.id ?? null, openingCandidate?.workspace_revision,
    {retirementScope: openingCandidate ? `hr_candidates:record:${openingCandidate.id}` : "hr_candidates:create", recordScope: id => `hr_candidates:record:${id}`});
  const savedId = useRef(saveSession.id);
  const [childDialogOpen, setChildDialogOpen] = useState(false);

  const candidate = read.data?.candidate;
  const qc = useQueryClient();
  const [privacyRetired, setPrivacyRetired] = useState(false);
  const [salaryRedacted, setSalaryRedacted] = useState(false);
  const [hasShownSalary, setHasShownSalary] = useState(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const canManage = hasPermission(authContext, "hr.recruitment.manage") && (!openingCandidate || read.data?.salaryAccess.canManageCandidate === true);
  const editable = canManage && mode !== "view";
  const {value: form, setValue: setForm, isDirty, acceptSaved, restoredFromDraft, getCurrent, retire, redact} = useWorkspaceControlledDraft({
    formId: FORM_ID, initialValue: buildInitial(openingCandidate), codec: candidateCodec, enabled: hasPermission(authContext, "hr.recruitment.manage") && mode !== "view",
  });
  const canCreateEmployee = hasPermission(authContext, "hr.employees.create");
  const salarySeed = read.data ? {requisitionId: read.data.candidate.requisition_id, access: read.data.salaryAccess, identity: read.identity, updatedAt: read.evidenceUpdatedAt} : undefined;
  const salaryRead = useCandidateSalaryAccess(form.requisition_id, authContext, !read.denied && !privacyRetired && (!openingCandidate || !!read.data),
    salarySeed);
  // A saved null requisition is verified global scope; an unknown subject is
  // not. Offers follow the persisted candidate, independently of Profile edits.
  const savedSalaryRead = useCandidateSalaryAccess(candidate?.requisition_id ?? null, authContext,
    !read.denied && !privacyRetired && !!candidate, salarySeed);
  const salaryAccess = salaryRead.data && candidate?.requisition_id === form.requisition_id && read.data?.salaryAccess.canView === false
    ? {...salaryRead.data, canView: false, canManage: false} : salaryRead.data;
  const canViewSalary = !salaryRedacted && salaryAccess?.canView === true && !salaryRead.denied && !salaryRead.query.isError && !salaryRead.query.isFetching;
  const canManageSalary = canViewSalary && salaryAccess?.canManage === true;
  if (canViewSalary && !hasShownSalary) setHasShownSalary(true);
  const authorized = !read.denied && !privacyRetired && (!openingCandidate || read.verified) && !!salaryAccess && !salaryRead.query.isError && !salaryRead.query.isFetching;
  const offerAuthorized = !read.denied && !privacyRetired && read.verified && !!savedSalaryRead.data;
  const workspaceOwnerId = owner?.id ?? null;
  const ownerToken = useMemo(() => ({owner: read.owner, workspaceOwnerId}), [read.owner, workspaceOwnerId]);
  const [renderedOwnerToken, setRenderedOwnerToken] = useState(ownerToken);
  if (renderedOwnerToken !== ownerToken) {
    setRenderedOwnerToken(ownerToken);
    if (saveSession.hasPending && !saveBlocked) setSaveBlocked(true);
  }
  const lifetime = useRef<CandidateFormLease | null>(null);
  const committedAdmission = useRef<CandidateSaveAdmission | null>(null);
  const redactionCommitted = useRef(false);
  const previousReadIdentity = useRef(read.identity);
  if (read.denied && !privacyRetired) setPrivacyRetired(true);
  useEffect(() => {
    const retiredIdentity = previousReadIdentity.current;
    const identityChanged = retiredIdentity !== read.identity;
    previousReadIdentity.current = read.identity;
    if (!read.denied && !identityChanged) return;
    if (read.denied) {saveSession.retireForAccessLoss(); retire(buildInitial(null));}
    if (openingCandidate) {
      const keys = [queryKeys.recruitment.candidate(openingCandidate.id), queryKeys.recruitment.candidateDocuments(openingCandidate.id),
        queryKeys.recruitment.candidateInterviews(openingCandidate.id), queryKeys.recruitment.candidateOffers(openingCandidate.id),
        queryKeys.recruitment.candidateOnboarding(openingCandidate.id), ["recruitment", "conversion-prep", openingCandidate.id]];
      for (const key of keys) {
        // A capability refresh may already have mounted verified reads for its
        // new identity. Retire only the previous owner, not those new queries.
        // Terminal subject denial still retires every subject projection; the
        // legacy unversioned conversion query retains its existing cleanup.
        const filter = {queryKey: key, ...(identityChanged && !read.denied && key[0] === "hr"
          ? {predicate: (query: {queryKey: readonly unknown[]}) => query.queryKey.length === key.length || query.queryKey[key.length] === retiredIdentity} : {})};
        void qc.cancelQueries(filter); qc.removeQueries(filter);
      }
    }
  }, [read.denied, read.identity, retire, saveSession, openingCandidate, qc]);
  const salaryDenied = salaryAccess?.canView === false || salaryRead.denied;
  const mustRedactSalary = salaryDenied && (salaryRedacted || hasShownSalary || form.expected_salary !== "");
  if (mustRedactSalary && !salaryRedacted) {
    setSalaryRedacted(true);
    if (saveSession.hasPending && !saveBlocked) setSaveBlocked(true);
  }
  useEffect(() => {
    if (!mustRedactSalary) return;
    redact({expected_salary: ""});
    const cached = openingCandidate ? qc.getQueryCache().find<CandidateRecordRead>({queryKey: candidateRecordKey(openingCandidate.id, read.identity), exact: true}) : undefined;
    const previous = cached?.state.data;
    const sameRequisition = previous?.candidate.requisition_id === form.requisition_id;
    // Privacy masking is not a new successful server read: retain its failure,
    // fetch and timestamp metadata while removing the sensitive projection.
    if (cached && previous && (previous.candidate.expected_salary !== null || (sameRequisition && (previous.salaryAccess.canView || previous.salaryAccess.canManage))))
      cached.setState({data: {...previous, candidate: {...previous.candidate, expected_salary: null},
        salaryAccess: sameRequisition ? {...previous.salaryAccess, canView: false, canManage: false} : previous.salaryAccess}});
  }, [mustRedactSalary, redact, openingCandidate, read.identity, form.requisition_id, qc]);

  useLayoutEffect(() => {
    const previous = lifetime.current;
    if (previous && previous.token !== ownerToken) {
      previous.accessRetired = true;
      if (saveSession.hasPending) saveSession.retireForAccessLoss();
    }
    const lease: CandidateFormLease = {token: ownerToken, active: true, accessRetired: false};
    lifetime.current = lease;
    // Ordinary unmount is not access loss. StrictMode may set up a fresh live
    // lease for the same token; an earlier dispatched lease stays inactive.
    return () => {lease.active = false;};
  }, [ownerToken, saveSession]);
  useLayoutEffect(() => {
    const lease = lifetime.current!;
    const newlyRedacted = mustRedactSalary && !redactionCommitted.current;
    redactionCommitted.current ||= mustRedactSalary;
    if (read.denied || privacyRetired || (newlyRedacted && saveSession.hasPending)) {
      lease.accessRetired = true;
      saveSession.retireForAccessLoss();
    }
    committedAdmission.current = {lease, requisitionId: form.requisition_id, canManageSalary,
      admitted: editable && authorized && !saveBlocked && !saveSession.isRetired && !saveSession.requiresReconciliation};
  });

  const isNew = mode === "add";
  const title = isNew ? "New Candidate" : (candidate?.full_name_en ?? "Candidate");
  const subtitle = isNew ? "Add new recruitment candidate" : (candidate?.candidate_code ?? "");

  async function handleSave(closeAfter = false): Promise<boolean> {
    const current = committedAdmission.current;
    if (!current || current.lease.token !== ownerToken || !current.lease.active || current.lease.accessRetired ||
      !current.admitted || saveSession.isRetired || saveSession.requiresReconciliation) return false;
    const submitted = getCurrent();
    // A retained handler must not combine old-scope authority with a newer
    // draft that has not yet received its own committed admission snapshot.
    if (submitted.requisition_id !== current.requisitionId || !admission.enter()) return false;
    const submittedLease = current.lease;
    const isCurrent = () => lifetime.current === submittedLease && submittedLease.active && !submittedLease.accessRetired && !saveSession.isRetired;
    const originalId = savedId.current;
    const originalRecordKey = originalId === null ? null : candidateRecordKey(originalId, read.identity);
    setIsPending(true);
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
        ...(current.canManageSalary?{expected_salary:form.expected_salary?parseFloat(form.expected_salary):null}:{}),
        notice_period_days: form.notice_period_days ? parseInt(form.notice_period_days) : null,
        candidate_status: (form.candidate_status as "new" | "screening" | "shortlisted" | "interview" | "selected" | "offered" | "accepted" | "rejected" | "withdrawn" | "hired" | "blacklisted"),
        pipeline_stage: (form.pipeline_stage as "new" | "screening" | "shortlisted" | "interview" | "offer" | "onboarding" | "hired" | "closed"),
        rating: (form.rating as "excellent" | "good" | "average" | "weak" | "not_suitable") || null,
        availability_date: form.availability_date || null,
        notes: form.notes || null,
      };

      const wasNew = originalId === null;
      const{candidate_status,pipeline_stage,...profilePayload}=payload;void candidate_status;void pipeline_stage;
      const contract = saveSession.begin(wasNew?payload:profilePayload);
      const result = wasNew ? await createCandidate(payload, contract) : await updateCandidate(originalId, profilePayload, contract);
      const receipt = result.success && result.data && Number.isSafeInteger(result.data.id) && result.data.id > 0 &&
        (wasNew || result.data.id === originalId) && /^[1-9]\d*$/.test(result.data.revision) && typeof result.data.replayed === "boolean" ? result.data : undefined;
      if (saveSession.isRetired || submittedLease.accessRetired) {
        saveSession.retireForAccessLoss();
        if (receipt) saveSession.settleRetired(contract.operationId, {receipt});
        else if (!result.success && !result.uncertain) saveSession.settleRetired(contract.operationId, {rolledBack: true});
      } else if (receipt) saveSession.accept(receipt);
      else if (!result.success && !result.uncertain) saveSession.rejected();
      // A confirmed write belongs to its original client/key even after this
      // form retires. Notify before the UI fence, without refetching a successor.
      if (receipt && originalRecordKey) void qc.invalidateQueries({queryKey: originalRecordKey, exact: true, ...(!isCurrent() ? {refetchType: "none" as const} : {})});
      if (!isCurrent()) return false;
      if (!result.success) { reportWorkspaceFieldErrors(submittedForm, result.fieldErrors); toast.error(result.error ?? "Failed to save candidate"); return false; }
      if (!receipt) { toast.error("Save response incomplete. Retry the same values to reconcile it."); return false; }
      if (wasNew) {
        savedId.current = receipt.id;
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
      if (isCurrent()) toast.error(error instanceof Error ? error.message : "The save could not be confirmed. Your input is retained; check the candidate list before retrying.");
      return false;
    } finally { admission.leave(); if (isCurrent()) setIsPending(false); }
  }

  if (read.denied || privacyRetired) return <div role="alert" className="p-6">Candidate information is unavailable for this session. Close this record and reopen it after access is restored.
    {saveSession.requiresReconciliation && <p>An earlier save remains unconfirmed. Its contents were removed for privacy; do not create or submit it again until its outcome is confirmed.</p>}
  </div>;
  if (openingCandidate && !candidate) return <div className="p-6" role={read.query.isError ? "alert" : "status"}>
    {read.query.isError ? <>Candidate record could not be loaded. <Button onClick={() => void read.query.refetch()}>Retry candidate record</Button></> : "Verifying candidate access…"}
  </div>;
  return (<>
    {(read.query.isError || salaryRead.query.isError || savedSalaryRead.query.isError) && <div role="alert" className="p-4">Access could not be refreshed. Your draft is retained; saving is paused.
      <Button onClick={() => {void read.query.refetch(); void salaryRead.query.refetch(); void savedSalaryRead.query.refetch({cancelRefetch: false});}}>Retry candidate access</Button></div>}
    {(saveBlocked || saveSession.requiresReconciliation) && <p role="alert" className="p-4">Saving is blocked after an access change. An earlier operation may be unconfirmed. Reopen only after its outcome is confirmed; do not submit a replacement.</p>}
    {salaryRedacted && salaryAccess?.canView === true && <p role="status" className="p-4">Salary access changed while this form was open. Save any other permitted changes, then reopen the record to load a fresh salary value.</p>}
    <div className="contents" inert={read.query.isError || undefined}><ERPRecordWorkspaceForm
      isDirty={isDirty}
      title={title}
      subtitle={subtitle}
      mode={mode}
      sections={SECTIONS}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onSave={editable && authorized && !saveBlocked ? () => handleSave() : undefined}
      onSaveAndClose={editable && authorized && !saveBlocked ? () => handleSave(true) : undefined}
      onRequestClose={() => { if (owner) closeTab(owner.id); }}
      isSubmitting={isPending}
      isChildDialogOpen={childDialogOpen}
      statusVariant={candidate ? candidateStatusVariant(candidate.candidate_status) : "default"}
      statusLabel={candidate ? candidate.candidate_status.replace(/_/g, " ").toUpperCase() : undefined}
    >
      <DraftRestoredNotice visible={editable && restoredFromDraft} />
      {notificationTask&&!read.query.isError&&<NotificationTaskContextCard task={notificationTask} onSection={setActiveSection} blocked={isPending||childDialogOpen||saveBlocked||saveSession.requiresReconciliation}/>}
      <ERPRecordSectionPanel id="overview" activeId={activeSection}>
        {candidate&&editable&&<CandidateProgressControls candidate={candidate}authContext={authContext}admitted={authorized&&!isPending&&!saveBlocked&&!saveSession.requiresReconciliation}onOpenChange={setChildDialogOpen}/>}
        {candidate && (
          <CandidateOverviewTab
            candidate={candidate}
            canManage={canManage}
            authContext={authContext}
            canViewSalary={canViewSalary}
            onAccessDenied={read.retire}
          />
        )}
        {isNew && (
          <div className="p-6 text-muted-foreground text-sm">Fill the Profile tab to create a new candidate.</div>
        )}
      </ERPRecordSectionPanel>

      <form id={FORM_ID} onSubmit={event => { event.preventDefault(); void handleSave(); }}>
      <ERPRecordSectionPanel id="profile" activeId={activeSection}>
        <CandidateProfileTab
          form={candidate?{...form,candidate_status:candidate.candidate_status,pipeline_stage:candidate.pipeline_stage}:form}
          setForm={setForm}
          mode={mode}
          canManage={canManage}
          canManageSalary={canManageSalary}
          canViewSalary={canViewSalary}
        />
      </ERPRecordSectionPanel>
      </form>

      <ERPRecordSectionPanel id="documents" activeId={activeSection} lazyMount>
        {candidate ? (
          <CandidateDocumentsTab
            authContext={authContext}
            onReadDenied={read.retire}
            candidateId={candidate.id}
            canManage={canManage}
            mutationAdmitted={authorized}
            onRetryMutationAdmission={() => Promise.allSettled([read.query.refetch({cancelRefetch: false}), salaryRead.query.refetch({cancelRefetch: false})])}
            onChildOpen={setChildDialogOpen}
          />
        ) : (
          <div className="p-6 text-muted-foreground text-sm">Save candidate first to manage documents.</div>
        )}
      </ERPRecordSectionPanel>

      <ERPRecordSectionPanel id="interviews" activeId={activeSection} lazyMount>
        {candidate ? (
          <CandidateInterviewsTab
            authContext={authContext}
            onReadDenied={read.retire}
            candidateId={candidate.id}
            canManage={canManage}
            mutationAdmitted={authorized}
            onRetryMutationAdmission={() => Promise.allSettled([read.query.refetch({cancelRefetch: false}), salaryRead.query.refetch({cancelRefetch: false})])}
            onChildOpen={setChildDialogOpen}
          />
        ) : (
          <div className="p-6 text-muted-foreground text-sm">Save candidate first to schedule interviews.</div>
        )}
      </ERPRecordSectionPanel>

      <ERPRecordSectionPanel id="offers" activeId={activeSection} lazyMount>
        {candidate ? (
          <CandidateOffersTab
            onReadDenied={read.retire}
            candidateId={candidate.id}
            canManage={canManage}
            mutationAdmitted={offerAuthorized}
            onRetryMutationAdmission={() => Promise.allSettled([read.query.refetch({cancelRefetch: false}), savedSalaryRead.query.refetch({cancelRefetch: false})])}
            authContext={authContext}
            defaultCompanyId={savedSalaryRead.data?.companyId??null}
            defaultBranchId={savedSalaryRead.data?.branchId??null}
            verifiedPayrollAccess={offerAuthorized ? savedSalaryRead.data : null}
            onChildOpen={setChildDialogOpen}
          />
        ) : (
          <div className="p-6 text-muted-foreground text-sm">Save candidate first to manage offers.</div>
        )}
      </ERPRecordSectionPanel>

      <ERPRecordSectionPanel id="onboarding" activeId={activeSection} lazyMount>
        {candidate ? (
          <CandidateOnboardingTab
            authContext={authContext}
            onReadDenied={read.retire}
            candidateId={candidate.id}
            canManage={canManage}
            mutationAdmitted={authorized}
            onRetryMutationAdmission={() => Promise.allSettled([read.query.refetch({cancelRefetch: false}), salaryRead.query.refetch({cancelRefetch: false})])}
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
            authContext={authContext}
            canManage={canManage}
            canCreateEmployee={canCreateEmployee}
            mutationAdmitted={authorized}
            onRetryMutationAdmission={() => Promise.allSettled([read.query.refetch({cancelRefetch: false}), salaryRead.query.refetch({cancelRefetch: false})])}
            onChildOpen={setChildDialogOpen}
          />
        ) : (
          <div className="p-6 text-muted-foreground text-sm">Save candidate first to manage conversion.</div>
        )}
      </ERPRecordSectionPanel>
    </ERPRecordWorkspaceForm></div></>
  );
}
