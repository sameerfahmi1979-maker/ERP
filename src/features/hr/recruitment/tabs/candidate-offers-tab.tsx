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
import{RequiredLabel}from'@/components/erp/required-label';
import { Textarea } from "@/components/ui/textarea";
import { invalidateRecruitmentCandidateReadModels } from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/query-keys";
import {candidateRecordIdentity, type CandidateSalaryAccess} from "@/lib/reads/hr-candidate-record-schema";
import { hasPermissionInScope, hasGlobalPermission } from "@/lib/rbac/scope";
import type {CandidateChildDetailMap, CandidateChildRowMap, CandidateChildPage, CandidateChildDetail} from "@/lib/reads/hr-candidate-children-schema";
import {useHrCandidateChildren, candidateChildPrefix, type CandidateChildReadProps} from "@/hooks/use-hr-candidate-children";
import{useRecruitmentLifecycle}from'../use-recruitment-lifecycle';
import{RecruitmentRecovery}from'../recruitment-recovery';
import{RecruitmentDecisionDialog}from'../recruitment-decision-dialog';
import{RecruitmentHistory}from'../recruitment-history';
import type{RecruitmentLifecycleRequest}from'@/lib/hr/recruitment-lifecycle-contract';
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
  housing_allowance:string;transport_allowance:string;other_allowances:string;reason:string;
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
  housing_allowance:'',transport_allowance:'',other_allowances:'',reason:'',
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
  const [transitionPending, startTransition] = useTransition();
  const session=useRecruitmentLifecycle(authContext,candidateId,null,'offer');
  const isPending=transitionPending||session.busy;
  const[decision,setDecision]=useState<RecruitmentLifecycleRequest|null>(null);
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
  const currentSalary = useRef({canManage: false, basic: "", gross: "",housing:'',transport:'',other:''});
  useLayoutEffect(() => {
    currentSalary.current = {canManage: canManageSalary, basic: canViewSalary && !salaryRetired ? form.basic_salary : "",
      gross: canViewSalary && !salaryRetired ? form.gross_salary : "",housing:canViewSalary&&!salaryRetired?form.housing_allowance:'',transport:canViewSalary&&!salaryRetired?form.transport_allowance:'',other:canViewSalary&&!salaryRetired?form.other_allowances:''};
    return () => {currentSalary.current = {canManage: false, basic: "", gross: "",housing:'',transport:'',other:''};};
  }, [canManageSalary, canViewSalary, salaryRetired, form.basic_salary, form.gross_salary,form.housing_allowance,form.transport_allowance,form.other_allowances]);
  const redactOffer = useCallback(<T extends CandidateChildRowMap["offers"]>(offer: T): T => {
    const freshProof = read.activeDetail?.id === offer.id ? read.activeDetail.salaryAccess : offer.salaryAccess;
    const allowed = salaryAllowedInScope("hr.payroll.view", offer.owner_company_id, offer.branch_id, freshProof);
    return allowed || (offer.basic_salary === null && (!("gross_salary" in offer) || offer.gross_salary === null)) ? offer
      : {...offer, basic_salary: null, ...("gross_salary" in offer ? {gross_salary: null,housing_allowance:null,transport_allowance:null,other_allowances:null} : {}), salaryAccess: {...offer.salaryAccess, canView: false, canManage: false}};
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
  useLayoutEffect(()=>{if(!canViewSalary&&session.pending&&['basic_salary','gross_salary','housing_allowance','transport_allowance','other_allowances'].some(key=>key in session.pending!.request.values))session.retire();},[canViewSalary,session]);
  if (!canViewSalary && (salaryWasVisible || form.basic_salary || form.gross_salary ||form.housing_allowance||form.transport_allowance||form.other_allowances|| editing?.basic_salary != null || editing?.gross_salary != null)) {
    if (!salaryRetired) setSalaryRetired(true);
    if (form.basic_salary || form.gross_salary||form.housing_allowance||form.transport_allowance||form.other_allowances) setForm({...form, basic_salary: "", gross_salary: "",housing_allowance:'',transport_allowance:'',other_allowances:''});
    if (editing && (editing.basic_salary != null || editing.gross_salary != null||editing.housing_allowance!=null||editing.transport_allowance!=null||editing.other_allowances!=null)) setEditing({...editing, basic_salary: null, gross_salary: null,housing_allowance:null,transport_allowance:null,other_allowances:null,
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
    if (!mutation.canDispatch()||!session.startNew()) return;
    setEditorVersion(++editorGeneration.current); setUnavailableEditor(false);
    read.closeDetail();
    setSalaryRetired(false); setSalaryWasVisible(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
    onChildOpen?.(true);
  }

  async function openEdit(row: CandidateChildRowMap["offers"]) {
    if (!mutation.canDispatch()||!session.startNew()) return;
    const detail = await read.loadDetail(row.id);
    if (!detail) return;
    setEditorVersion(++editorGeneration.current); setUnavailableEditor(false);
    const offer = redactOffer(detail);
    setSalaryRetired(false); setSalaryWasVisible(false);
    setEditing(offer);
    setForm({
      housing_allowance:offer.housing_allowance==null?'':String(offer.housing_allowance),transport_allowance:offer.transport_allowance==null?'':String(offer.transport_allowance),other_allowances:offer.other_allowances==null?'':String(offer.other_allowances),reason:'',
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
    if(session.busy||session.pending)return;
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
        offer_date: form.offer_date || null,
        valid_until: form.valid_until || null,
        proposed_joining_date: form.proposed_joining_date || null,
        ...(currentSalary.current.canManage?{
          basic_salary:currentSalary.current.basic?parseFloat(currentSalary.current.basic):null,
          gross_salary:currentSalary.current.gross?parseFloat(currentSalary.current.gross):null,
          housing_allowance:currentSalary.current.housing?Number(currentSalary.current.housing):null,transport_allowance:currentSalary.current.transport?Number(currentSalary.current.transport):null,other_allowances:currentSalary.current.other?Number(currentSalary.current.other):null,
        }:{}),
        currency: form.currency || "AED",
        notes: form.notes || null,
      };

      const res=await session.submit({kind:'offer',candidateId,id:editing?.id??null,revision:editing?String(editing.workspace_revision):null,action:editing?'update':'create',values:payload,reason:form.reason});
      if(!session.isCurrent())return;

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
    const row=offers.find(o=>o.id===id);const action:Record<string,RecruitmentLifecycleRequest['action']>={pending_approval:'submit',approved:'approve',sent:'send',accepted:'accept',rejected:'reject',withdrawn:'withdraw',expired:'expire',cancelled:'cancel',archive:'archive'};
    if(!row||!action[status]||!mutation.canDispatch()||!session.startNew())return;
    setDecision({kind:'offer',candidateId,id,revision:String(row.workspace_revision),action:action[status],values:{},reason:''});
  }

  function handleArchive(id: number) {
    handleStatusChange(id,'archive');
  }

  const recovered=()=>{setDialogOpen(false);setDecision(null);onChildOpen?.(false);invalidateRecruitmentCandidateReadModels(queryClient,candidateId,'offers');void queryClient.invalidateQueries({queryKey:candidateChildPrefix('offers',candidateId)});};
  const recovery=<RecruitmentRecovery session={session}onSaved={recovered}onRetire={()=>{setForm(EMPTY_FORM);setEditing(null);setDialogOpen(false);setDecision(null);onChildOpen?.(false);}}/>;
  if (read.denied) return <p role="alert">Candidate offer access is no longer available.</p>;
  return (
    <QueryReadBoundary queries={read.reads}><div className="p-6">
      {!dialogOpen&&!decision&&recovery}
      <RecruitmentDecisionDialog request={decision}busy={isPending}locked={!!session.pending}recovery={recovery}onClose={()=>setDecision(null)}onConfirm={async reason=>{if(!decision||!mutation.canDispatch())return;const r=await session.submit({...decision,reason});if(r.success&&session.isCurrent())recovered();}}/>
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
<RecordCollection presentation="embedded" id="hr.candidate-offers-tab.CandidateOffersTab.offers" rows={offers} serverRead={read.serverRead} isLoading={read.busy} message={read.validationMessage} userProfileId={String(authContext.profile?.id ?? "")} fields={[{"id":"offer_status","path":"offer_status","label":"Offer Status"},{"id":"proposed_joining_date","path":"proposed_joining_date","label":"Proposed Joining Date"},{"id":"valid_until","path":"valid_until","label":"Valid Until"}]} renderRecord={(offer) => (
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
                <RecruitmentHistory candidate={candidateId}kind="offer"id={offer.id}identity={read.identity}/>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  {offer.offer_status === "sent" && (
                    <>
                      <Button aria-label="Accept" size="sm" variant="ghost" onClick={() => handleStatusChange(offer.id, "accepted")} disabled={isPending || !mutation.ready} title="Accept"><CheckCircle className="h-4 w-4 text-green-600" /></Button>
                      <Button aria-label="Reject" size="sm" variant="ghost" onClick={() => handleStatusChange(offer.id, "rejected")} disabled={isPending || !mutation.ready} title="Reject"><XCircle className="h-4 w-4 text-red-500" /></Button>
                    </>
                  )}
                  {['draft','rejected'].includes(offer.offer_status)&&<Button size="sm"variant="ghost"disabled={isPending||!mutation.ready}onClick={()=>handleStatusChange(offer.id,'pending_approval')}>Submit for approval</Button>}
                  {offer.offer_status==='pending_approval'&&<Button size="sm"variant="ghost"disabled={isPending||!mutation.ready}onClick={()=>handleStatusChange(offer.id,'approved')}>Independent approval</Button>}
                  {offer.offer_status==='accepted'&&<Button size="sm"variant="ghost"disabled={isPending||!mutation.ready}onClick={()=>handleStatusChange(offer.id,'withdrawn')}>Withdraw</Button>}
                  {["approved"].includes(offer.offer_status) && (
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
        closeDisabled={!!session.pending}
        recoveryActions={recovery}
        submitDisabled={!mutation.ready||session.blocked||!!session.pending||!form.reason.trim()}
        onSubmit={handleSave}
      >
        <CandidateChildReadPause admission={mutation} canManage={canManage} />
        {salaryRetired && <p role="status" className="mb-4 text-sm text-muted-foreground">Salary access changed while this offer was open. Earlier salary values were removed. Save other permitted changes or cancel and reopen the offer for a fresh salary view.</p>}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <Label>Offer Status</Label>
            <ERPCombobox ariaLabel="Offer Status" disabled value={form.offer_status || null} onValueChange={()=>{}} options={STATUS_OPTIONS} placeholder="Select status" />
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
            <RequiredLabel required>Decision / change reason</RequiredLabel><Textarea aria-label="Decision / change reason"required maxLength={2000}value={form.reason}onChange={e=>set('reason',e.target.value)}/>
          </div>
          {(['housing_allowance','transport_allowance','other_allowances']as const).map(key=><div className="col-span-12 md:col-span-4"key={key}><Label>{key.replaceAll('_',' ')}</Label><Input aria-label={key.replaceAll('_',' ')}type="number"min={0}step="0.01"value={canViewSalary&&!salaryRetired?form[key]:''}disabled={!canManageSalary}onChange={e=>set(key,e.target.value)}/></div>)}
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea aria-label="Notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Offer notes..." />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}
