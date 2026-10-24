"use client";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import {CandidateChildReadPause, useCandidateChildReadAdmission, type CandidateChildAdmissionProps} from "../candidate-child-read-admission";

import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { queryKeys } from "@/lib/query/query-keys";
import type {AuthContext} from '@/lib/rbac/check';
import {hasGlobalPermission} from '@/lib/rbac/scope';
import {candidateConversionInputSchema,canCreateRecruitmentDestination} from '@/lib/hr/numbered-recruitment-contract';
import {useNumberedRecruitmentSession} from '../use-numbered-recruitment-session';
import{CandidateJoiningControls}from'../candidate-joining-controls';
import{RecruitmentReceiptHistory}from'../recruitment-history';
import{candidateRecordIdentity}from'@/lib/reads/hr-candidate-record-schema';
import type { CandidateRow } from "@/server/actions/hr/recruitment";
import { prepareCandidateEmployeeConversion } from "@/server/actions/hr/recruitment";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, ExternalLink, UserCheck } from "lucide-react";
import Link from "next/link";
import { useState} from "react";
import { toast } from "sonner";

type Props = CandidateChildAdmissionProps & {
  candidate: CandidateRow;
  authContext:AuthContext;
  canManage: boolean;
  canCreateEmployee: boolean;
  onChildOpen?: (open: boolean) => void;
};

type ConversionForm = {
  owner_company_id: number | null;
  branch_id: number | null;
  department_id: number | null;
  designation_id: number | null;
  employment_type_id: number | null;
  employee_category_id: number | null;
  joining_date: string;
  employee_status: string;
  conversion_notes: string;
  offer_id: number | null;
  offer_revision:string;
  offer_terms_version:string;
  requisition_id: number | null;
  emergency_contact_name:string;
  emergency_contact_mobile:string;
};

const EMPTY_FORM: ConversionForm = {
  owner_company_id: null,
  branch_id: null,
  department_id: null,
  designation_id: null,
  employment_type_id: null,
  employee_category_id: null,
  joining_date: "",
  employee_status: "active",
  conversion_notes: "",
  offer_id: null,
  offer_revision:'',
  offer_terms_version:'',
  requisition_id: null,
  emergency_contact_name:'',
  emergency_contact_mobile:'',
};

const EMPLOYEE_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "probation", label: "Probation" },
];

