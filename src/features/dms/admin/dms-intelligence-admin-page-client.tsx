"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Sparkles,
  Brain,
  Compass,
  Zap,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Tag,
  Link2,
  FileSearch,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { adminBackfillDmsContentText } from "@/server/actions/dms/document-content";
import { bulkGenerateMissingSummaries } from "@/server/actions/dms/ai-summary";
import { bulkEvaluateDmsDocuments } from "@/server/actions/dms/ai-intelligence";
import { bulkGenerateMissingDmsEmbeddings } from "@/server/actions/dms/semantic-search";
import type { DmsIntelligenceAdminStats } from "@/server/actions/dms/intelligence-admin";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  stats: DmsIntelligenceAdminStats;
};

// ── Health stat card ──────────────────────────────────────────────────────────

type HealthCard = {
  label: string;
  value: number;
  total?: number;
  icon: React.ElementType;
  color: string;
  warn?: boolean;
};

function HealthStatCard({ card }: { card: HealthCard }) {
  const Icon = card.icon;
  const pct =
    card.total != null && card.total > 0
      ? Math.round((card.value / card.total) * 100)
      : null;

  return (
    <div
      className={`rounded-lg border bg-card p-4 ${
        card.warn ? "border-amber-300/60 dark:border-amber-700/40" : "border-border/50"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className={`p-1.5 rounded-md ${card.color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        {card.warn && (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5" />
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold text-foreground">
          {card.value.toLocaleString()}
        </div>
        <div className="text-xs font-medium text-foreground mt-0.5">
          {card.label}
        </div>
        {pct != null && (
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {pct}% of {card.total?.toLocaleString()} total
          </div>
        )}
      </div>
    </div>
  );
}

// ── Result display ────────────────────────────────────────────────────────────

type ErrorEntry = { documentId: number; documentNo?: string; error: string };

function ResultPanel({
  result,
  onClear,
}: {
  result: Record<string, unknown> | null;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!result) return null;

  const errors = result.errors as ErrorEntry[] | undefined;

  return (
    <div className="mt-3 rounded-md border border-border/50 bg-muted/30 p-3 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">Result</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {["processed", "skipped", "failed", "nextResumeDocumentId", "nextResumeFromDocumentId"].map(
          (k) => {
            if (!(k in result) || result[k] === undefined) return null;
            const label =
              k === "nextResumeDocumentId" || k === "nextResumeFromDocumentId"
                ? "Next Resume ID"
                : k.charAt(0).toUpperCase() + k.slice(1);
            return (
              <div key={k} className="bg-background rounded p-2 text-center">
                <div className="text-base font-bold text-foreground">
                  {result[k] != null
                    ? String(result[k])
                    : <span className="text-muted-foreground text-[10px]">—</span>}
                </div>
                <div className="text-[10px] text-muted-foreground">{label}</div>
              </div>
            );
          }
        )}
      </div>
      {errors && errors.length > 0 && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-amber-600 font-medium"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {errors.length} error{errors.length !== 1 ? "s" : ""}
          </button>
          {expanded && (
            <ul className="mt-1 space-y-0.5 max-h-36 overflow-y-auto">
              {errors.map((e, i) => (
                <li key={i} className="text-[10px] text-destructive">
                  Doc #{e.documentId}
                  {e.documentNo ? ` (${e.documentNo})` : ""}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Admin action card ─────────────────────────────────────────────────────────

type AdminBulkCardProps = {
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  defaultBatchSize: number;
  maxBatchSize: number;
  warnText?: string;
  onRun: (params: {
    batchSize: number;
    resumeFromDocumentId?: number;
    dryRun: boolean;
  }) => Promise<void>;
};

function AdminBulkCard({
  title,
  description,
  icon: Icon,
  iconColor,
  defaultBatchSize,
  maxBatchSize,
  warnText,
  onRun,
}: AdminBulkCardProps) {
  const [batchSize, setBatchSize] = useState(defaultBatchSize);
  const [resumeId, setResumeId] = useState<string>("");
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    try {
      await onRun({
        batchSize: Math.min(Math.max(1, batchSize), maxBatchSize),
        resumeFromDocumentId: resumeId ? parseInt(resumeId, 10) : undefined,
        dryRun,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-md shrink-0 ${iconColor}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        </div>
      </div>

      {warnText && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5 text-amber-800 dark:text-amber-300 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{warnText}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Batch Size (max {maxBatchSize})</Label>
          <Input
            type="number"
            min={1}
            max={maxBatchSize}
            value={batchSize}
            onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || defaultBatchSize)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Resume from Document ID</Label>
          <Input
            type="number"
            min={1}
            placeholder="optional"
            value={resumeId}
            onChange={(e) => setResumeId(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`dryRun-${title}`}
            checked={dryRun}
            onCheckedChange={(v) => setDryRun(!!v)}
          />
          <Label htmlFor={`dryRun-${title}`} className="text-xs cursor-pointer">
            Dry run (no writes)
          </Label>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={handleRun}
          disabled={loading}
        >
          {loading ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5 mr-1.5" />
          )}
          {loading ? "Running…" : dryRun ? "Dry Run" : "Run"}
        </Button>
      </div>

      <ResultPanel result={result} onClear={() => setResult(null)} />
    </div>
  );

  // Expose setResult for the outer handler to call
  // (We use closure in onRun instead)
}

// ── Main client page ─────────────────────────────────────────────────────────

export function DmsIntelligenceAdminPageClient({ stats }: Props) {
  const healthCards: HealthCard[] = [
    {
      label: "Total Documents",
      value: stats.totalDocuments,
      icon: FileText,
      color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
    },
    {
      label: "With Extracted Text",
      value: stats.documentsWithExtractedText,
      total: stats.totalDocuments,
      icon: FileSearch,
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
    },
    {
      label: "Missing Extracted Text",
      value: stats.documentsMissingExtractedText,
      total: stats.totalDocuments,
      icon: FileText,
      color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
      warn: stats.documentsMissingExtractedText > 0,
    },
    {
      label: "With AI Summary",
      value: stats.documentsWithAiSummary,
      total: stats.totalDocuments,
      icon: Sparkles,
      color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30",
    },
    {
      label: "Missing AI Summary",
      value: stats.documentsMissingAiSummary,
      total: stats.totalDocuments,
      icon: Sparkles,
      color: "text-rose-600 bg-rose-50 dark:bg-rose-950/30",
      warn: stats.documentsMissingAiSummary > 0,
    },
    {
      label: "With Completeness Score",
      value: stats.documentsWithCompletenessScore,
      total: stats.totalDocuments,
      icon: ClipboardList,
      color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30",
    },
    {
      label: "High Risk Docs",
      value: stats.highRiskDocuments,
      icon: AlertTriangle,
      color: "text-orange-600 bg-orange-50 dark:bg-orange-950/30",
      warn: stats.highRiskDocuments > 0,
    },
    {
      label: "Critical Risk Docs",
      value: stats.criticalRiskDocuments,
      icon: AlertTriangle,
      color: "text-red-600 bg-red-50 dark:bg-red-950/30",
      warn: stats.criticalRiskDocuments > 0,
    },
    {
      label: "Pending Tag Suggestions",
      value: stats.pendingTagSuggestions,
      icon: Tag,
      color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30",
    },
    {
      label: "Pending Link Suggestions",
      value: stats.pendingLinkSuggestions,
      icon: Link2,
      color: "text-teal-600 bg-teal-50 dark:bg-teal-950/30",
    },
    {
      label: "With Embedding",
      value: stats.documentsWithEmbedding,
      total: stats.totalDocuments,
      icon: Compass,
      color: "text-sky-600 bg-sky-50 dark:bg-sky-950/30",
    },
    {
      label: "Missing Embedding",
      value: stats.documentsMissingEmbedding,
      total: stats.totalDocuments,
      icon: Compass,
      color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
      warn: stats.documentsMissingEmbedding > 0,
    },
    {
      label: "Failed Embeddings",
      value: stats.failedEmbeddings,
      icon: AlertTriangle,
      color: "text-red-600 bg-red-50 dark:bg-red-950/30",
      warn: stats.failedEmbeddings > 0,
    },
  ];

  // ── Backfill card handler ────────────────────────────────────────────────────

  const [backfillResult, setBackfillResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillBatch, setBackfillBatch] = useState(50);
  const [backfillResume, setBackfillResume] = useState("");
  const [backfillDry, setBackfillDry] = useState(false);

  const runBackfill = async () => {
    setBackfillLoading(true);
    setBackfillResult(null);
    const res = await adminBackfillDmsContentText({
      batchSize: Math.min(Math.max(1, backfillBatch), 100),
      resumeFromDocumentId: backfillResume
        ? parseInt(backfillResume, 10)
        : undefined,
      dryRun: backfillDry,
    });
    setBackfillLoading(false);
    if (res.success && res.data) {
      toast.success("Content text backfill completed.");
      setBackfillResult(res.data as unknown as Record<string, unknown>);
    } else {
      toast.error(`Backfill failed: ${res.error}`);
      setBackfillResult({ error: res.error });
    }
  };

  // ── Summary bulk card handler ─────────────────────────────────────────────

  const [summaryResult, setSummaryResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryBatch, setSummaryBatch] = useState(20);
  const [summaryResume, setSummaryResume] = useState("");
  const [summaryDry, setSummaryDry] = useState(false);

  const runSummary = async () => {
    setSummaryLoading(true);
    setSummaryResult(null);
    const res = await bulkGenerateMissingSummaries({
      batchSize: Math.min(Math.max(1, summaryBatch), 50),
      resumeFromDocumentId: summaryResume
        ? parseInt(summaryResume, 10)
        : undefined,
      dryRun: summaryDry,
    });
    setSummaryLoading(false);
    if (res.success && res.data) {
      toast.success("Bulk summary generation completed.");
      setSummaryResult(res.data as unknown as Record<string, unknown>);
    } else {
      toast.error(`Bulk summary failed: ${res.error}`);
      setSummaryResult({ error: res.error });
    }
  };

  // ── Intelligence bulk card handler ──────────────────────────────────────────

  const [evalResult, setEvalResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalBatch, setEvalBatch] = useState(50);
  const [evalResume, setEvalResume] = useState("");
  const [evalDry, setEvalDry] = useState(false);

  const runEval = async () => {
    setEvalLoading(true);
    setEvalResult(null);
    const res = await bulkEvaluateDmsDocuments({
      batchSize: Math.min(Math.max(1, evalBatch), 100),
      resumeFromDocumentId: evalResume
        ? parseInt(evalResume, 10)
        : undefined,
      dryRun: evalDry,
    });
    setEvalLoading(false);
    if (res.success && res.data) {
      toast.success("Intelligence bulk evaluation completed.");
      setEvalResult(res.data as unknown as Record<string, unknown>);
    } else {
      toast.error(`Bulk evaluation failed: ${res.error}`);
      setEvalResult({ error: res.error });
    }
  };

  // ── Embedding bulk card handler (DMS 12.5) ──────────────────────────────────

  const [embedResult, setEmbedResult] = useState<Record<string, unknown> | null>(null);
  const [embedLoading, setEmbedLoading] = useState(false);
  const [embedBatch, setEmbedBatch] = useState(20);
  const [embedResume, setEmbedResume] = useState("");
  const [embedDry, setEmbedDry] = useState(false);

  const runEmbed = async () => {
    setEmbedLoading(true);
    setEmbedResult(null);
    const res = await bulkGenerateMissingDmsEmbeddings({
      batchSize: Math.min(Math.max(1, embedBatch), 50),
      resumeFromDocumentId: embedResume ? parseInt(embedResume, 10) : undefined,
      dryRun: embedDry,
    });
    setEmbedLoading(false);
    if (res.success && res.data) {
      toast.success("Bulk embedding generation completed.");
      setEmbedResult(res.data as unknown as Record<string, unknown>);
    } else {
      toast.error(`Bulk embedding failed: ${res.error}`);
      setEmbedResult({ error: res.error });
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Health / Status Cards ──────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Intelligence Health
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {healthCards.map((card) => (
            <HealthStatCard key={card.label} card={card} />
          ))}
        </div>
      </section>

      {/* ── Bulk Actions ──────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Admin Bulk Actions
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Content Text Backfill */}
          <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md shrink-0 text-blue-600 bg-blue-50 dark:bg-blue-950/30">
                <FileSearch className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  Content Text Backfill
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Extracts and stores content text for documents that have OCR
                  data but no content row yet.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Batch Size (max 100)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={backfillBatch}
                  onChange={(e) =>
                    setBackfillBatch(parseInt(e.target.value, 10) || 50)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Resume from Doc ID</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="optional"
                  value={backfillResume}
                  onChange={(e) => setBackfillResume(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="backfill-dry"
                  checked={backfillDry}
                  onCheckedChange={(v) => setBackfillDry(!!v)}
                />
                <Label
                  htmlFor="backfill-dry"
                  className="text-xs cursor-pointer"
                >
                  Dry run
                </Label>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={runBackfill}
                disabled={backfillLoading}
              >
                {backfillLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5 mr-1.5" />
                )}
                {backfillLoading ? "Running…" : backfillDry ? "Dry Run" : "Run"}
              </Button>
            </div>

            {backfillResult && (
              <BackfillResultPanel
                result={backfillResult}
                onClear={() => setBackfillResult(null)}
              />
            )}
          </div>

          {/* AI Summary Bulk */}
          <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md shrink-0 text-purple-600 bg-purple-50 dark:bg-purple-950/30">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  AI Summary Bulk Generation
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Generates AI summaries for documents that have extracted
                  content but are missing a summary.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5 text-amber-800 dark:text-amber-300 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                This action calls the AI provider and may consume API credits.
                It never logs document content.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Batch Size (max 50)</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={summaryBatch}
                  onChange={(e) =>
                    setSummaryBatch(parseInt(e.target.value, 10) || 20)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Resume from Doc ID</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="optional"
                  value={summaryResume}
                  onChange={(e) => setSummaryResume(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="summary-dry"
                  checked={summaryDry}
                  onCheckedChange={(v) => setSummaryDry(!!v)}
                />
                <Label htmlFor="summary-dry" className="text-xs cursor-pointer">
                  Dry run
                </Label>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={runSummary}
                disabled={summaryLoading}
              >
                {summaryLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                )}
                {summaryLoading
                  ? "Running…"
                  : summaryDry
                  ? "Dry Run"
                  : "Run"}
              </Button>
            </div>

            {summaryResult && (
              <BulkResultPanel
                result={summaryResult}
                onClear={() => setSummaryResult(null)}
              />
            )}
          </div>

          {/* Intelligence Bulk Evaluation */}
          <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md shrink-0 text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30">
                <Brain className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  Intelligence Bulk Evaluation
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Recalculates completeness and risk scores for all documents
                  using deterministic rules. No AI cost.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Batch Size (max 100)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={evalBatch}
                  onChange={(e) =>
                    setEvalBatch(parseInt(e.target.value, 10) || 50)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Resume from Doc ID</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="optional"
                  value={evalResume}
                  onChange={(e) => setEvalResume(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="eval-dry"
                  checked={evalDry}
                  onCheckedChange={(v) => setEvalDry(!!v)}
                />
                <Label htmlFor="eval-dry" className="text-xs cursor-pointer">
                  Dry run
                </Label>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={runEval}
                disabled={evalLoading}
              >
                {evalLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Brain className="h-3.5 w-3.5 mr-1.5" />
                )}
                {evalLoading ? "Running…" : evalDry ? "Dry Run" : "Run"}
              </Button>
            </div>

            {evalResult && (
              <BulkResultPanel
                result={evalResult}
                onClear={() => setEvalResult(null)}
              />
            )}
          </div>

          {/* Semantic Embedding Bulk Generation (DMS 12.5) */}
          <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md shrink-0 text-sky-600 bg-sky-50 dark:bg-sky-950/30">
                <Compass className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  Semantic Embedding Bulk Generation
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Generates pgvector embeddings of AI summaries (or extracted text)
                  for documents that are missing one, enabling semantic search.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5 text-amber-800 dark:text-amber-300 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                This action calls the embedding API and may consume API credits.
                It never logs document content.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Batch Size (max 50)</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={embedBatch}
                  onChange={(e) => setEmbedBatch(parseInt(e.target.value, 10) || 20)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Resume from Doc ID</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="optional"
                  value={embedResume}
                  onChange={(e) => setEmbedResume(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="embed-dry"
                  checked={embedDry}
                  onCheckedChange={(v) => setEmbedDry(!!v)}
                />
                <Label htmlFor="embed-dry" className="text-xs cursor-pointer">
                  Dry run
                </Label>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={runEmbed}
                disabled={embedLoading}
              >
                {embedLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Compass className="h-3.5 w-3.5 mr-1.5" />
                )}
                {embedLoading ? "Running…" : embedDry ? "Dry Run" : "Run"}
              </Button>
            </div>

            {embedResult && (
              <BulkResultPanel
                result={embedResult}
                onClear={() => setEmbedResult(null)}
              />
            )}
          </div>
        </div>
      </section>

      {/* ── Feature Confirmation ──────────────────────────────────────────── */}
      <section>
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <h2 className="text-sm font-semibold text-foreground">
              DMS AI Intelligence Phase Status
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { phase: "12.1", label: "Content Text Foundation + FTS" },
              { phase: "12.2", label: "AI Document Summary" },
              { phase: "12.3", label: "Completeness, Risk, Enhanced Search" },
              {
                phase: "12.4",
                label: "AI Search, Ask AI, Auto Tags, Smart Links",
              },
              { phase: "12.4A", label: "QA, Polish, Admin Tools" },
              { phase: "12.5", label: "Semantic Search / pgvector / Embeddings" },
            ].map((p) => (
              <div
                key={p.phase}
                className="flex items-start gap-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-2.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] font-mono font-bold text-green-700 dark:text-green-400">
                    DMS {p.phase}
                  </div>
                  <div className="text-[10px] text-green-800 dark:text-green-300 mt-0.5">
                    {p.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Inline result panels (used inside the card bodies) ──────────────────────

function BackfillResultPanel({
  result,
  onClear,
}: {
  result: Record<string, unknown>;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const errors = result.errors as ErrorEntry[] | undefined;

  return (
    <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">Result</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={onClear}>
          Clear
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["processed", "skipped"] as const).map((k) => (
          <div key={k} className="bg-background rounded p-2 text-center">
            <div className="text-base font-bold text-foreground">
              {String(result[k] ?? "—")}
            </div>
            <div className="text-[10px] text-muted-foreground capitalize">{k}</div>
          </div>
        ))}
        {result.nextResumeDocumentId != null && (
          <div className="bg-background rounded p-2 text-center">
            <div className="text-base font-bold text-foreground">
              {String(result.nextResumeDocumentId)}
            </div>
            <div className="text-[10px] text-muted-foreground">Next Resume ID</div>
          </div>
        )}
      </div>
      {errors && errors.length > 0 && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-amber-600 font-medium"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {errors.length} error{errors.length !== 1 ? "s" : ""}
          </button>
          {expanded && (
            <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
              {errors.map((e, i) => (
                <li key={i} className="text-[10px] text-destructive">
                  Doc #{e.documentId}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BulkResultPanel({
  result,
  onClear,
}: {
  result: Record<string, unknown>;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const errors = result.errors as ErrorEntry[] | undefined;

  const displayKeys: { key: string; label: string }[] = [
    { key: "processed", label: "Processed" },
    { key: "skipped", label: "Skipped" },
    { key: "failed", label: "Failed" },
    { key: "nextResumeFromDocumentId", label: "Next Resume ID" },
  ];

  return (
    <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">Result</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={onClear}>
          Clear
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {displayKeys
          .filter((d) => d.key in result && result[d.key] !== undefined)
          .map((d) => (
            <div key={d.key} className="bg-background rounded p-2 text-center">
              <div className="text-base font-bold text-foreground">
                {result[d.key] != null ? String(result[d.key]) : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground">{d.label}</div>
            </div>
          ))}
      </div>
      {errors && errors.length > 0 && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-amber-600 font-medium"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {errors.length} error{errors.length !== 1 ? "s" : ""}
          </button>
          {expanded && (
            <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
              {errors.map((e, i) => (
                <li key={i} className="text-[10px] text-destructive">
                  Doc #{e.documentId}
                  {e.documentNo ? ` (${e.documentNo})` : ""}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
