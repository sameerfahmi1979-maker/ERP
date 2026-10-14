"use client";
import { useGuardedTransition as useTransition } from "@/hooks/use-guarded-transition";
import { RecordCollection } from "@/components/erp/table/record-collection";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import {CandidateChildReadPause, useCandidateChildReadAdmission, type CandidateChildAdmissionProps} from "../candidate-child-read-admission";

import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { invalidateRecruitmentCandidateReadModels } from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/query-keys";
import {candidateRecordIdentity, type CandidateSalaryAccess} from "@/lib/reads/hr-candidate-record-schema";
import { hasPermissionInScope, hasGlobalPermission } from "@/lib/rbac/scope";
import type {CandidateChildDetailMap, CandidateChildRowMap, CandidateChildPage, CandidateChildDetail} from "@/lib/reads/hr-candidate-children-schema";
import {useHrCandidateChildren, candidateChildPrefix, type CandidateChildReadProps} from "@/hooks/use-hr-candidate-children";
import { archiveOffer, changeOfferStatus, createOffer, updateOffer } from "@/server/actions/hr/recruitment";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Gift, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Props = CandidateChildAdmissionProps & CandidateChildReadProps & {
  candidateId: number;
  canManage: boolean;
  defaultCompanyId: number|null;
  defaultBranchId: number|null;
  /** Fresh exact-scope evidence from the parent; null means unavailable, not denied. */
  verifiedPayrollAccess?: Pick<CandidateSalaryAccess, "companyId" | "branchId" | "canView" | "canManage"> | null;
  onChildOpen?: (open: boolean) => void;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-700",
  approved: "bg-cyan-100 text-cyan-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-orange-100 text-orange-700",
  expired: "bg-rose-100 text-rose-700",
  cancelled: "bg-gray-100 text-gray-700",
};

type OfferForm = {
  offer_status: string;
  offer_date: string;
  valid_until: string;
  proposed_joining_date: string;
  basic_salary: string;
  gross_salary: string;
  currency: string;
  notes: string;
};

const EMPTY_FORM: OfferForm = {
  offer_status: "draft",
  offer_date: "",
  valid_until: "",
  proposed_joining_date: "",
  basic_salary: "",
  gross_salary: "",
  currency: "AED",
  notes: "",
};

