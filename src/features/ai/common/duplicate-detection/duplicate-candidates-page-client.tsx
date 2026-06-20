"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, Brain, CheckCircle2, Eye, GitMerge, RefreshCw, Search, XCircle,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/query/query-keys";
import { invalidateDuplicateCandidates } from "@/lib/query/invalidation";
import type { DuplicateCandidateDetail, DuplicateCandidateStatus } from "@/lib/ai/common/duplicate-detection";
import type { DuplicateCandidateRow } from "@/lib/ai/common/duplicate-detection";
import {
  scanForDuplicates,
  getDuplicateCandidates,
  getDuplicateCandidateDetail,
  reviewDuplicateCandidate,
  markDuplicateCandidateResolved,
} from "@/server/actions/ai/common/duplicate-detection";
import {
  DuplicateCandidateStatusBadge,
  DuplicateCandidateTypeBadge,
} from "./duplicate-candidate-badges";

interface DuplicateCandidatesPageClientProps {
  summary: {
    pending: number;
    highConfidence: number;
    confirmed: number;
    ignoredResolved: number;
    featureEnabled: boolean;
  };
  initialEntityType?: string;
  initialEntityId?: number;
  initialDocumentId?: number;
}

function entityRecordHref(entityType: string, entityId: number): string | null {
  switch (entityType) {
    case "party":
      return `/admin/master-data/parties/record/${entityId}`;
    case "company":
      return `/admin/organizations/record/${entityId}`;
    case "branch":
      return `/admin/branches/record/${entityId}`;
    case "site":
      return `/admin/common-master-data/work-sites/record/${entityId}`;
    case "dms_document":
      return `/dms/documents/record/${entityId}`;
    default:
      return null;
  }
}