export function CandidateConversionTab({ candidate, authContext, canManage, canCreateEmployee, onChildOpen, mutationAdmitted = true, onRetryMutationAdmission }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ConversionForm>(EMPTY_FORM);
  const session=useNumberedRecruitmentSession('conversion',authContext.profile?.id,candidate.id);
  const isPending=session.saving;
  const [reviewedRevision,setReviewedRevision]=useState<string|null>(null);
  const [conversionResult, setConversionResult] = useState<{ employee_id: number; employee_code: string } | null>(null);

  const uiRead2 = useQuery({
    queryKey: ["recruitment", "conversion-prep", candidate.id],
    queryFn: () => prepareCandidateEmployeeConversion(candidate.id),
    staleTime: 30_000,
  });
  const { data: prepRes, isLoading: prepLoading } = uiRead2;

  const alreadyConverted = prepRes?.data?.already_converted ?? false;
  const latestOffer = prepRes?.data?.latest_offer;
  // The disabled legacy link placeholder is not an active prerequisite read.
  const mutation = useCandidateChildReadAdmission({canManage: canManage && canCreateEmployee, mutationAdmitted,
    prerequisitesMet: !alreadyConverted && !conversionResult && !!latestOffer, reads: [uiRead2], onRetryMutationAdmission});

  function openDialog() {
    if(session.pending?.kind==='conversion'){
      setForm({...EMPTY_FORM,...session.pending.payload,conversion_notes:session.pending.payload.conversion_notes??''});
      setReviewedRevision(session.pending.contract.revision);setDialogOpen(true);onChildOpen?.(true);return;
    }
    if (!mutation.canDispatch()) return;
    if(!session.startNew()||prepRes?.success!==true||String(prepRes.data?.candidate.workspace_revision)!==String(candidate.workspace_revision))return;
    const newForm = { ...EMPTY_FORM };
    if (latestOffer) {
      newForm.offer_id = latestOffer.id;
      newForm.offer_revision=latestOffer.offer_revision;
      newForm.offer_terms_version=latestOffer.offer_terms_version;
      newForm.requisition_id = latestOffer.requisition_id ?? null;
      newForm.department_id = latestOffer.department_id ?? null;
      newForm.designation_id = latestOffer.designation_id ?? null;
      newForm.employment_type_id = latestOffer.employment_type_id ?? null;
      newForm.owner_company_id = latestOffer.owner_company_id ?? null;
      newForm.branch_id = latestOffer.branch_id ?? null;
      newForm.joining_date = latestOffer.proposed_joining_date ?? "";
    } else {
      newForm.requisition_id = candidate.requisition_id ?? null;
    }
    setForm(newForm);
    setReviewedRevision(String(candidate.workspace_revision));
    setDialogOpen(true);
    onChildOpen?.(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    onChildOpen?.(false);
  }

  const set = (key: keyof ConversionForm, value: string | number | null) => {
    setForm((p) => ({ ...p, [key]: value }));
  };

  async function handleConvert() {
    if (!session.pending && !mutation.canDispatch()) return;
    const parsed=candidateConversionInputSchema.safeParse(form);
    if(!session.pending&&!parsed.success){
      const issue=parsed.error.issues[0];
      const message=issue?.path[0]==='owner_company_id'
        ? form.owner_company_id==null?'Owner company is required':'Choose a valid owner company.'
        : issue?.path[0]==='joining_date'
          ? form.joining_date.trim()===''?'Joining date is required':'Enter a valid joining date (YYYY-MM-DD).'
          : issue?.message??'Review employee values.';
      toast.error(message);return;
    }
    if(!session.pending&&!canCreateRecruitmentDestination(authContext,form.owner_company_id,form.branch_id,true)){toast.error('The selected scope requires recruitment management, employee creation/read/management, and numbering generation.');return;}
    const payload=session.pending?.kind==='conversion'?session.pending.payload:parsed.success?parsed.data:null;
    if(!payload)return;
    const receipt=await session.submit(payload,reviewedRevision);
    if(!receipt||!session.isCurrent()||!('employee_id' in receipt))return;
    toast.success(`Candidate converted to employee ${receipt.employee_code}`);setConversionResult(receipt);closeDialog();
    try{await Promise.all([queryClient.invalidateQueries({queryKey:['recruitment','conversion-prep',candidate.id]}),queryClient.invalidateQueries({queryKey:queryKeys.recruitment.candidates()})]);}catch{toast.message('Saved. Refresh the candidate to see its updated status.');}
  }

  if (prepLoading&&!session.pending) {
    return <div className="p-6"><Skeleton className="h-32 rounded" /></div>;
  }

  return (
    <QueryReadBoundary queries={session.pending?[]:[uiRead2]}><div className="p-6 space-y-6">
      {session.error&&!dialogOpen&&<p role="alert" className="text-sm text-destructive">{session.error}</p>}
      {session.pending&&<Button onClick={openDialog} disabled={isPending||session.blocked}>Recover Original Conversion</Button>}
      {prepRes?.success&&String(prepRes.data?.candidate.workspace_revision)!==String(candidate.workspace_revision)&&!session.pending&&<p role="alert">The candidate changed. Reopen its record before reviewing conversion.</p>}
      <div>
        {!latestOffer&&!alreadyConverted&&<p role="status">Conversion is held until a current, independently approved offer has explicitly recorded candidate acceptance. No direct-hire exception is available.</p>}
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">Candidate Conversion</h3>

        {alreadyConverted ? (
          <Card className="shadow-none border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0 dark:text-green-300" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-200">Candidate has been converted to an employee.</p>
                <p className="text-xs text-green-700 mt-0.5 dark:text-green-200">This candidate has already been converted. To view the employee profile, search for this candidate&apos;s name in the Employees module.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="shadow-none border">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0 dark:text-amber-300" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Convert Candidate to Employee</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This action will create a new employee record from this candidate&apos;s data. It requires review and explicit confirmation. This action cannot be undone.
                    </p>
                    <div className="mt-2 text-xs text-muted-foreground space-y-1">
                      <p>• Candidate: <strong>{candidate.full_name_en}</strong> ({candidate.candidate_code})</p>
                      <p>• A current independently approved and explicitly accepted offer version is required. Its agreed start date and employment fields must match this conversion.</p>
                      {latestOffer && (
                        <p>• Latest accepted offer found — data will be pre-filled from offer</p>
                      )}
                    </div>
                    {(canManage && canCreateEmployee && hasGlobalPermission(authContext,'numbering.rules.generate')) ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        onClick={openDialog}
                        disabled={isPending||!mutation.ready||session.blocked||!!session.pending||!!session.receipt||String(prepRes?.data?.candidate.workspace_revision)!==String(candidate.workspace_revision)}
                      >
                        <UserCheck className="h-4 w-4 mr-2" />
                        Convert to Employee
                      </Button>
                    ) : (
                      <p className="mt-3 text-xs text-amber-700 font-medium dark:text-amber-200">
                        Requires recruitment management, employee creation/read/management in the selected scope, and numbering generation.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {conversionResult && (
          <Card className="shadow-none border border-blue-200 bg-blue-50 mt-4 dark:border-blue-800 dark:bg-blue-950">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0 dark:text-blue-300" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Employee created: {conversionResult.employee_code}</p>
              </div>
              <Link href={`/admin/hr/employees/record/${conversionResult.employee_id}`} className="text-blue-600 hover:underline text-sm flex items-center gap-1 dark:text-blue-300">
                View Employee <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {canManage&&<CandidateJoiningControls candidate={candidate}authContext={authContext}admitted={mutationAdmitted&&!dialogOpen}/>}
      {canManage&&<RecruitmentReceiptHistory candidate={candidate.id}identity={candidateRecordIdentity(authContext)}/>}
      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={closeDialog}
        title="Convert to Employee"
        subtitle="Review and confirm employee conversion. This cannot be undone."
        icon={<UserCheck className="h-5 w-5" />}
        mode="add"
        size="lg"
        isSubmitting={isPending}
        submitDisabled={session.blocked || (!session.pending && !mutation.ready)}
        onSubmit={handleConvert}
        submitLabel={session.pending?'Retry Original Request':'Confirm Conversion'}
      >
        {!session.pending && <CandidateChildReadPause admission={mutation} canManage={canManage && canCreateEmployee}
          blockedReason={alreadyConverted || conversionResult ? "This candidate has already been converted. Your entries are retained; cancel this dialog rather than create another employee." : undefined} />}
        {session.error&&<p role="alert" className="text-sm text-destructive">{session.error}</p>}
        <fieldset disabled={isPending||!!session.pending||session.blocked} className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200">
              <strong>Review carefully.</strong> A new employee record will be created from <strong>{candidate.full_name_en}</strong>. You must provide owner company and joining date.
            </div>
          </div>

          <div className="col-span-12 md:col-span-6">
            <RequiredLabel required>Owner Company ID</RequiredLabel>
            <Input aria-label="Owner Company ID" required
              type="number"
              value={form.owner_company_id != null ? String(form.owner_company_id) : ""}
              onChange={(e) => set("owner_company_id", e.target.value ? Number(e.target.value) : null)}
              placeholder="Enter owner company ID"
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <RequiredLabel required>Joining Date</RequiredLabel>
            <Input aria-label="Joining Date" required type="date" value={form.joining_date} onChange={(e) => set("joining_date", e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-6">
            <RequiredLabel required>Emergency Contact Name</RequiredLabel>
            <Input aria-label="Emergency Contact Name" required value={form.emergency_contact_name} onChange={e=>set('emergency_contact_name',e.target.value)}/>
          </div>
          <div className="col-span-12 md:col-span-6">
            <RequiredLabel required>Emergency Contact Mobile</RequiredLabel>
            <Input aria-label="Emergency Contact Mobile" required value={form.emergency_contact_mobile} onChange={e=>set('emergency_contact_mobile',e.target.value)}/>
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Employee Status</Label>
            <ERPCombobox ariaLabel="Employee Status"
              value={form.employee_status || null}
              onValueChange={(v) => set("employee_status", String(v ?? "active"))}
              options={EMPLOYEE_STATUS_OPTIONS}
              placeholder="Select status"
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Branch ID (optional)</Label>
            <Input aria-label="Branch ID (optional)" type="number" value={form.branch_id != null ? String(form.branch_id) : ""} onChange={(e) => set("branch_id", e.target.value ? Number(e.target.value) : null)} placeholder="Branch ID" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Department ID (optional)</Label>
            <Input aria-label="Department ID (optional)" type="number" value={form.department_id != null ? String(form.department_id) : ""} onChange={(e) => set("department_id", e.target.value ? Number(e.target.value) : null)} placeholder="Department ID" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Designation ID (optional)</Label>
            <Input aria-label="Designation ID (optional)" type="number" value={form.designation_id != null ? String(form.designation_id) : ""} onChange={(e) => set("designation_id", e.target.value ? Number(e.target.value) : null)} placeholder="Designation ID" />
          </div>
          <div className="col-span-12">
            <Label>Conversion Notes</Label>
            <Textarea aria-label="Conversion Notes" value={form.conversion_notes} onChange={(e) => set("conversion_notes", e.target.value)} rows={3} placeholder="Notes about this conversion..." />
          </div>
        </fieldset>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}