export function CandidateOffersTab({ candidateId, canManage, authContext, onReadDenied, defaultCompanyId, defaultBranchId, verifiedPayrollAccess, onChildOpen, mutationAdmitted = true, onRetryMutationAdmission }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CandidateChildDetailMap["offers"] | null>(null);
  const [form, setForm] = useState<OfferForm>(EMPTY_FORM);
  const [editorVersion, setEditorVersion] = useState(0);
  const editorGeneration = useRef(0);
  const [unavailableEditor, setUnavailableEditor] = useState(false);
  const [isPending, startTransition] = useTransition();
  const read = useHrCandidateChildren("offers", candidateId, {authContext, onReadDenied});
  const evidenceIdentity = `${candidateId}:${candidateRecordIdentity(authContext)}`;
  const [verifiedDefaultScope, setVerifiedDefaultScope] = useState({identity: evidenceIdentity, companyId: defaultCompanyId, branchId: defaultBranchId});
  const [retainedPayrollEvidence, setRetainedPayrollEvidence] = useState({identity: evidenceIdentity, access: verifiedPayrollAccess});
  const [salaryRetired, setSalaryRetired] = useState(false);
  const [salaryWasVisible, setSalaryWasVisible] = useState(false);
  // A temporary parent capability fetch may omit its default scope. It is not
  // evidence that a previously permitted salary draft has lost view permission.
  const nextDefaultScope = mutationAdmitted ? {identity: evidenceIdentity, companyId: defaultCompanyId, branchId: defaultBranchId}
    : verifiedDefaultScope.identity === evidenceIdentity ? verifiedDefaultScope : {identity: evidenceIdentity, companyId: null, branchId: null};
  if (verifiedDefaultScope.identity !== nextDefaultScope.identity || verifiedDefaultScope.companyId !== nextDefaultScope.companyId || verifiedDefaultScope.branchId !== nextDefaultScope.branchId) {
    setVerifiedDefaultScope(nextDefaultScope);
  }
  const payrollEvidence = verifiedPayrollAccess ?? (retainedPayrollEvidence.identity === evidenceIdentity ? retainedPayrollEvidence.access : null);
  if (retainedPayrollEvidence.identity !== evidenceIdentity || retainedPayrollEvidence.access?.companyId !== payrollEvidence?.companyId
    || retainedPayrollEvidence.access?.branchId !== payrollEvidence?.branchId || retainedPayrollEvidence.access?.canView !== payrollEvidence?.canView
    || retainedPayrollEvidence.access?.canManage !== payrollEvidence?.canManage) {
    setRetainedPayrollEvidence({identity: evidenceIdentity, access: payrollEvidence});
  }
  const salaryCompany=editing?editing.owner_company_id:mutationAdmitted?defaultCompanyId:verifiedDefaultScope.identity===evidenceIdentity?verifiedDefaultScope.companyId:null;
  const salaryBranch=editing?editing.branch_id:mutationAdmitted?defaultBranchId:verifiedDefaultScope.identity===evidenceIdentity?verifiedDefaultScope.branchId:null;
  const salaryAllowedInScope = useCallback((code: "hr.payroll.view" | "hr.payroll.manage", companyId: number|null, branchId: number|null,
    offerProof?: CandidateChildRowMap["offers"]["salaryAccess"]) => {
    const permitted = companyId === null ? hasGlobalPermission(authContext, code) : hasPermissionInScope(authContext, code, companyId, branchId);
    const proof = payrollEvidence?.companyId === companyId && payrollEvidence.branchId === branchId ? payrollEvidence : null;
    return permitted && (!proof || (proof.canView && (code === "hr.payroll.view" || proof.canManage)))
      && (!offerProof || offerProof.companyId === companyId && offerProof.branchId === branchId && offerProof.canView && (code === "hr.payroll.view" || offerProof.canManage));
  }, [authContext, payrollEvidence]);
  const currentOffer = editing && (read.activeDetail?.id === editing.id ? read.activeDetail : read.rows.find(row => row.id === editing.id));
  // Only a verified exact-offer projection replaces earlier evidence. Temporary
  // page/detail failure pauses dispatch without retiring an otherwise lawful draft.
  const offerProof = currentOffer?.salaryAccess ?? editing?.salaryAccess;
  const canViewSalary=salaryAllowedInScope('hr.payroll.view',salaryCompany,salaryBranch,offerProof);
  const canManageSalary=canViewSalary&&!salaryRetired&&salaryAllowedInScope('hr.payroll.manage',salaryCompany,salaryBranch,offerProof);
  const currentSalary = useRef({canManage: false, basic: "", gross: ""});
  useLayoutEffect(() => {
    currentSalary.current = {canManage: canManageSalary, basic: canViewSalary && !salaryRetired ? form.basic_salary : "",
      gross: canViewSalary && !salaryRetired ? form.gross_salary : ""};
    return () => {currentSalary.current = {canManage: false, basic: "", gross: ""};};
  }, [canManageSalary, canViewSalary, salaryRetired, form.basic_salary, form.gross_salary]);
  const redactOffer = useCallback(<T extends CandidateChildRowMap["offers"]>(offer: T): T => {
    const freshProof = read.activeDetail?.id === offer.id ? read.activeDetail.salaryAccess : offer.salaryAccess;
    const allowed = salaryAllowedInScope("hr.payroll.view", offer.owner_company_id, offer.branch_id, freshProof);
    return allowed || (offer.basic_salary === null && (!("gross_salary" in offer) || offer.gross_salary === null)) ? offer
      : {...offer, basic_salary: null, ...("gross_salary" in offer ? {gross_salary: null} : {}), salaryAccess: {...offer.salaryAccess, canView: false, canManage: false}};
  }, [salaryAllowedInScope, read.activeDetail]);

  const offers = read.rows.map(redactOffer);
  const mutation = useCandidateChildReadAdmission({canManage, mutationAdmitted, reads: read.reads, onRetryMutationAdmission});
  const {detailUnavailable, closeDetail} = read;
  useEffect(() => {
    if (!detailUnavailable) return;
    setEditorVersion(++editorGeneration.current); setEditing(null); setForm(EMPTY_FORM);
    setDialogOpen(false); setUnavailableEditor(true); closeDetail(); onChildOpen?.(false);
    setSalaryRetired(true); setSalaryWasVisible(false);
  }, [detailUnavailable, closeDetail, onChildOpen]);
  if (canViewSalary && !salaryWasVisible) setSalaryWasVisible(true);
  if (!canViewSalary && (salaryWasVisible || form.basic_salary || form.gross_salary || editing?.basic_salary != null || editing?.gross_salary != null)) {
    if (!salaryRetired) setSalaryRetired(true);
    if (form.basic_salary || form.gross_salary) setForm({...form, basic_salary: "", gross_salary: ""});
    if (editing && (editing.basic_salary != null || editing.gross_salary != null)) setEditing({...editing, basic_salary: null, gross_salary: null,
      salaryAccess: {...editing.salaryAccess, canView: false, canManage: false}});
  }
  useEffect(() => {
    const queries = queryClient.getQueryCache().findAll({queryKey: [...candidateChildPrefix("offers", candidateId), read.identity]});
    for (const query of queries) {
      const cached = query.state.data as {success: true; data: CandidateChildPage | CandidateChildDetail} | undefined;
      if (!cached?.success || cached.data.kind !== "offers") continue;
      const data = cached.data;
      if (data.operation === "page") {
        const previous = data.rows as CandidateChildRowMap["offers"][], rows = previous.map(redactOffer);
        if (rows.some((row, index) => row !== previous[index])) query.setState({data: {...cached, data: {...data, rows}}});
      } else if ("row" in data) {
        const previous = data.row as CandidateChildDetailMap["offers"], row = redactOffer(previous);
        if (row !== previous) query.setState({data: {...cached, data: {...data, row}}});
      }
    }
    // setState preserves each query's error/fetch state and original timestamp.
  }, [queryClient, candidateId, read.identity, redactOffer, read.query.data, read.detailQuery.data]);

  function openAdd() {
    if (!mutation.canDispatch()) return;
    setEditorVersion(++editorGeneration.current); setUnavailableEditor(false);
    read.closeDetail();
    setSalaryRetired(false); setSalaryWasVisible(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
    onChildOpen?.(true);
  }

  async function openEdit(row: CandidateChildRowMap["offers"]) {
    if (!mutation.canDispatch()) return;
    const detail = await read.loadDetail(row.id);
    if (!detail) return;
    setEditorVersion(++editorGeneration.current); setUnavailableEditor(false);
    const offer = redactOffer(detail);
    setSalaryRetired(false); setSalaryWasVisible(false);
    setEditing(offer);
    setForm({
      offer_status: offer.offer_status,
      offer_date: offer.offer_date ?? "",
      valid_until: offer.valid_until ?? "",
      proposed_joining_date: offer.proposed_joining_date ?? "",
      basic_salary: offer.basic_salary != null ? String(offer.basic_salary) : "",
      gross_salary: offer.gross_salary != null ? String(offer.gross_salary) : "",
      currency: offer.currency,
      notes: offer.notes ?? "",
    });
    setDialogOpen(true);
    onChildOpen?.(true);
  }

  function closeDialog() {
    if (editorVersion !== editorGeneration.current) return;
    setEditorVersion(++editorGeneration.current);
    read.closeDetail();
    setDialogOpen(false);
    onChildOpen?.(false);
  }

  const set = (key: keyof OfferForm, value: string) => setForm((p) => ({ ...p, [key]: value }));

  function handleSave() {
    if (!dialogOpen || editorVersion !== editorGeneration.current || !mutation.canDispatch()) return;
    startTransition(async () => {
      if (!dialogOpen || editorVersion !== editorGeneration.current || !mutation.canDispatch()) return;
      const payload = {
        offer_status: form.offer_status as "draft" | "pending_approval" | "approved" | "sent" | "accepted" | "rejected" | "withdrawn" | "expired" | "cancelled",
        offer_date: form.offer_date || null,
        valid_until: form.valid_until || null,
        proposed_joining_date: form.proposed_joining_date || null,
        ...(currentSalary.current.canManage?{
          basic_salary:currentSalary.current.basic?parseFloat(currentSalary.current.basic):null,
          gross_salary:currentSalary.current.gross?parseFloat(currentSalary.current.gross):null,
        }:{}),
        currency: form.currency || "AED",
        notes: form.notes || null,
      };

      const res = editing
        ? await updateOffer(editing.id, payload)
        : await createOffer(candidateId, payload);

      if (res.success) {
        toast.success(editing ? "Offer updated" : "Offer created");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateOffers(candidateId) });
        invalidateRecruitmentCandidateReadModels(queryClient, candidateId, "offers");
        closeDialog();
      } else {
        toast.error(res.error ?? "Failed to save offer");
      }
    });
  }

  function handleStatusChange(id: number, status: string) {
    if (!mutation.canDispatch()) return;
    startTransition(async () => {
      if (!mutation.canDispatch()) return;
      const res = await changeOfferStatus(id, status);
      if (res.success) {
        toast.success(`Offer ${status}`);
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateOffers(candidateId) });
        invalidateRecruitmentCandidateReadModels(queryClient, candidateId, "offers");
      } else {
        toast.error(res.error ?? "Failed to update status");
      }
    });
  }

  function handleArchive(id: number) {
    if (!mutation.canDispatch()) return;
    startTransition(async () => {
      if (!mutation.canDispatch()) return;
      const res = await archiveOffer(id);
      if (res.success) {
        toast.success("Offer removed");
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateOffers(candidateId) });
        invalidateRecruitmentCandidateReadModels(queryClient, candidateId, "offers");
      } else {
        toast.error(res.error ?? "Failed to remove");
      }
    });
  }

  if (read.denied) return <p role="alert">Candidate offer access is no longer available.</p>;
  return (
    <QueryReadBoundary queries={read.reads}><div className="p-6">
      {unavailableEditor && <p role="alert" className="mb-3 text-sm text-destructive">This child record is no longer available. Its private editor entries were removed; your candidate draft is unchanged.</p>}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Offers</h3>
        {canManage && (
          <Button size="sm" onClick={openAdd} disabled={!mutation.ready}>
            <Plus className="h-4 w-4 mr-1" /> Create Offer
          </Button>
        )}
      </div>

      {read.detailPending && <p role="status">Loading complete offer…</p>}
      {
        <div className="divide-y border rounded-lg">
<RecordCollection id="hr.candidate-offers-tab.CandidateOffersTab.offers" rows={offers} serverRead={read.serverRead} isLoading={read.busy} message={read.validationMessage} userProfileId={String(authContext.profile?.id ?? "")} fields={[{"id":"offer_status","path":"offer_status","label":"Offer Status"},{"id":"proposed_joining_date","path":"proposed_joining_date","label":"Proposed Joining Date"},{"id":"valid_until","path":"valid_until","label":"Valid Until"}]} renderRecord={(offer) => (
            <div key={offer.id} className="flex items-center gap-3 p-3">
              <Gift className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[offer.offer_status]}`}>
                    {offer.offer_status.replace(/_/g, " ")}
                  </span>
                  {offer.designation && <span className="text-sm font-medium">{offer.designation.designation_name_en}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {offer.basic_salary != null ? `Basic: ${offer.basic_salary.toLocaleString()} ${offer.currency}` : "Salary: Restricted or not recorded"}
                  {offer.proposed_joining_date && ` · Joining: ${offer.proposed_joining_date}`}
                  {offer.valid_until && ` · Valid until: ${offer.valid_until}`}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  {offer.offer_status === "sent" && (
                    <>
                      <Button aria-label="Accept" size="sm" variant="ghost" onClick={() => handleStatusChange(offer.id, "accepted")} disabled={isPending || !mutation.ready} title="Accept"><CheckCircle className="h-4 w-4 text-green-600" /></Button>
                      <Button aria-label="Reject" size="sm" variant="ghost" onClick={() => handleStatusChange(offer.id, "rejected")} disabled={isPending || !mutation.ready} title="Reject"><XCircle className="h-4 w-4 text-red-500" /></Button>
                    </>
                  )}
                  {["draft", "pending_approval", "approved"].includes(offer.offer_status) && (
                    <Button aria-label="Mark Sent" size="sm" variant="ghost" onClick={() => handleStatusChange(offer.id, "sent")} disabled={isPending || !mutation.ready} title="Mark Sent" className="text-xs px-2">Send</Button>
                  )}
                  <Button aria-label="Edit record" size="sm" variant="ghost" onClick={() => openEdit(offer)} disabled={!mutation.ready}><Pencil className="h-4 w-4" /></Button>
                  <Button aria-label="Archive record" size="sm" variant="ghost" onClick={() => handleArchive(offer.id)} disabled={isPending || !mutation.ready}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              )}
            </div>
          )} />
        </div>
      }

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={closeDialog}
        title={editing ? "Edit Offer" : "Create Offer"}
        subtitle="Manage offer details for this candidate"
        icon={<Gift className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="lg"
        isSubmitting={isPending}
        submitDisabled={!mutation.ready}
        onSubmit={handleSave}
      >
        <CandidateChildReadPause admission={mutation} canManage={canManage} />
        {salaryRetired && <p role="status" className="mb-4 text-sm text-muted-foreground">Salary access changed while this offer was open. Earlier salary values were removed. Save other permitted changes or cancel and reopen the offer for a fresh salary view.</p>}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <Label>Offer Status</Label>
            <ERPCombobox ariaLabel="Offer Status" value={form.offer_status || null} onValueChange={(v) => set("offer_status", String(v ?? "draft"))} options={STATUS_OPTIONS} placeholder="Select status" />
          </div>
          <div className="col-span-12 md:col-span-3">
            <Label>Offer Date</Label>
            <Input aria-label="Offer Date" type="date" value={form.offer_date} onChange={(e) => set("offer_date", e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-3">
            <Label>Valid Until</Label>
            <Input aria-label="Valid Until" type="date" value={form.valid_until} onChange={(e) => set("valid_until", e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label>Proposed Joining Date</Label>
            <Input aria-label="Proposed Joining Date" type="date" value={form.proposed_joining_date} onChange={(e) => set("proposed_joining_date", e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-3">
            <Label>Basic Salary</Label>
            <Input aria-label="Basic Salary" type="number" min={0} value={canViewSalary && !salaryRetired ? form.basic_salary : ""} onChange={(e) => set("basic_salary", e.target.value)} disabled={!canManageSalary} placeholder={canManageSalary?"0.00":"Salary access restricted"} />
          </div>
          <div className="col-span-12 md:col-span-3">
            <Label>Gross Salary</Label>
            <Input aria-label="Gross Salary" type="number" min={0} value={canViewSalary && !salaryRetired ? form.gross_salary : ""} onChange={(e) => set("gross_salary", e.target.value)} disabled={!canManageSalary} placeholder={canManageSalary?"0.00":"Salary access restricted"} />
          </div>
          <div className="col-span-12 md:col-span-2">
            <Label>Currency</Label>
            <Input aria-label="Currency" value={form.currency} onChange={(e) => set("currency", e.target.value)} placeholder="AED" />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea aria-label="Notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Offer notes..." />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}
