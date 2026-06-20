"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, RefreshCw, Scale, ShieldAlert, XCircle,
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
import { invalidateComplianceFindings } from "@/lib/query/invalidation";
import type {
  ComplianceFindingDetail,
  ComplianceFindingStatus,
} from "@/lib/ai/common/compliance-checker";
import type { ComplianceFindingRow } from "@/lib/ai/common/compliance-checker";
import {
  scanComplianceFindings,
  getComplianceFindings,
  getComplianceFindingDetail,
  reviewComplianceFinding,
} from "@/server/actions/ai/common/compliance-checker";
import {
  ComplianceFindingStatusBadge,
  ComplianceFindingTypeBadge,
  ComplianceSeverityBadge,
} from "./compliance-finding-badges";

interface ComplianceFindingsPageClientProps {
  summary: {
    open: number;
    critical: number;
    high: number;
    waivedResolved: number;
    featureEnabled: boolean;
  };
  initialEntityType?: string;
  initialEntityId?: number;
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

export function ComplianceFindingsPageClient({
  summary,
  initialEntityType,
  initialEntityId,
}: ComplianceFindingsPageClientProps) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [includeAiNotes, setIncludeAiNotes] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  const listFilters = {
    status: (statusFilter === "all" ? undefined : statusFilter) as ComplianceFindingStatus | undefined,
    entityType: initialEntityType,
    entityId: initialEntityId,
    severity: severityFilter === "all" ? undefined : (severityFilter as ComplianceFindingRow["severity"]),
    limit: 100,
  };

  const { data: listData, isLoading, refetch } = useQuery({
    queryKey: queryKeys.ai.complianceFindings(listFilters),
    queryFn: async () => {
      const res = await getComplianceFindings(listFilters);
      if (!res.success) throw new Error(res.error);
      return res.data!;
    },
  });

