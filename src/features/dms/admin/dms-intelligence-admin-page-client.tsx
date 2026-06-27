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
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Tag,
  Link2,
  FileSearch,
  ClipboardList,
  ShieldAlert,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { adminBackfillDmsContentText } from "@/server/actions/dms/document-content";
import { bulkGenerateMissingSummaries } from "@/server/actions/dms/ai-summary";
import { bulkEvaluateDmsDocuments } from "@/server/actions/dms/ai-intelligence";
import { bulkGenerateMissingDmsEmbeddings } from "@/server/actions/dms/semantic-search";
import {
  adminBackfillMissingOcrText,
  getDmsOcrBackfillQueueSummary,
  adminSemanticIndexBackfill,
  getSemanticIndexQueueSummary,
} from "@/server/actions/dms/intelligence-admin";
import { runDmsValidationForDocument } from "@/server/actions/dms/validation";
import { runDmsEntityMatchingForDocument } from "@/server/actions/dms/entity-matching";
import type { DmsValidationRunResult } from "@/lib/dms/validation/validation-types";
import type { DmsEntityMatchRunResult } from "@/lib/dms/entity-matching/entity-match-types";
import type {
  DmsIntelligenceAdminStats,
  OcrBackfillMode,
  OcrBackfillQueueSummary,
  SemanticIndexBackfillMode,
  SemanticIndexQueueSummary,
} from "@/server/actions/dms/intelligence-admin";

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

  // ── OCR backfill handler ──────────────────────────────────────────────────

  const [ocrBackfillResult, setOcrBackfillResult] = useState<Record<string, unknown> | null>(null);
  const [ocrBackfillLoading, setOcrBackfillLoading] = useState(false);
  const [ocrBackfillBatch, setOcrBackfillBatch] = useState(10);
  const [ocrBackfillResume, setOcrBackfillResume] = useState("");
  const [ocrBackfillTargetDoc, setOcrBackfillTargetDoc] = useState("");
  // Phase 10B: mode selector replaces the dryRun checkbox (kept as alias internally)
  const [ocrBackfillMode, setOcrBackfillMode] = useState<OcrBackfillMode>("dry_run");
  const [ocrBackfillDry, setOcrBackfillDry] = useState(false); // kept for backward-compat alias
  const [ocrQueueSummary, setOcrQueueSummary] = useState<OcrBackfillQueueSummary | null>(null);

  const runOcrBackfill = async () => {
    setOcrBackfillLoading(true);
    setOcrBackfillResult(null);

    const effectiveMode: OcrBackfillMode = ocrBackfillDry ? "dry_run" : ocrBackfillMode;
    const maxBatch = effectiveMode === "inline" ? 50 : 200;

    const res = await adminBackfillMissingOcrText({
      mode: effectiveMode,
      batchSize: Math.min(Math.max(1, ocrBackfillBatch), maxBatch),
      resumeFromId: ocrBackfillResume ? parseInt(ocrBackfillResume, 10) : undefined,
      targetDocumentId: ocrBackfillTargetDoc ? parseInt(ocrBackfillTargetDoc, 10) : undefined,
    });
    setOcrBackfillLoading(false);

    if (res.success && res.data) {
      const label = effectiveMode === "enqueue" ? "Jobs enqueued." : "OCR backfill completed.";
      toast.success(label);
      setOcrBackfillResult(res.data as unknown as Record<string, unknown>);

      // Refresh queue summary after enqueue
      if (effectiveMode === "enqueue") {
        const summary = await getDmsOcrBackfillQueueSummary();
        if (summary.success && summary.data) setOcrQueueSummary(summary.data);
      }
    } else {
      toast.error(`OCR backfill failed: ${res.error}`);
      setOcrBackfillResult({ error: res.error });
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

  // ── Semantic Index Backfill handler (Phase 11) ───────────────────────────────

  const [semanticMode, setSemanticMode] = useState<SemanticIndexBackfillMode>("dry_run");
  const [semanticBatch, setSemanticBatch] = useState(10);
  const [semanticResume, setSemanticResume] = useState("");
  const [semanticTarget, setSemanticTarget] = useState("");
  const [semanticForce, setSemanticForce] = useState(false);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticResult, setSemanticResult] = useState<Record<string, unknown> | null>(null);
  const [semanticQueueSummary, setSemanticQueueSummary] = useState<SemanticIndexQueueSummary | null>(null);

  const runSemanticBackfill = async () => {
    setSemanticLoading(true);
    setSemanticResult(null);
    const res = await adminSemanticIndexBackfill({
      mode:                  semanticMode,
      batchSize:             Math.min(100, Math.max(1, semanticBatch)),
      resumeFromDocumentId:  semanticResume ? parseInt(semanticResume, 10) : undefined,
      targetDocumentId:      semanticTarget ? parseInt(semanticTarget, 10) : undefined,
      forceRebuild:          semanticForce || semanticMode === "rebuild_all",
    });
    setSemanticLoading(false);
    if (res.success && res.data) {
      const d = res.data;
      toast.success(
        semanticMode === "dry_run"
          ? `Dry run: ${d.eligible} eligible docs, ~${d.estimatedChunks} estimated chunks.`
          : `Enqueued ${d.queued} jobs (${d.skipped} skipped, ${d.failed} failed).`
      );
      setSemanticResult(res.data as unknown as Record<string, unknown>);
      if (semanticMode !== "dry_run") {
        const summary = await getSemanticIndexQueueSummary();
        if (summary.success && summary.data) setSemanticQueueSummary(summary.data);
      }
    } else {
      toast.error(`Semantic backfill failed: ${res.error}`);
      setSemanticResult({ error: res.error });
    }
  };

  // ── Phase 13 — Validation / Entity Matching manual run ───────────────────────

  const [p13DocId, setP13DocId] = useState("");
  const [p13ValidationRunning, setP13ValidationRunning] = useState(false);
  const [p13MatchingRunning, setP13MatchingRunning]     = useState(false);
  const [p13ValidationResult, setP13ValidationResult]   = useState<(DmsValidationRunResult & { error?: string }) | null>(null);
  const [p13MatchingResult, setP13MatchingResult]       = useState<(DmsEntityMatchRunResult & { error?: string }) | null>(null);

  const handleRunValidation = async () => {
    const docId = parseInt(p13DocId, 10);
    if (!docId || isNaN(docId)) { toast.error("Enter a valid document ID"); return; }
    setP13ValidationRunning(true);
    setP13ValidationResult(null);
    const res = await runDmsValidationForDocument(docId);
    if (res.success && res.data) {
      setP13ValidationResult(res.data);
      toast.success(`Validation complete — ${res.data.findingsCreated} finding(s) created.`);
    } else {
      toast.error(res.error ?? "Validation failed");
      setP13ValidationResult({ documentId: docId, findingsCreated: 0, findingsSkipped: 0, findingIds: [], queueItemIds: [], errors: [], rulesFired: [], error: res.error });
    }
    setP13ValidationRunning(false);
  };

  const handleRunEntityMatching = async () => {
    const docId = parseInt(p13DocId, 10);
    if (!docId || isNaN(docId)) { toast.error("Enter a valid document ID"); return; }
    setP13MatchingRunning(true);
    setP13MatchingResult(null);
    const res = await runDmsEntityMatchingForDocument(docId);
    if (res.success && res.data) {
      setP13MatchingResult(res.data);
      toast.success(`Matching complete — ${res.data.candidatesCreated} candidate(s) created.`);
    } else {
      toast.error(res.error ?? "Entity matching failed");
      setP13MatchingResult({ documentId: docId, candidatesCreated: 0, candidatesSkipped: 0, candidateIds: [], queueItemIds: [], errors: [], targetsMatched: [], error: res.error });
    }
    setP13MatchingRunning(false);
  };

  return (
    <div className="space-y-6">
      {/* ── Observability Link ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Compass className="h-4 w-4" />
          <span>View token usage, cost estimates, and AI pipeline health</span>
        </div>
        <a
          href="/admin/dms/ai-observability"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          AI Observability Dashboard
        </a>
      </div>

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

          {/* OCR Backfill / Repair Missing Text */}
          <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md shrink-0 text-sky-600 bg-sky-50 dark:bg-sky-950/30">
                <FileSearch className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">OCR Backfill / Repair Missing Text</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Repairs files with no extracted text. Enqueue mode uses the Phase 10A
                  OCR router (local → Azure → GPT) via the async job queue.
                </div>
              </div>
            </div>

            {/* Mode selector */}
            <div className="space-y-1">
              <Label className="text-xs">Mode</Label>
              <div className="flex gap-2">
                {(["dry_run", "enqueue", "inline"] as OcrBackfillMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setOcrBackfillMode(m); setOcrBackfillDry(m === "dry_run"); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      ocrBackfillMode === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-foreground/40"
                    }`}
                  >
                    {m === "dry_run" ? "Dry Run" : m === "enqueue" ? "Enqueue Jobs" : "Inline (Legacy)"}
                  </button>
                ))}
              </div>
            </div>

            {/* Enqueue mode warnings */}
            {ocrBackfillMode === "enqueue" && (
              <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2.5 text-blue-800 dark:text-blue-300 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Requires <strong>DMS_OCR_BACKFILL_QUEUE=true</strong>, <strong>DMS_AI_JOB_QUEUE=true</strong>, and <strong>DMS_AI_JOB_QUEUE_WORKER_ENABLED=true</strong> with a running worker. Jobs stay queued until the worker processes them.
                </span>
              </div>
            )}

            {ocrBackfillMode === "inline" && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5 text-amber-800 dark:text-amber-300 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Legacy mode: calls GPT-4.1 per file synchronously. May use significant API credits and can timeout for large batches. Max 50 files.</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">
                  Batch Size (max {ocrBackfillMode === "inline" ? 50 : 200})
                </Label>
                <Input
                  type="number" min={1} max={ocrBackfillMode === "inline" ? 50 : 200}
                  value={ocrBackfillBatch}
                  onChange={(e) => setOcrBackfillBatch(parseInt(e.target.value, 10) || 10)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Resume from Document ID</Label>
                <Input
                  type="number" min={1} placeholder="optional"
                  value={ocrBackfillResume}
                  onChange={(e) => setOcrBackfillResume(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Target specific Document ID (leave blank for all broken)</Label>
              <Input
                type="number" min={1} placeholder="optional — e.g. 13"
                value={ocrBackfillTargetDoc}
                onChange={(e) => setOcrBackfillTargetDoc(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="flex items-center justify-end">
              <Button size="sm" className="h-8 text-xs" onClick={runOcrBackfill} disabled={ocrBackfillLoading}>
                {ocrBackfillLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5 mr-1.5" />
                )}
                {ocrBackfillLoading
                  ? "Running…"
                  : ocrBackfillMode === "dry_run"
                  ? "Dry Run"
                  : ocrBackfillMode === "enqueue"
                  ? "Enqueue Jobs"
                  : "Run OCR Backfill"}
              </Button>
            </div>

            {/* Queue summary (shown after enqueue or on demand) */}
            {ocrQueueSummary && (
              <div className="rounded-md border border-border/50 bg-muted/30 p-2.5 text-xs space-y-1">
                <div className="font-semibold text-foreground text-[11px] uppercase tracking-wide">Queue Status — OCR Backfill</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: "Queued",    value: ocrQueueSummary.queued,          color: "text-blue-600" },
                    { label: "Running",   value: ocrQueueSummary.running,         color: "text-amber-600" },
                    { label: "Retry",     value: ocrQueueSummary.retry_scheduled, color: "text-orange-600" },
                    { label: "Completed", value: ocrQueueSummary.completed,       color: "text-green-600" },
                    { label: "Failed",    value: ocrQueueSummary.failed,          color: "text-red-600" },
                    { label: "Cancelled", value: ocrQueueSummary.cancelled,       color: "text-muted-foreground" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex flex-col">
                      <span className={`font-bold text-sm ${color}`}>{value}</span>
                      <span className="text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ocrBackfillResult && (
              <ResultPanel result={ocrBackfillResult} onClear={() => setOcrBackfillResult(null)} />
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

      {/* ── Phase 11 — Semantic Index Backfill ────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Compass className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Semantic Index Backfill (Phase 11)
          </h2>
        </div>
        <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md shrink-0 text-violet-600 bg-violet-50 dark:bg-violet-950/30">
              <Compass className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Semantic Document Index Backfill</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Enqueues <code className="text-[10px] font-mono">semantic_document_index</code> jobs for documents
                with content text that have no active chunks or stale chunk content.
                Requires <code className="text-[10px] font-mono">DMS_SEMANTIC_CHUNKING</code>,{" "}
                <code className="text-[10px] font-mono">DMS_SEMANTIC_INDEX_QUEUE</code>, and{" "}
                <code className="text-[10px] font-mono">DMS_AI_JOB_QUEUE</code> to be enabled for enqueue/rebuild modes.
              </div>
            </div>
          </div>

          {/* Mode selector */}
          <div className="space-y-1">
            <Label className="text-xs">Mode</Label>
            <div className="flex gap-2 flex-wrap">
              {(["dry_run", "enqueue", "rebuild_all"] as SemanticIndexBackfillMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSemanticMode(m)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    semanticMode === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/40"
                  }`}
                >
                  {m === "dry_run" ? "Dry Run" : m === "enqueue" ? "Enqueue Jobs" : "Rebuild All"}
                </button>
              ))}
            </div>
          </div>

          {semanticMode !== "dry_run" && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5 text-amber-800 dark:text-amber-300 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Requires <strong>DMS_SEMANTIC_CHUNKING</strong>, <strong>DMS_SEMANTIC_INDEX_QUEUE</strong>,
                and <strong>DMS_AI_JOB_QUEUE</strong> flags to be enabled. Queue payload contains only
                document IDs — never content text.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Batch Size (max 100)</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={semanticBatch}
                onChange={(e) => setSemanticBatch(parseInt(e.target.value, 10) || 10)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Resume from Doc ID</Label>
              <Input
                type="number"
                min={1}
                placeholder="optional"
                value={semanticResume}
                onChange={(e) => setSemanticResume(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Target Doc ID (single)</Label>
              <Input
                type="number"
                min={1}
                placeholder="optional"
                value={semanticTarget}
                onChange={(e) => setSemanticTarget(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1 flex flex-col justify-end pb-0.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="semantic-force"
                  checked={semanticForce}
                  onCheckedChange={(v) => setSemanticForce(!!v)}
                />
                <Label htmlFor="semantic-force" className="text-xs cursor-pointer">
                  Force rebuild
                </Label>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={runSemanticBackfill}
              disabled={semanticLoading}
            >
              {semanticLoading ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5 mr-1.5" />
              )}
              {semanticLoading ? "Running…" : semanticMode === "dry_run" ? "Dry Run" : "Run"}
            </Button>
          </div>

          {/* Result */}
          {semanticResult && (
            <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">Result</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setSemanticResult(null)}>
                  Clear
                </Button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {(["eligible", "queued", "skipped", "failed", "estimatedChunks"] as const).map((k) => (
                  <div key={k} className="bg-background rounded p-2 text-center">
                    <div className="text-base font-bold text-foreground">
                      {String(semanticResult[k] ?? "—")}
                    </div>
                    <div className="text-[10px] text-muted-foreground capitalize">{k === "estimatedChunks" ? "Est. Chunks" : k}</div>
                  </div>
                ))}
              </div>
              {semanticResult.nextResumeId != null && (
                <div className="text-[10px] text-muted-foreground">
                  Next resume ID: {String(semanticResult.nextResumeId)}
                </div>
              )}
              {Array.isArray(semanticResult.errors) && (semanticResult.errors as string[]).length > 0 && (
                <ul className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                  {(semanticResult.errors as string[]).map((e, i) => (
                    <li key={i} className="text-[10px] text-destructive">{e}</li>
                  ))}
                </ul>
              )}
              {!!semanticResult.error && (
                <div className="text-[10px] text-destructive">{String(semanticResult.error)}</div>
              )}
            </div>
          )}

          {/* Queue summary */}
          {semanticQueueSummary && (
            <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs space-y-2">
              <span className="font-semibold text-foreground">Queue Summary — semantic_document_index</span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {(["queued", "running", "retry_scheduled", "completed", "failed", "cancelled"] as const).map((k) => (
                  <div key={k} className="bg-background rounded p-2 text-center">
                    <div className="text-base font-bold text-foreground">{semanticQueueSummary[k]}</div>
                    <div className="text-[10px] text-muted-foreground capitalize">{k.replace("_", " ")}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Phase 13 — Validation & Entity Matching Manual Run ─────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Phase 13 — Validation &amp; Entity Matching (Manual Run)
          </h2>
        </div>
        <div className="rounded-lg border border-border/50 bg-card p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Run validation and entity matching for a specific document.
            Both require their respective feature flags to be enabled
            (<code className="font-mono text-[10px]">DMS_AI_VALIDATION</code> and{" "}
            <code className="font-mono text-[10px]">DMS_AI_ENTITY_MATCHING</code>).
            Actions create findings/candidates for human review only — no auto-save or auto-linking.
          </p>

          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <Label htmlFor="p13-doc-id" className="text-xs">Document ID</Label>
              <Input
                id="p13-doc-id"
                type="number"
                value={p13DocId}
                onChange={(e) => setP13DocId(e.target.value)}
                placeholder="e.g. 1001"
                className="w-36 h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunValidation}
              disabled={p13ValidationRunning || p13MatchingRunning || !p13DocId}
              className="h-8"
            >
              <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
              {p13ValidationRunning ? "Running…" : "Run Validation"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunEntityMatching}
              disabled={p13ValidationRunning || p13MatchingRunning || !p13DocId}
              className="h-8"
            >
              <Search className="h-3.5 w-3.5 mr-1.5" />
              {p13MatchingRunning ? "Running…" : "Run Entity Matching"}
            </Button>
          </div>

          {p13ValidationResult && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs space-y-1">
              <p className="font-semibold text-amber-800">Validation Result</p>
              {p13ValidationResult.error
                ? <p className="text-red-600">{p13ValidationResult.error}</p>
                : (
                  <div className="flex flex-wrap gap-3 text-amber-700">
                    <span>Created: <strong>{p13ValidationResult.findingsCreated}</strong></span>
                    <span>Skipped: <strong>{p13ValidationResult.findingsSkipped}</strong></span>
                    <span>Queue items: <strong>{p13ValidationResult.queueItemIds.length}</strong></span>
                    {p13ValidationResult.rulesFired.length > 0 && (
                      <span>Rules: <strong>{p13ValidationResult.rulesFired.join(", ")}</strong></span>
                    )}
                  </div>
                )
              }
            </div>
          )}

          {p13MatchingResult && (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs space-y-1">
              <p className="font-semibold text-sky-800">Entity Matching Result</p>
              {p13MatchingResult.error
                ? <p className="text-red-600">{p13MatchingResult.error}</p>
                : (
                  <div className="flex flex-wrap gap-3 text-sky-700">
                    <span>Created: <strong>{p13MatchingResult.candidatesCreated}</strong></span>
                    <span>Skipped: <strong>{p13MatchingResult.candidatesSkipped}</strong></span>
                    <span>Queue items: <strong>{p13MatchingResult.queueItemIds.length}</strong></span>
                    {p13MatchingResult.targetsMatched.length > 0 && (
                      <span>Targets: <strong>{p13MatchingResult.targetsMatched.join(", ")}</strong></span>
                    )}
                  </div>
                )
              }
            </div>
          )}
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
