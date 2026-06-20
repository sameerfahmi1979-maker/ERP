"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { prepareCandidateEmployeeConversion, convertCandidateToEmployee, getEmployeeRecruitmentLink } from "@/server/actions/hr/recruitment";
import type { CandidateRow } from "@/server/actions/hr/recruitment";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCheck, ArrowRight, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQuery as useOwnerQuery } from "@tanstack/react-query";

type Props = {
  candidate: CandidateRow;
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
  requisition_id: number | null;
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
  requisition_id: null,
};

const EMPLOYEE_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "probation", label: "Probation" },
];

export function CandidateConversionTab({ candidate, canManage, canCreateEmployee, onChildOpen }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ConversionForm>(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();
  const [conversionResult, setConversionResult] = useState<{ employee_id: number; employee_code: string } | null>(null);

  const { data: linkRes, isLoading: linkLoading } = useQuery({
    queryKey: queryKeys.recruitment.employeeRecruitmentLink(0),
    queryFn: async () => {
      // We need to find the employee that was converted from this candidate
      // We'll use a separate approach via prepareCandidateEmployeeConversion
      return null;
    },
    enabled: false,
  });

  const { data: prepRes, isLoading: prepLoading, refetch: refetchPrep } = useQuery({
    queryKey: ["recruitment", "conversion-prep", candidate.id],
    queryFn: () => prepareCandidateEmployeeConversion(candidate.id),
    staleTime: 30_000,
  });

  const alreadyConverted = prepRes?.data?.already_converted ?? false;
  const latestOffer = prepRes?.data?.latest_offer;

  function openDialog() {
    const newForm = { ...EMPTY_FORM };
    if (latestOffer) {
      newForm.offer_id = latestOffer.id;
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

  function handleConvert() {
    if (!form.owner_company_id) { toast.error("Owner company is required"); return; }
    if (!form.joining_date) { toast.error("Joining date is required"); return; }

    startTransition(async () => {
      const res = await convertCandidateToEmployee(candidate.id, {
        owner_company_id: form.owner_company_id!,
        branch_id: form.branch_id,
        department_id: form.department_id,
        designation_id: form.designation_id,
        employment_type_id: form.employment_type_id,
        employee_category_id: form.employee_category_id,
        joining_date: form.joining_date,
        employee_status: form.employee_status as "active" | "probation" | "suspended" | "inactive" | "terminated",
        conversion_notes: form.conversion_notes || undefined,
        offer_id: form.offer_id,
        requisition_id: form.requisition_id,
      });

      if (res.success && res.data) {
        toast.success(`Candidate converted to employee ${res.data.employee_code}`);
        setConversionResult(res.data);
        void queryClient.invalidateQueries({ queryKey: ["recruitment", "conversion-prep", candidate.id] });
        void queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidates() });
        refetchPrep();
        closeDialog();
      } else {
        toast.error(res.error ?? "Failed to convert candidate");
      }
    });
  }

  if (prepLoading) {
    return <div className="p-6"><Skeleton className="h-32 rounded" /></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Candidate Conversion</h3>

        {alreadyConverted ? (
          <Card className="shadow-none border border-green-200 bg-green-50">
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">Candidate has been converted to an employee.</p>
                <p className="text-xs text-green-700 mt-0.5">This candidate has already been converted. To view the employee profile, search for this candidate's name in the Employees module.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="shadow-none border">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Convert Candidate to Employee</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This action will create a new employee record from this candidate's data. It requires review and explicit confirmation. This action cannot be undone.
                    </p>
                    <div className="mt-2 text-xs text-muted-foreground space-y-1">
                      <p>• Candidate: <strong>{candidate.full_name_en}</strong> ({candidate.candidate_code})</p>
                      <p>• Status must be <strong>accepted</strong> or <strong>selected</strong> before conversion is recommended</p>
                      {latestOffer && (
                        <p>• Latest accepted offer found — data will be pre-filled from offer</p>
                      )}
                    </div>
                    {(canManage && canCreateEmployee) ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        onClick={openDialog}
                        disabled={isPending}
                      >
                        <UserCheck className="h-4 w-4 mr-2" />
                        Convert to Employee
                      </Button>
                    ) : (
                      <p className="mt-3 text-xs text-amber-700 font-medium">
                        Requires both <code>hr.recruitment.manage</code> and <code>hr.employees.create</code> permissions.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {conversionResult && (
          <Card className="shadow-none border border-blue-200 bg-blue-50 mt-4">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800">Employee created: {conversionResult.employee_code}</p>
              </div>
              <Link href={`/admin/hr/employees/record/${conversionResult.employee_id}`} className="text-blue-600 hover:underline text-sm flex items-center gap-1">
                View Employee <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={closeDialog}
        title="Convert to Employee"
        subtitle="Review and confirm employee conversion. This cannot be undone."
        icon={<UserCheck className="h-5 w-5" />}
        mode="add"
        size="lg"
        isSubmitting={isPending}
        onSubmit={handleConvert}
        submitLabel="Confirm Conversion"
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
              <strong>Review carefully.</strong> A new employee record will be created from <strong>{candidate.full_name_en}</strong>. You must provide owner company and joining date.
            </div>
          </div>

          <div className="col-span-12 md:col-span-6">
            <RequiredLabel required>Owner Company ID</RequiredLabel>
            <Input
              type="number"
              value={form.owner_company_id != null ? String(form.owner_company_id) : ""}
              onChange={(e) => set("owner_company_id", e.target.value ? Number(e.target.value) : null)}
              placeholder="Enter owner company ID"
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <RequiredLabel required>Joining Date</RequiredLabel>
            <Input type="date" value={form.joining_date} onChange={(e) => set("joining_date", e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Employee Status</Label>
            <ERPCombobox
              value={form.employee_status || null}
              onValueChange={(v) => set("employee_status", String(v ?? "active"))}
              options={EMPLOYEE_STATUS_OPTIONS}
              placeholder="Select status"
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Branch ID (optional)</Label>
            <Input type="number" value={form.branch_id != null ? String(form.branch_id) : ""} onChange={(e) => set("branch_id", e.target.value ? Number(e.target.value) : null)} placeholder="Branch ID" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Department ID (optional)</Label>
            <Input type="number" value={form.department_id != null ? String(form.department_id) : ""} onChange={(e) => set("department_id", e.target.value ? Number(e.target.value) : null)} placeholder="Department ID" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Designation ID (optional)</Label>
            <Input type="number" value={form.designation_id != null ? String(form.designation_id) : ""} onChange={(e) => set("designation_id", e.target.value ? Number(e.target.value) : null)} placeholder="Designation ID" />
          </div>
          <div className="col-span-12">
            <Label>Conversion Notes</Label>
            <Textarea value={form.conversion_notes} onChange={(e) => set("conversion_notes", e.target.value)} rows={3} placeholder="Notes about this conversion..." />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