  const { data: detail } = useQuery({
    queryKey: queryKeys.ai.complianceFindingDetail(selectedId ?? 0),
    enabled: selectedId != null,
    queryFn: async () => {
      const res = await getComplianceFindingDetail(selectedId!);
      if (!res.success) throw new Error(res.error);
      return res.data!;
    },
  });

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const res = await scanComplianceFindings({
        includeAiNotes,
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
          ? `Dry run: ${r.previewCount ?? r.detected} finding(s) would be detected`
          : `Scan complete: ${r.inserted} inserted, ${r.skippedExisting} skipped, ${r.superseded} superseded`
      );
      invalidateComplianceFindings(queryClient);
      refetch();
    } finally {
      setIsScanning(false);
    }
  };

  const handleReview = async (
    decision: "accepted" | "waived" | "resolved" | "false_positive",
    waiverReason?: string
  ) => {
    if (!selectedId) return;
    setIsReviewing(true);
    try {
      const res = await reviewComplianceFinding({
        findingId: selectedId,
        decision,
        waiverReason,
      });
      if (!res.success) {
        toast.error(res.error ?? "Review failed");
        return;
      }
      toast.success(`Finding marked as ${decision.replace(/_/g, " ")}`);
      invalidateComplianceFindings(queryClient);
      refetch();
    } finally {
      setIsReviewing(false);
    }
  };

  const rows = listData?.rows ?? [];

  return (
    <div className="space-y-4">
      {!summary.featureEnabled && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900 text-sm">
            <strong>ERP_AI_COMPLIANCE</strong> is disabled. Existing findings remain visible; scan
            actions are blocked until the flag is enabled in AI Settings.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">Open</p>
              <p className="text-2xl font-bold">{summary.open}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">Critical</p>
              <p className="text-2xl font-bold">{summary.critical}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Scale className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-xs text-muted-foreground">High</p>
              <p className="text-2xl font-bold">{summary.high}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="text-xs text-muted-foreground">Waived / Resolved</p>
              <p className="text-2xl font-bold">{summary.waivedResolved}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Compliance Scan</CardTitle>
          <CardDescription>
            Deterministic-first scan. Optional AI notes capped at 20 calls. No auto-fix or auto-waive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="dryRun" checked={dryRun} onCheckedChange={(v) => setDryRun(v === true)} />
              <Label htmlFor="dryRun" className="text-sm">Dry run (preview only)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="includeAiNotes"
                checked={includeAiNotes}
                onCheckedChange={(v) => setIncludeAiNotes(v === true)}
              />
              <Label htmlFor="includeAiNotes" className="text-sm">
                Include AI notes (max 20 calls)
              </Label>
            </div>
          </div>
          {includeAiNotes && (
            <p className="text-xs text-amber-700">
              AI notes may incur provider costs. Max 20 AI calls per scan.
            </p>
          )}
          <Button
            onClick={handleScan}
            disabled={isScanning || !summary.featureEnabled}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isScanning ? "animate-spin" : ""}`} />
            {dryRun ? "Run Dry Scan" : "Run Deterministic Scan"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "open")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="waived">Waived</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="false_positive">False Positive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v ?? "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[400px]">
        <Card className="overflow-hidden">
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-sm">Findings ({listData?.total ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[500px] overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading...</p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No findings match filters.</p>
            ) : (
              rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors ${
                    selectedId === row.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <ComplianceFindingTypeBadge type={row.findingType} />
                    <ComplianceSeverityBadge severity={row.severity} />
                    <ComplianceFindingStatusBadge status={row.status} />
                  </div>
                  <p className="text-sm font-medium">
                    {row.entityType} #{row.entityId}
                    {row.documentId ? ` · Doc #${row.documentId}` : ""}
                  </p>
                  {row.recommendedAction && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {row.recommendedAction}
                    </p>
                  )}
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-sm">Finding Detail</CardTitle>
          </CardHeader>
          <CardContent className="p-4 max-h-[500px] overflow-y-auto">
            {!selectedId || !detail ? (
              <p className="text-sm text-muted-foreground">Select a finding to review.</p>
            ) : (
              <FindingDetailPanel
                detail={detail}
                isReviewing={isReviewing}
                onReview={handleReview}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FindingDetailPanel({
  detail,
  isReviewing,
  onReview,
}: {
  detail: ComplianceFindingDetail;
  isReviewing: boolean;
  onReview: (
    decision: "accepted" | "waived" | "resolved" | "false_positive",
    waiverReason?: string
  ) => void;
}) {
  const recordHref = entityRecordHref(detail.entityType, detail.entityId);
  const docHref = detail.documentId
    ? `/dms/documents/record/${detail.documentId}`
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <ComplianceFindingTypeBadge type={detail.findingType} />
        <ComplianceSeverityBadge severity={detail.severity} />
        <ComplianceFindingStatusBadge status={detail.status} />
      </div>

      <div className="text-sm space-y-1">
        <p>
          <span className="text-muted-foreground">Entity:</span>{" "}
          {detail.entityLabel ?? `${detail.entityType} #${detail.entityId}`}
        </p>
        {detail.documentNo && (
          <p>
            <span className="text-muted-foreground">Document:</span> {detail.documentNo}
            {detail.documentTitle ? ` — ${detail.documentTitle}` : ""}
          </p>
        )}
        {detail.ruleName && (
          <p>
            <span className="text-muted-foreground">Rule:</span> {detail.ruleName}
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Confidence:</span>{" "}
          {(detail.confidenceScore * 100).toFixed(0)}%
        </p>
      </div>

      {detail.recommendedAction && (
        <div className="rounded-md border p-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-1">Recommended Action</p>
          <p className="text-sm">{detail.recommendedAction}</p>
        </div>
      )}

      {(detail.expectedValue || detail.actualValue) && (
        <div className="rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Safe Values</p>
          {detail.expectedValue && (
            <p className="text-sm">
              Expected: <code className="text-xs">{detail.expectedValue}</code>
            </p>
          )}
          {detail.actualValue && (
            <p className="text-sm">
              Actual: <code className="text-xs">{detail.actualValue}</code>
            </p>
          )}
        </div>
      )}

      {detail.aiReason && (
        <div className="rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">AI Note</p>
          <p className="text-sm">{detail.aiReason}</p>
        </div>
      )}

      {detail.sourceDuplicateCandidateId && (
        <Link
          href={`/admin/ai/duplicates`}
          className="text-sm text-primary underline underline-offset-2"
        >
          View source duplicate candidate #{detail.sourceDuplicateCandidateId}
        </Link>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {recordHref && (
          <Link
            href={recordHref}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 h-8 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Open Record
          </Link>
        )}
        {docHref && (
          <Link
            href={docHref}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 h-8 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Open Document
          </Link>
        )}
      </div>

      {detail.status === "open" && (
        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" disabled={isReviewing} onClick={() => onReview("accepted")}>
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isReviewing}
            onClick={() => onReview("waived", "Management waiver")}
          >
            Waive
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isReviewing}
            onClick={() => onReview("resolved")}
          >
            Mark Resolved
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isReviewing}
            onClick={() => onReview("false_positive")}
          >
            <XCircle className="h-4 w-4 mr-1" />
            False Positive
          </Button>
        </div>
      )}
    </div>
  );
}