export function DuplicateCandidatesPageClient({
  summary,
  initialEntityType,
  initialEntityId,
  initialDocumentId,
}: DuplicateCandidatesPageClientProps) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [includeAi, setIncludeAi] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  const listFilters = {
    status: (statusFilter === "all" ? undefined : statusFilter) as DuplicateCandidateStatus | undefined,
    entityType: initialEntityType,
    entityId: initialEntityId,
    documentId: initialDocumentId,
    limit: 100,
  };

  const { data: listData, isLoading, refetch } = useQuery({
    queryKey: queryKeys.ai.duplicateCandidates(listFilters),
    queryFn: async () => {
      const res = await getDuplicateCandidates(listFilters);
      if (!res.success) throw new Error(res.error);
      return res.data!;
    },
  });

  const { data: detail } = useQuery({
    queryKey: queryKeys.ai.duplicateCandidateDetail(selectedId ?? 0),
    enabled: selectedId != null,
    queryFn: async () => {
      const res = await getDuplicateCandidateDetail(selectedId!);
      if (!res.success) throw new Error(res.error);
      return res.data!;
    },
  });

  const handleScan = async (withAi: boolean) => {
    setIsScanning(true);
    try {
      const res = await scanForDuplicates({
        includeAiRules: withAi,
        dryRun,
        supersedeExisting: !dryRun,
      });
      if (!res.success) {
        toast.error(res.error ?? "Scan failed");
        return;
      }
      const r = res.data!;
      toast.success(
        dryRun
          ? `Dry run: ${r.previewCount ?? 0} candidate(s) would be created`
          : `Scan complete: ${r.inserted} inserted, ${r.skippedExisting} skipped`
      );
      invalidateDuplicateCandidates(queryClient);
      refetch();
    } finally {
      setIsScanning(false);
    }
  };

  const handleReview = async (
    decision: "confirmed_duplicate" | "confirmed_conflict" | "not_duplicate" | "ignored"
  ) => {
    if (!selectedId) return;
    setIsReviewing(true);
    try {
      const res = await reviewDuplicateCandidate({ candidateId: selectedId, decision });
      if (!res.success) {
        toast.error(res.error ?? "Review failed");
        return;
      }
      toast.success("Candidate updated");
      invalidateDuplicateCandidates(queryClient);
      refetch();
    } finally {
      setIsReviewing(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedId) return;
    setIsReviewing(true);
    try {
      const res = await markDuplicateCandidateResolved({ candidateId: selectedId });
      if (!res.success) {
        toast.error(res.error ?? "Resolve failed");
        return;
      }
      toast.success("Marked resolved");
      invalidateDuplicateCandidates(queryClient);
      refetch();
    } finally {
      setIsReviewing(false);
    }
  };

  const rows = listData?.rows ?? [];

  return (
    <div className="space-y-6">
      {!summary.featureEnabled && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900">
            <strong>ERP_AI_DUPLICATE_DETECT</strong> is disabled. Scan actions are blocked until an admin
            enables the flag in AI Settings. Existing candidates can still be reviewed below.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Pending" value={summary.pending} icon={Search} tone="amber" />
        <SummaryCard title="High Confidence" value={summary.highConfidence} icon={Brain} tone="red" />
        <SummaryCard title="Confirmed" value={summary.confirmed} icon={GitMerge} tone="orange" />
        <SummaryCard title="Ignored / Resolved" value={summary.ignoredResolved} icon={CheckCircle2} tone="emerald" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run Duplicate Scan</CardTitle>
          <CardDescription>
            Deterministic rules run first. AI-assisted scan may use up to 50 AI calls — use only during UAT/admin review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="dryRun" checked={dryRun} onCheckedChange={(v) => setDryRun(v === true)} />
              <Label htmlFor="dryRun" className="text-sm">Dry run (preview only)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="includeAi" checked={includeAi} onCheckedChange={(v) => setIncludeAi(v === true)} />
              <Label htmlFor="includeAi" className="text-sm">Include AI-assisted rules</Label>
            </div>
          </div>
          {includeAi && (
            <Alert className="border-violet-200 bg-violet-50">
              <Brain className="h-4 w-4 text-violet-600" />
              <AlertDescription className="text-violet-900 text-sm">
                AI-assisted scan may use up to 50 AI calls. Names similarity + document link mismatch checks only.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isScanning || !summary.featureEnabled}
              onClick={() => handleScan(false)}
            >
              {isScanning ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
              Run Deterministic Scan
            </Button>
            <Button
              variant="secondary"
              disabled={isScanning || !summary.featureEnabled || !includeAi}
              onClick={() => handleScan(true)}
            >
              Run Full Scan (with AI)
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "pending")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed_duplicate">Confirmed duplicate</SelectItem>
                <SelectItem value="confirmed_conflict">Confirmed conflict</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-lg border divide-y max-h-[520px] overflow-y-auto">
            {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && rows.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No candidates match filters.</p>
            )}
            {rows.map((row) => (
              <CandidateListItem
                key={row.id}
                row={row}
                selected={selectedId === row.id}
                onSelect={() => setSelectedId(row.id)}
              />
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
          {detail ? (
            <CandidateDetailPanel
              detail={detail}
              isReviewing={isReviewing}
              onReview={handleReview}
              onResolve={handleResolve}
            />
          ) : (
            <Card className="h-full min-h-[320px] flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Select a candidate to review</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "amber" | "red" | "orange" | "emerald";
}) {
  const tones = {
    amber: "text-amber-600 bg-amber-50 border-amber-200",
    red: "text-red-600 bg-red-50 border-red-200",
    orange: "text-orange-600 bg-orange-50 border-orange-200",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-200",
  };
  return (
    <Card className={tones[tone]}>
      <CardContent className="pt-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium opacity-80">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <Icon className="h-8 w-8 opacity-60" />
      </CardContent>
    </Card>
  );
}

function CandidateListItem({
  row,
  selected,
  onSelect,
}: {
  row: DuplicateCandidateRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${selected ? "bg-muted" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <DuplicateCandidateTypeBadge type={row.candidateType} />
        <DuplicateCandidateStatusBadge status={row.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {row.entityTypeA} #{row.entityIdA}
        {row.entityTypeB && row.entityIdB ? ` ↔ ${row.entityTypeB} #${row.entityIdB}` : ""}
      </p>
      <p className="text-xs font-medium mt-0.5">
        Confidence: {Math.round(row.confidenceScore * 100)}%
      </p>
    </button>
  );
}

function CandidateDetailPanel({
  detail,
  isReviewing,
  onReview,
  onResolve,
}: {
  detail: DuplicateCandidateDetail;
  isReviewing: boolean;
  onReview: (d: "confirmed_duplicate" | "confirmed_conflict" | "not_duplicate" | "ignored") => void;
  onResolve: () => void;
}) {
  const hrefA = entityRecordHref(detail.entityTypeA, detail.entityIdA);
  const hrefB =
    detail.entityTypeB && detail.entityIdB
      ? entityRecordHref(detail.entityTypeB, detail.entityIdB)
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DuplicateCandidateTypeBadge type={detail.candidateType} />
          <DuplicateCandidateStatusBadge status={detail.status} />
          <span className="text-xs text-muted-foreground ml-auto">
            {detail.detectionMethod} · {Math.round(detail.confidenceScore * 100)}% confidence
          </span>
        </div>
        <CardTitle className="text-base mt-2">Candidate #{detail.id}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <EntityCompareCard
            label="Entity A"
            entityType={detail.entityTypeA}
            entityId={detail.entityIdA}
            entityLabel={detail.entityLabelA}
            value={detail.valueA}
            href={hrefA}
          />
          {detail.entityTypeB && detail.entityIdB != null && (
            <EntityCompareCard
              label="Entity B"
              entityType={detail.entityTypeB}
              entityId={detail.entityIdB}
              entityLabel={detail.entityLabelB}
              value={detail.valueB}
              href={hrefB}
            />
          )}
        </div>

        {detail.conflictField && (
          <p className="text-sm">
            <span className="text-muted-foreground">Conflict field:</span>{" "}
            <code className="text-xs bg-muted px-1 rounded">{detail.conflictField}</code>
          </p>
        )}

        {detail.aiReason && (
          <Alert>
            <Brain className="h-4 w-4" />
            <AlertDescription className="text-sm">{detail.aiReason}</AlertDescription>
          </Alert>
        )}

        {detail.sourceDocumentId && (
          <div className="text-sm">
            <span className="text-muted-foreground">Source document:</span>{" "}
            <Link
              href={`/dms/documents/record/${detail.sourceDocumentId}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              {detail.sourceDocumentNo ?? `Doc #${detail.sourceDocumentId}`}
            </Link>
            {detail.sourceDocumentTitle && (
              <span className="text-muted-foreground"> — {detail.sourceDocumentTitle}</span>
            )}
          </div>
        )}

        {detail.status === "pending" && (
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button size="sm" disabled={isReviewing} onClick={() => onReview("confirmed_duplicate")}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirm Duplicate
            </Button>
            <Button size="sm" variant="secondary" disabled={isReviewing} onClick={() => onReview("confirmed_conflict")}>
              Confirm Conflict
            </Button>
            <Button size="sm" variant="outline" disabled={isReviewing} onClick={() => onReview("not_duplicate")}>
              <XCircle className="mr-1 h-3.5 w-3.5" /> Not a Duplicate
            </Button>
            <Button size="sm" variant="outline" disabled={isReviewing} onClick={() => onReview("ignored")}>
              Ignore
            </Button>
            <Button size="sm" variant="ghost" disabled={isReviewing} onClick={onResolve}>
              Mark Resolved
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground border-t pt-3">
          Review only — no merge, delete, auto-fix, or unlink actions are available in v1.
        </p>
      </CardContent>
    </Card>
  );
}

function EntityCompareCard({
  label,
  entityType,
  entityId,
  entityLabel,
  value,
  href,
}: {
  label: string;
  entityType: string;
  entityId: number;
  entityLabel: string | null;
  value: string | null;
  href: string | null;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{entityLabel ?? `${entityType} #${entityId}`}</p>
      {value && <p className="text-xs font-mono bg-muted/60 rounded px-2 py-1 break-all">{value}</p>}
      {href && (
        <Link href={href} className="inline-flex items-center text-xs text-primary hover:underline mt-1">
          <Eye className="mr-1 h-3 w-3" /> Open Record
        </Link>
      )}
    </div>
  );
}
