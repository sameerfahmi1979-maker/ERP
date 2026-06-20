"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { getCandidateSummary } from "@/server/actions/hr/recruitment";
import type { CandidateRow } from "@/server/actions/hr/recruitment";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, FileText, Gift, CheckSquare, Mail, Phone, MapPin, Briefcase, User } from "lucide-react";

type Props = {
  candidate: CandidateRow;
  canManage: boolean;
};

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: "bg-slate-100 text-slate-700",
    screening: "bg-blue-100 text-blue-700",
    shortlisted: "bg-cyan-100 text-cyan-700",
    interview: "bg-indigo-100 text-indigo-700",
    selected: "bg-green-100 text-green-700",
    offered: "bg-emerald-100 text-emerald-700",
    accepted: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    withdrawn: "bg-amber-100 text-amber-700",
    hired: "bg-green-200 text-green-800",
    blacklisted: "bg-red-200 text-red-800",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status.replace(/_/g, " ").toUpperCase()}
    </span>
  );
}

export function CandidateOverviewTab({ candidate, canManage }: Props) {
  const { data: summaryRes, isLoading } = useQuery({
    queryKey: queryKeys.recruitment.candidate(candidate.id),
    queryFn: () => getCandidateSummary(candidate.id),
    staleTime: 30_000,
  });

  const summary = summaryRes?.data;

  const metrics = [
    { label: "Interviews", value: summary?.interview_count ?? 0, icon: Calendar, color: "text-blue-600" },
    { label: "Offers", value: summary?.offer_count ?? 0, icon: Gift, color: "text-green-600" },
    { label: "Documents", value: summary?.document_count ?? 0, icon: FileText, color: "text-purple-600" },
    { label: "Onboarding Tasks", value: summary?.onboarding_task_count ?? 0, icon: CheckSquare, color: "text-amber-600" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
          <User className="h-7 w-7 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold text-slate-900">{candidate.full_name_en}</h2>
            {candidate.candidate_code && (
              <Badge variant="outline" className="text-xs font-mono">{candidate.candidate_code}</Badge>
            )}
            <StatusBadge status={candidate.candidate_status} />
          </div>
          {candidate.full_name_ar && (
            <p className="text-sm text-slate-500 mt-0.5" dir="rtl">{candidate.full_name_ar}</p>
          )}
          <div className="flex items-center gap-4 mt-1 flex-wrap text-sm text-slate-600">
            {candidate.mobile_number && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{candidate.mobile_number}</span>}
            {candidate.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{candidate.email}</span>}
            {candidate.current_location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{candidate.current_location}</span>}
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
          : metrics.map((m) => (
              <Card key={m.label} className="shadow-none border">
                <CardContent className="p-4 flex items-center gap-3">
                  <m.icon className={`h-5 w-5 ${m.color}`} />
                  <div>
                    <p className="text-2xl font-bold">{m.value}</p>
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-none border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Candidate Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Pipeline Stage" value={candidate.pipeline_stage?.replace(/_/g, " ")} />
            <Row label="Rating" value={candidate.rating?.replace(/_/g, " ")} />
            <Row label="Source" value={candidate.source?.replace(/_/g, " ")} />
            {candidate.agency_name && <Row label="Agency" value={candidate.agency_name} />}
            <Row label="Availability" value={candidate.availability_date ?? undefined} />
            <Row label="Notice Period" value={candidate.notice_period_days != null ? `${candidate.notice_period_days} days` : undefined} />
          </CardContent>
        </Card>

        <Card className="shadow-none border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Employment Background</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Current Employer" value={candidate.current_employer ?? undefined} />
            <Row label="Current Position" value={candidate.current_position ?? undefined} />
            <Row label="Expected Salary" value={candidate.expected_salary != null ? `${candidate.expected_salary.toLocaleString()} AED` : undefined} />
            {candidate.requisition && (
              <Row label="Applied For" value={`${candidate.requisition.requisition_code ?? ""} — ${candidate.requisition.requisition_title}`} />
            )}
          </CardContent>
        </Card>
      </div>

      {candidate.notes && (
        <Card className="shadow-none border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{candidate.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}
