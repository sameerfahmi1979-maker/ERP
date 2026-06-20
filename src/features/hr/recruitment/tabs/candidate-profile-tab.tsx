"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ERPCombobox } from "@/components/erp/combobox";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listJobRequisitions } from "@/server/actions/hr/recruitment";
import { RequiredLabel } from "@/components/erp/required-label";

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

type Props = {
  form: FormState;
  setForm: (f: FormState | ((prev: FormState) => FormState)) => void;
  mode: "add" | "edit" | "view";
  canManage: boolean;
};

const SOURCE_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "referral", label: "Referral" },
  { value: "agency", label: "Agency" },
  { value: "walk_in", label: "Walk-in" },
  { value: "online", label: "Online" },
  { value: "other", label: "Other" },
];

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "screening", label: "Screening" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview", label: "Interview" },
  { value: "selected", label: "Selected" },
  { value: "offered", label: "Offered" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "hired", label: "Hired" },
  { value: "blacklisted", label: "Blacklisted" },
];

const PIPELINE_OPTIONS = [
  { value: "new", label: "New" },
  { value: "screening", label: "Screening" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "onboarding", label: "Onboarding" },
  { value: "hired", label: "Hired" },
  { value: "closed", label: "Closed" },
];

const RATING_OPTIONS = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "average", label: "Average" },
  { value: "weak", label: "Weak" },
  { value: "not_suitable", label: "Not Suitable" },
];

export function CandidateProfileTab({ form, setForm, mode, canManage }: Props) {
  const isView = mode === "view" || !canManage;

  const { data: reqRes } = useQuery({
    queryKey: queryKeys.recruitment.requisitions(),
    queryFn: () => listJobRequisitions({ pageSize: 200 }),
    staleTime: 60_000,
  });
  const requisitions = Array.isArray(reqRes?.data?.rows) ? reqRes.data.rows : [];

  const set = (key: keyof FormState, value: string | number | null) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="p-6 space-y-8">
      {/* Personal */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Personal Information</h3>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <RequiredLabel required>Full Name (English)</RequiredLabel>
            <Input value={form.full_name_en} onChange={(e) => set("full_name_en", e.target.value)} disabled={isView} placeholder="Full name in English" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Full Name (Arabic)</Label>
            <Input value={form.full_name_ar} onChange={(e) => set("full_name_ar", e.target.value)} disabled={isView} placeholder="الاسم الكامل بالعربية" dir="rtl" />
          </div>

          <div className="col-span-12 md:col-span-4">
            <Label>Gender</Label>
            <ERPCombobox
              value={form.gender || null}
              onValueChange={(v) => set("gender", String(v ?? ""))}
              options={GENDER_OPTIONS}
              placeholder="Select gender"
              disabled={isView}
            />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label>Date of Birth</Label>
            <Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} disabled={isView} />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label>Availability Date</Label>
            <Input type="date" value={form.availability_date} onChange={(e) => set("availability_date", e.target.value)} disabled={isView} />
          </div>

          <div className="col-span-12 md:col-span-6">
            <Label>Mobile Number</Label>
            <Input value={form.mobile_number} onChange={(e) => set("mobile_number", e.target.value)} disabled={isView} placeholder="+971 50 000 0000" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} disabled={isView} placeholder="candidate@email.com" />
          </div>

          <div className="col-span-12">
            <Label>Current Location</Label>
            <Input value={form.current_location} onChange={(e) => set("current_location", e.target.value)} disabled={isView} placeholder="City, Country" />
          </div>
        </div>
      </section>

      {/* Application */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Application Details</h3>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <Label>Job Requisition</Label>
            <ERPCombobox
              value={form.requisition_id}
              onValueChange={(v) => set("requisition_id", v ? Number(v) : null)}
              options={requisitions.map((r) => ({ value: r.id, label: `${r.requisition_code ?? ""} — ${r.requisition_title}` }))}
              placeholder="Select requisition..."
              disabled={isView}
            />
          </div>
          <div className="col-span-12 md:col-span-3">
            <Label>Source</Label>
            <ERPCombobox
              value={form.source || null}
              onValueChange={(v) => set("source", String(v ?? ""))}
              options={SOURCE_OPTIONS}
              placeholder="Select source"
              disabled={isView}
            />
          </div>
          <div className="col-span-12 md:col-span-3">
            <Label>Rating</Label>
            <ERPCombobox
              value={form.rating || null}
              onValueChange={(v) => set("rating", String(v ?? ""))}
              options={RATING_OPTIONS}
              placeholder="Select rating"
              disabled={isView}
            />
          </div>

          {form.source === "agency" && (
            <div className="col-span-12 md:col-span-6">
              <Label>Agency Name</Label>
              <Input value={form.agency_name} onChange={(e) => set("agency_name", e.target.value)} disabled={isView} placeholder="Agency name" />
            </div>
          )}

          <div className="col-span-12 md:col-span-6">
            <Label>Candidate Status</Label>
            <ERPCombobox
              value={form.candidate_status || null}
              onValueChange={(v) => set("candidate_status", String(v ?? "new"))}
              options={STATUS_OPTIONS}
              placeholder="Select status"
              disabled={isView}
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Pipeline Stage</Label>
            <ERPCombobox
              value={form.pipeline_stage || null}
              onValueChange={(v) => set("pipeline_stage", String(v ?? "new"))}
              options={PIPELINE_OPTIONS}
              placeholder="Select stage"
              disabled={isView}
            />
          </div>
        </div>
      </section>

      {/* Employment Background */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Employment Background</h3>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <Label>Current Employer</Label>
            <Input value={form.current_employer} onChange={(e) => set("current_employer", e.target.value)} disabled={isView} placeholder="Company name" />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label>Current Position</Label>
            <Input value={form.current_position} onChange={(e) => set("current_position", e.target.value)} disabled={isView} placeholder="Job title" />
          </div>

          <div className="col-span-12 md:col-span-4">
            <Label>Expected Salary (AED)</Label>
            <Input type="number" value={form.expected_salary} onChange={(e) => set("expected_salary", e.target.value)} disabled={isView} placeholder="0.00" min={0} />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label>Notice Period (Days)</Label>
            <Input type="number" value={form.notice_period_days} onChange={(e) => set("notice_period_days", e.target.value)} disabled={isView} placeholder="30" min={0} />
          </div>
        </div>
      </section>

      {/* Notes */}
      <section>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Internal Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={isView} placeholder="Internal notes about this candidate..." rows={4} />
          </div>
        </div>
      </section>
    </div>
  );
}
