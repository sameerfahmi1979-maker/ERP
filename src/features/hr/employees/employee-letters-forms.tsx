"use client";

/**
 * OUTPUT.4 — Employee "Letters & Forms" experience.
 *
 * Registry-driven catalog (classes A–D) + issued-document history for one
 * employee. Official issuance goes ONLY through the global output coordinator;
 * Quick Print stays available where class policy allows it (watermarked in the
 * preview dialog). Analytical reports (Class E) remain in the Report Center.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  ClipboardList,
  CreditCard,
  Download,
  Eye,
  FileText,
  HardHat,
  History,
  Hourglass,
  Languages,
  Loader2,
  Lock,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Stamp,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { LetterPreviewDialog } from "@/features/report-center/letter-preview-dialog";
import {
  listEmployeeOutputCatalog,
  type EmployeeOutputCatalogItem,
} from "@/server/actions/output/output-catalog";
import type { OfficialDocumentLanguage } from "@/lib/official-documents/types";
import {
  deleteIssuance,
  getIssuanceDownloadUrl,
  listRecordIssuances,
  reissueOfficialDocument,
  revokeIssuance,
  type IssuanceHistoryItem,
} from "@/server/actions/output/issuance-history";
import { generateOfficialDocument } from "@/server/actions/output/generate-official-document";

interface EmployeeLettersFormsProps {
  employeeId: number;
  employeeName?: string;
}

const GROUP_LABELS: Record<EmployeeOutputCatalogItem["group"], string> = {
  official: "Official Letters & Certificates",
  form: "Internal Forms & Checklists",
  card: "Cards & Badges",
};

const GROUP_ORDER: EmployeeOutputCatalogItem["group"][] = ["official", "form", "card"];

function categoryIcon(category: string) {
  switch (category) {
    case "letter":
      return <FileText className="h-4 w-4" />;
    case "certificate":
      return <Award className="h-4 w-4" />;
    case "checklist":
      return <ClipboardList className="h-4 w-4" />;
    case "form":
      return <HardHat className="h-4 w-4" />;
    case "badge":
      return <CreditCard className="h-4 w-4" />;
    default:
      return <CheckSquare className="h-4 w-4" />;
  }
}

function statusBadge(item: IssuanceHistoryItem) {
  switch (item.status) {
    case "issued":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-transparent gap-1">
          <BadgeCheck className="h-3 w-3" /> Issued
        </Badge>
      );
    case "revoked":
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-transparent gap-1">
          <XCircle className="h-3 w-3" /> Revoked
        </Badge>
      );
    case "superseded":
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-transparent gap-1">
          <RotateCcw className="h-3 w-3" /> Superseded
        </Badge>
      );
    case "expired":
      return <Badge variant="outline">Expired</Badge>;
    case "failed":
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-transparent">
          Failed
        </Badge>
      );
    case "cancelled":
      return <Badge variant="outline">Cancelled</Badge>;
    default:
      return <Badge variant="outline">In progress</Badge>;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function EmployeeLettersForms({ employeeId, employeeName }: EmployeeLettersFormsProps) {
  const [catalog, setCatalog] = useState<EmployeeOutputCatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [history, setHistory] = useState<IssuanceHistoryItem[]>([]);
  const [canRevoke, setCanRevoke] = useState(false);
  const [canReissue, setCanReissue] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [isLoading, startLoading] = useTransition();
  const [search, setSearch] = useState("");

  // History table state
  const [histSearch, setHistSearch] = useState("");
  const [sortCol, setSortCol] = useState<"file_name" | "status" | "issued_at" | "serial_no">("issued_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [histPage, setHistPage] = useState(1);
  const HIST_PAGE_SIZE = 10;

  const [preview, setPreview] = useState<{ outputCode: string; label: string } | null>(null);
  const [issuingCode, setIssuingCode] = useState<string | null>(null);

  // Generation panel (language + minimal allowlisted inputs) — only shown
  // when the fixed definition offers language variants or declares inputs.
  const [generateTarget, setGenerateTarget] = useState<EmployeeOutputCatalogItem | null>(null);
  const [genLanguage, setGenLanguage] = useState<OfficialDocumentLanguage>("en");
  const [genInputs, setGenInputs] = useState<Record<string, string>>({});

  // Inline result banner — official-generation outcomes must stay visible
  // (blocked reasons are actionable, e.g. "complete the disciplinary record"),
  // not only flash as a transient toast.
  const [generateResult, setGenerateResult] = useState<{
    kind: "success" | "warning" | "error";
    title: string;
    message: string;
  } | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<IssuanceHistoryItem | null>(null);
  const [reissueTarget, setReissueTarget] = useState<IssuanceHistoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IssuanceHistoryItem | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Repeat-generation: when a duplicate_content_warning is returned, store the
  // originating item so the user can confirm a deliberate new issuance.
  const [repeatTarget, setRepeatTarget] = useState<{
    item: EmployeeOutputCatalogItem;
    language: OfficialDocumentLanguage;
    inputs: Record<string, string>;
  } | null>(null);

  const refreshHistory = useCallback(async () => {
    const res = await listRecordIssuances({ sourceRecordType: "employee", recordId: employeeId });
    if (res.success && res.data) {
      setHistory(res.data.items);
      setCanRevoke(res.data.canRevoke);
      setCanReissue(res.data.canReissue);
      setCanDelete(res.data.canDelete);
    }
  }, [employeeId]);

  useEffect(() => {
    startLoading(async () => {
      const [catRes] = await Promise.all([listEmployeeOutputCatalog(), refreshHistory()]);
      if (catRes.success && catRes.data) {
        setCatalog(catRes.data);
        setCatalogError(null);
      } else {
        setCatalogError(catRes.error ?? "Failed to load the document catalog.");
      }
    });
  }, [employeeId, refreshHistory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [catalog, search]);

  const grouped = useMemo(() => {
    const map = new Map<EmployeeOutputCatalogItem["group"], EmployeeOutputCatalogItem[]>();
    for (const item of filtered) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return map;
  }, [filtered]);

  /** Opens the generation panel when needed, otherwise issues in one click. */
  const handleGenerateClick = (item: EmployeeOutputCatalogItem) => {
    setGenerateResult(null);
    if (item.languages.length > 1 || item.optionalInputs.length > 0) {
      setGenLanguage(item.languages[0] ?? "en");
      setGenInputs({});
      setGenerateTarget(item);
    } else {
      void handleOfficialIssue(item);
    }
  };

  const handleOfficialIssue = async (
    item: EmployeeOutputCatalogItem,
    language: OfficialDocumentLanguage = "en",
    inputs: Record<string, string> = {},
    authorizeReissue = false
  ) => {
    if (issuingCode) return;
    setIssuingCode(item.outputCode);
    setGenerateResult(null);
    setRepeatTarget(null);
    try {
      const outcome = await generateOfficialDocument(item.outputCode, employeeId, {
        issueQr: item.qrPolicy !== "none",
        clientRequestToken: crypto.randomUUID(),
        language,
        inputs,
        authorizeReissue,
      });
      if (outcome.success) {
        toast.success(`${item.name} issued`, {
          description: outcome.qr
            ? "The document was issued with a verification QR. Opening download…"
            : "The document was issued and stored. Opening download…",
        });
        setGenerateResult({
          kind: "success",
          title: `${item.name} issued${outcome.serialNo ? ` — ${outcome.serialNo}` : ""}`,
          message: outcome.qr
            ? "The document was issued with a verification QR and stored. The download opened in a new tab; it is also available in Issued Documents below."
            : "The document was issued and stored. The download opened in a new tab; it is also available in Issued Documents below.",
        });
        setGenerateTarget(null);
        if (outcome.downloadUrl) window.open(outcome.downloadUrl, "_blank");
        await refreshHistory();
      } else if (outcome.blocked === "duplicate_content_warning") {
        // The exact same content was already issued. Present a deliberate repeat-
        // generation confirmation — a new issuance with a new serial and new hash.
        // This is separate from Reissue/Supersede which marks the old copy superseded.
        setRepeatTarget({ item, language, inputs });
        setGenerateTarget(null);
        setGenerateResult({
          kind: "warning",
          title: "An identical document is already issued",
          message:
            "The existing issuance is shown in Issued Documents below. " +
            "To open or reprint the original, use the Download button there. " +
            "To create a new independent issuance with a fresh serial, click Generate New Issuance.",
        });
        await refreshHistory();
      } else if (outcome.blocked === "approval_required") {
        toast.error("Approval required", {
          description: `${item.name} needs an approver to issue it. Ask a user with document approval rights.`,
        });
        setGenerateResult({
          kind: "error",
          title: "Approval required",
          message: `${item.name} needs an approver to issue it. Ask a user with document approval rights.`,
        });
      } else {
        toast.error("Official issue failed", { description: outcome.error });
        setGenerateResult({
          kind: "error",
          title: `${item.name} was not issued`,
          message: outcome.error ?? "Generation failed. Please try again or contact an administrator.",
        });
      }
    } finally {
      setIssuingCode(null);
    }
  };

  const handleDownload = async (item: IssuanceHistoryItem) => {
    setDownloadingId(item.id);
    try {
      const res = await getIssuanceDownloadUrl(item.id);
      if (res.success && res.data) {
        window.open(res.data.url, "_blank");
      } else {
        toast.error("Download failed", { description: res.error });
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRevokeSubmit = async () => {
    if (!revokeTarget) return;
    setActionPending(true);
    try {
      const res = await revokeIssuance({ issuanceId: revokeTarget.id, reason: actionReason });
      if (res.success) {
        toast.success("Document revoked", {
          description: "The document and its verification link are no longer valid.",
        });
        setRevokeTarget(null);
        setActionReason("");
        await refreshHistory();
      } else {
        toast.error("Revoke failed", { description: res.error });
      }
    } finally {
      setActionPending(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!deleteTarget) return;
    setActionPending(true);
    try {
      const res = await deleteIssuance({ issuanceId: deleteTarget.id });
      if (res.success) {
        toast.success("Failed artifact removed", {
          description: "The failed generation record has been cleaned up.",
        });
        setDeleteTarget(null);
        await refreshHistory();
      } else {
        toast.error("Remove failed", { description: res.error });
      }
    } finally {
      setActionPending(false);
    }
  };

  const handleReissueSubmit = async () => {
    if (!reissueTarget) return;
    setActionPending(true);
    try {
      const outcome = await reissueOfficialDocument({
        issuanceId: reissueTarget.id,
        reason: actionReason,
        issueQr: false,
      });
      if (outcome.success) {
        toast.success("Document reissued", {
          description: "A superseding copy was issued. The previous copy is marked superseded.",
        });
        setReissueTarget(null);
        setActionReason("");
        if (outcome.downloadUrl) window.open(outcome.downloadUrl, "_blank");
        await refreshHistory();
      } else {
        toast.error("Reissue failed", { description: outcome.error });
      }
    } finally {
      setActionPending(false);
    }
  };

  const previewItem = preview ? catalog.find((c) => c.outputCode === preview.outputCode) : null;

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setHistPage(1);
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) => {
    if (sortCol !== col) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const filteredHistory = useMemo(() => {
    const q = histSearch.trim().toLowerCase();
    const rows = q
      ? history.filter(
          (r) =>
            r.file_name.toLowerCase().includes(q) ||
            (r.serial_no ?? "").toLowerCase().includes(q) ||
            (r.output_code ?? "").toLowerCase().includes(q) ||
            r.status.toLowerCase().includes(q)
        )
      : history;

    return [...rows].sort((a, b) => {
      let av = "";
      let bv = "";
      if (sortCol === "file_name") { av = a.file_name; bv = b.file_name; }
      else if (sortCol === "status") { av = a.status; bv = b.status; }
      else if (sortCol === "issued_at") { av = a.issued_at ?? a.generated_at ?? ""; bv = b.issued_at ?? b.generated_at ?? ""; }
      else if (sortCol === "serial_no") { av = a.serial_no ?? ""; bv = b.serial_no ?? ""; }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [history, histSearch, sortCol, sortDir]);

  const totalHistPages = Math.max(1, Math.ceil(filteredHistory.length / HIST_PAGE_SIZE));
  const pagedHistory = filteredHistory.slice((histPage - 1) * HIST_PAGE_SIZE, histPage * HIST_PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* ── Catalog ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Generate official HR letters, certificates, forms, and cards for{" "}
          <span className="font-medium text-foreground">{employeeName ?? "this employee"}</span>.
          Official copies are issued, stored, and verifiable; previews and quick prints are
          watermarked drafts.
        </p>
        {catalog.length > 6 && (
          <div className="relative shrink-0 w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        )}
      </div>

      {isLoading && catalog.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading document catalog…
        </div>
      )}
      {catalogError && (
        <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded-lg p-3">
          {catalogError}
        </div>
      )}

      {generateResult && (
        <div
          role="status"
          className={`flex items-start gap-2.5 text-sm rounded-lg border p-3 ${
            generateResult.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              : generateResult.kind === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                : "border-destructive/25 bg-destructive/5 text-destructive"
          }`}
        >
          {generateResult.kind === "success" ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium">{generateResult.title}</p>
            <p className="mt-0.5 opacity-90">{generateResult.message}</p>
            {/* Deliberate repeat generation — only shown when a duplicate was detected */}
            {generateResult.kind === "warning" && repeatTarget && (
              <div className="mt-2.5 flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  disabled={issuingCode !== null}
                  onClick={() => {
                    const t = repeatTarget;
                    setRepeatTarget(null);
                    void handleOfficialIssue(t.item, t.language, t.inputs, true);
                  }}
                >
                  {issuingCode ? <Loader2 className="h-3 w-3 animate-spin" /> : <Stamp className="h-3 w-3" />}
                  Generate New Issuance
                </Button>
                <span className="text-[11px] opacity-75">
                  Creates a new independent copy with a fresh serial and date.
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            className="shrink-0 opacity-60 hover:opacity-100"
            onClick={() => { setGenerateResult(null); setRepeatTarget(null); }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {GROUP_ORDER.map((group) => {
        const items = grouped.get(group);
        if (!items || items.length === 0) return null;
        return (
          <div key={group} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {GROUP_LABELS[group]}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {items.map((item) => (
                <div
                  key={item.outputCode}
                  className={`rounded-lg border p-3 transition-colors ${
                    item.canGenerate && item.generatable
                      ? "bg-card hover:bg-muted/40"
                      : "bg-muted/20 opacity-70"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="text-muted-foreground mt-0.5 shrink-0">
                      {categoryIcon(item.category)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                        {item.sensitive && (
                          <Badge
                            variant="outline"
                            className="text-[10px] gap-0.5 border-amber-300 text-amber-700 dark:text-amber-400"
                          >
                            <ShieldAlert className="h-2.5 w-2.5" /> Sensitive
                          </Badge>
                        )}
                        {item.approvalRequired && (
                          <Badge
                            variant="outline"
                            className="text-[10px] gap-0.5 border-blue-300 text-blue-700 dark:text-blue-400"
                          >
                            <Shield className="h-2.5 w-2.5" /> Approval
                          </Badge>
                        )}
                        {item.qrPolicy !== "none" && item.group === "official" && (
                          <Badge variant="outline" className="text-[10px] gap-0.5">
                            <QrCode className="h-2.5 w-2.5" />
                            {item.qrPolicy === "days" && item.qrValidityDays
                              ? `QR ${item.qrValidityDays}d`
                              : "QR"}
                          </Badge>
                        )}
                        {item.languages.length > 1 && (
                          <Badge variant="outline" className="text-[10px] gap-0.5">
                            <Languages className="h-2.5 w-2.5" />
                            {item.languages.includes("bilingual") ? "EN · AR · Bilingual" : "EN · AR"}
                          </Badge>
                        )}
                        {!item.generatable && (
                          <Badge
                            variant="outline"
                            className="text-[10px] gap-0.5 border-slate-300 text-slate-500 dark:text-slate-400"
                          >
                            <Hourglass className="h-2.5 w-2.5" /> Pending Wording Approval
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      {!item.canGenerate && (
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                          <Lock className="h-3 w-3" /> You don&apos;t have access to generate this
                          document.
                        </p>
                      )}
                      {item.canGenerate && !item.generatable && (
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                          <Hourglass className="h-3 w-3" /> Pending Business Wording Approval — official wording for this document must be reviewed and approved before generation is enabled.
                        </p>
                      )}
                    </div>
                  </div>
                  {item.canGenerate && item.generatable && (
                    <div className="flex items-center gap-1.5 mt-2.5 justify-end">
                      {/* Preview stays only for legacy (non-catalog) outputs —
                          catalog documents open the real issued PDF, so a
                          divergent draft preview would break parity. */}
                      {item.wordingStatus === "legacy" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setPreview({ outputCode: item.outputCode, label: item.name })}
                        >
                          <Eye className="h-3 w-3" />
                          Preview
                        </Button>
                      )}
                      {item.official && (
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleGenerateClick(item)}
                          disabled={issuingCode !== null}
                        >
                          {issuingCode === item.outputCode ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Stamp className="h-3 w-3" />
                          )}
                          {issuingCode === item.outputCode ? "Issuing…" : "Generate"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* AI draft is a separate, human-review-first path */}
      <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Need a custom letter? Use <span className="font-medium text-foreground">AI Review → Letter/Email Draft</span>{" "}
          to draft one — drafts always require human review and can never be issued, signed, or sent
          automatically.
        </span>
      </div>

      {/* ── Issued document history ─────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Issued Documents
            {history.length > 0 && (
              <span className="text-muted-foreground font-normal normal-case tracking-normal">
                ({history.length})
              </span>
            )}
          </h4>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  value={histSearch}
                  onChange={(e) => { setHistSearch(e.target.value); setHistPage(1); }}
                  placeholder="Search history…"
                  className="h-7 pl-7 text-xs w-44"
                />
              </div>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => refreshHistory()}>
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>
        </div>

        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground border rounded-lg p-3 bg-muted/20">
            No officially issued documents yet for this employee.
          </p>
        ) : filteredHistory.length === 0 ? (
          <p className="text-xs text-muted-foreground border rounded-lg p-3 bg-muted/20">
            No documents match your search.
          </p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[90px]" />
                <col className="w-[88px]" />
                <col className="hidden md:table-column w-[150px]" />
                <col className="w-[100px]" />
              </colgroup>
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">
                    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("file_name")}>
                      Document <SortIcon col="file_name" />
                    </button>
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("status")}>
                      Status <SortIcon col="status" />
                    </button>
                  </th>
                  <th className="text-left font-medium px-3 py-2">
                    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("issued_at")}>
                      Issued <SortIcon col="issued_at" />
                    </button>
                  </th>
                  <th className="text-left font-medium px-3 py-2 hidden md:table-cell">
                    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("serial_no")}>
                      Serial <SortIcon col="serial_no" />
                    </button>
                  </th>
                  <th className="text-right font-medium px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedHistory.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 min-w-0">
                      <div className="font-medium text-foreground truncate" title={item.file_name.replace(/\.pdf$/i, "").replace(/_/g, " ")}>
                        {item.file_name.replace(/\.pdf$/i, "").replace(/_/g, " ")}
                      </div>
                      {item.status === "revoked" && item.revoke_reason && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          Reason: {item.revoke_reason}
                        </div>
                      )}
                      {item.status === "failed" && item.failure_reason && (
                        <div className="text-[11px] text-destructive truncate">
                          {item.failure_reason}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{statusBadge(item)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {formatDate(item.issued_at ?? item.generated_at)}
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      <span className="block truncate font-mono text-[10px] text-muted-foreground" title={item.serial_no ?? ""}>
                        {item.serial_no ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-0.5 justify-end flex-nowrap">
                        {/* Download — any status with a stored file */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Download PDF"
                          onClick={() => handleDownload(item)}
                          disabled={downloadingId === item.id || item.status === "failed" || item.status === "cancelled"}
                        >
                          {downloadingId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                        </Button>

                        {/* Reissue */}
                        {item.status === "issued" && canReissue && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Reissue (superseding copy)"
                            onClick={() => { setActionReason(""); setReissueTarget(item); }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {/* Revoke */}
                        {item.status === "issued" && canRevoke && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                            title="Revoke document"
                            onClick={() => { setActionReason(""); setRevokeTarget(item); }}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {/* Remove failed artifact — system admin only, never for issued/revoked/superseded */}
                        {canDelete && (item.status === "failed" || item.status === "cancelled") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Remove failed generation artifact"
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalHistPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
                <span>
                  {(histPage - 1) * HIST_PAGE_SIZE + 1}–{Math.min(histPage * HIST_PAGE_SIZE, filteredHistory.length)} of {filteredHistory.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={histPage === 1}
                    onClick={() => setHistPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span>Page {histPage} / {totalHistPages}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={histPage === totalHistPages}
                    onClick={() => setHistPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Generation panel (language + minimal inputs) ─────────────────── */}
      <ERPChildDialogForm
        open={!!generateTarget}
        onOpenChange={(open) => {
          if (!open) setGenerateTarget(null);
        }}
        title={generateTarget ? `Generate ${generateTarget.name}` : "Generate Document"}
        subtitle="The document is generated from verified ERP data using the fixed approved template."
        icon={<Stamp className="h-5 w-5" />}
        mode="add"
        size="md"
        isSubmitting={issuingCode !== null}
        onSubmit={() => {
          if (generateTarget) void handleOfficialIssue(generateTarget, genLanguage, genInputs);
        }}
        submitLabel="Generate Official"
      >
        <div className="grid grid-cols-12 gap-4">
          {generateResult && generateResult.kind === "error" && (
            <div className="col-span-12 flex items-start gap-2 text-sm rounded-md border border-destructive/25 bg-destructive/5 text-destructive p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">{generateResult.title}</p>
                <p className="mt-0.5 opacity-90">{generateResult.message}</p>
              </div>
            </div>
          )}

          {/* ── Effective generation policy (governed, not user-selectable) ── */}
          {generateTarget && (
            <div className="col-span-12 rounded-md border bg-muted/30 px-3 py-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Effective Policy
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Company letterhead:{" "}
                  <span className="text-foreground font-medium">
                    Employee&apos;s company (auto-resolved)
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <QrCode className="h-3 w-3" />
                  QR verification:{" "}
                  <span className="text-foreground font-medium">
                    {generateTarget.qrPolicy === "none"
                      ? "Not issued (policy)"
                      : generateTarget.qrPolicy === "days" && generateTarget.qrValidityDays
                      ? `${generateTarget.qrValidityDays}-day token`
                      : generateTarget.qrPolicy === "long_term"
                      ? "Long-term token"
                      : "Until revoked"}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Stamp className="h-3 w-3" />
                  Stamp/signature:{" "}
                  <span className="text-foreground font-medium">
                    Applied if authorized (server-side)
                  </span>
                </span>
                {generateTarget.approvalRequired && (
                  <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                    <BadgeCheck className="h-3 w-3" />
                    Approval required to issue
                  </span>
                )}
              </div>
            </div>
          )}

          {generateTarget && generateTarget.languages.length > 1 && (
            <div className="col-span-12">
              <label className="text-sm font-medium">Language</label>
              <div className="flex gap-2 mt-1.5">
                {generateTarget.languages.map((lang) => (
                  <Button
                    key={lang}
                    type="button"
                    variant={genLanguage === lang ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setGenLanguage(lang)}
                  >
                    {lang === "en" ? "English" : lang === "ar" ? "العربية" : "Bilingual EN + AR"}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {(generateTarget?.optionalInputs ?? []).map((field) => (
            <div key={field.key} className="col-span-12">
              <label className="text-sm font-medium">
                {field.labelEn}
                {field.required && <span className="text-destructive"> *</span>}
              </label>
              <Input
                value={genInputs[field.key] ?? ""}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                onChange={(e) =>
                  setGenInputs((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                className="mt-1"
              />
              {field.helpText && (
                <p className="text-[11px] text-muted-foreground mt-1">{field.helpText}</p>
              )}
            </div>
          ))}
        </div>
      </ERPChildDialogForm>

      {/* ── Preview dialog (quick print = watermarked draft) ────────────── */}
      <LetterPreviewDialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
        reportCode={preview?.outputCode ?? ""}
        reportLabel={preview?.label ?? ""}
        employeeId={employeeId}
        employeeName={employeeName}
        allowQuickPrint={previewItem?.allowQuickPrint ?? true}
      />

      {/* ── Revoke dialog ───────────────────────────────────────────────── */}
      <ERPChildDialogForm
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="Revoke Issued Document"
        subtitle="The document and its public verification link become permanently invalid."
        icon={<XCircle className="h-5 w-5" />}
        mode="edit"
        size="sm"
        isSubmitting={actionPending}
        onSubmit={handleRevokeSubmit}
        submitLabel="Revoke Document"
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 text-sm text-muted-foreground">
            You are revoking{" "}
            <span className="font-medium text-foreground">
              {revokeTarget?.file_name.replace(/\.pdf$/i, "").replace(/_/g, " ")}
            </span>
            . This cannot be undone.
          </div>
          <div className="col-span-12">
            <label className="text-sm font-medium">
              Reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Why is this document being revoked? (min 5 characters)"
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
      </ERPChildDialogForm>

      {/* ── Reissue dialog ──────────────────────────────────────────────── */}
      <ERPChildDialogForm
        open={!!reissueTarget}
        onOpenChange={(open) => {
          if (!open) setReissueTarget(null);
        }}
        title="Reissue Document"
        subtitle="A new superseding copy is issued; the current copy is marked superseded."
        icon={<RotateCcw className="h-5 w-5" />}
        mode="edit"
        size="sm"
        isSubmitting={actionPending}
        onSubmit={handleReissueSubmit}
        submitLabel="Reissue Document"
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 text-sm text-muted-foreground">
            You are reissuing{" "}
            <span className="font-medium text-foreground">
              {reissueTarget?.file_name.replace(/\.pdf$/i, "").replace(/_/g, " ")}
            </span>{" "}
            with current data and templates.
          </div>
          <div className="col-span-12">
            <label className="text-sm font-medium">
              Reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Why is a superseding copy required? (min 5 characters)"
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
      </ERPChildDialogForm>

      {/* ── Remove failed artifact dialog (system admin only) ───────────── */}
      {/* NOTE: This dialog only appears for failed/cancelled generation artifacts.
               Issued official documents cannot be deleted — use Revoke instead. */}
      <ERPChildDialogForm
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Remove Failed Generation Artifact"
        subtitle="This cleans up a failed or cancelled generation attempt. Issued documents cannot be removed this way."
        icon={<Trash2 className="h-5 w-5" />}
        mode="edit"
        size="sm"
        isSubmitting={actionPending}
        onSubmit={handleDeleteSubmit}
        submitLabel="Remove Artifact"
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            Removing failed generation record:{" "}
            <span className="font-semibold">
              {deleteTarget?.file_name.replace(/\.pdf$/i, "").replace(/_/g, " ")}
            </span>
            <span className="block text-[11px] mt-0.5 opacity-80">
              Status: {deleteTarget?.status} — no official issuance record exists for this entry.
            </span>
          </div>
          <div className="col-span-12 text-xs text-muted-foreground">
            This removes the failed generation record and any orphan storage file. Issued, revoked, and superseded documents are permanent compliance records and cannot be removed here — use Revoke for those.
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}