"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  Plus,
  Search,
  ExternalLink,
  Archive,
  ArchiveX,
  Trash2,
  FileText,
  RefreshCw,
  Sparkles,
  Compass,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { DmsDocumentStatusBadge } from "./dms-document-status-badge";
import { DmsExpiryBadge } from "./dms-expiry-badge";
import { archiveDmsDocument, unarchiveDmsDocument, deleteDmsDocument } from "@/server/actions/dms/documents";
import type { DmsDocumentRow } from "@/server/actions/dms/documents";
import { DmsRiskBadge } from "./dms-risk-badge";
import { askDmsDocumentsQuestion } from "@/server/actions/dms/ai-search";
import { semanticSearchDmsDocuments } from "@/server/actions/dms/semantic-search";
import type { DmsAiSearchResult, DmsSearchIntent, DmsSemanticSearchResult } from "@/lib/dms/ai/types";
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { ConfiguredRow, EditColumns, EditFilters, useListColumns, type ListColumn } from "@/components/erp/table/list-controls";
import { useRealtimeSync } from "@/hooks/realtime/use-realtime-sync";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";

type DocColKey =
  | "docNo"
  | "title"
  | "type"
  | "status"
  | "expiry"
  | "tags";

const DEFAULT_DOC_COL_WIDTHS: Record<DocColKey, number> = {
  docNo: 110,
  title: 320,
  type: 150,
  status: 100,
  expiry: 130,
  tags: 100,
};

const DOC_COLUMNS: ListColumn[] = Object.entries(DEFAULT_DOC_COL_WIDTHS).map(([id,width])=>({id,width,label:({docNo:"Document number",title:"Title",type:"Type",status:"Status",expiry:"Expiry",tags:"Tags"} as Record<string,string>)[id],visible:true,required:id==="docNo" || id==="title"}));

type SearchMode = "auto" | "quick" | "safe" | "content" | "ai" | "semantic";

const DMS_STATUS_FILTER_VALUES = [
  "draft",
  "pending_review",
  "approved",
  "active",
  "expired",
  "archived",
  "rejected",
  "superseded",
];

function dmsStatusFilterLabel(s: string): string {
  return s === "superseded" ? "Renewed" : s.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

const DMS_CONFIDENTIALITY_FILTER_VALUES = ["internal", "company", "hr", "finance", "legal", "executive"];

const DMS_EXPIRY_FILTER_OPTIONS: ERPComboboxOption[] = [
  { value: "expired", label: "Expired" },
  { value: "expiring_30", label: "Expiring ≤ 30d" },
  { value: "valid", label: "Valid" },
  { value: "no_expiry", label: "No Expiry" },
];

interface DmsDocumentsTableProps {
  initialDocuments: DmsDocumentRow[];
  categories: { id: number; name_en: string }[];
  documentTypes: { id: number; name_en: string }[];
  /** Only system_admin users — hard delete is permanently irreversible */
  canHardDelete?: boolean;
}

export function DmsDocumentsTable({
  initialDocuments,
  categories,
  documentTypes,
  canHardDelete = false,
}: DmsDocumentsTableProps) {
  const router = useRouter();
  const { openTab } = useWorkspace();
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<DmsDocumentRow | null>(null);

  // ERP REALTIME.1B — live DMS document list sync.
  // When another user creates/updates/archives/deletes a document, router.refresh()
  // triggers a new server fetch so this list updates automatically.
  // Wrapped in startTransition to avoid marking the list as "pending" on every event.
  useRealtimeSync({
    table: "dms_documents",
    event: "*",
    debounceMs: 500,
    onEvent: () => {
      startTransition(() => {
        router.refresh();
      });
    },
  });

  const [search, setSearch] = usePersistentUiState("dms-documents:search", "");
  const [filterType, setFilterType] = usePersistentUiState<number | null>("dms-documents:type", null);
  const [filterCategory, setFilterCategory] = usePersistentUiState<number | null>("dms-documents:category", null);
  const [filterStatus, setFilterStatus] = usePersistentUiState<string | null>("dms-documents:status", null);
  const [filterConfidentiality, setFilterConfidentiality] = usePersistentUiState<string | null>("dms-documents:confidentiality", null);
  const [filterExpiry, setFilterExpiry] = usePersistentUiState<string | null>("dms-documents:expiry", null);

  // AI Search state
  const [searchMode, setSearchMode] = useState<SearchMode>("auto");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<DmsAiSearchResult[] | null>(null);
  const [aiIntent, setAiIntent] = useState<DmsSearchIntent | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showIntent, setShowIntent] = useState(false);

  // Semantic Search state (DMS 12.5)
  const [semanticQuery, setSemanticQuery] = useState("");
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticResults, setSemanticResults] = useState<DmsSemanticSearchResult[] | null>(null);
  const [semanticError, setSemanticError] = useState<string | null>(null);

  async function handleSemanticSearch() {
    if (!semanticQuery.trim()) return;
    setSemanticLoading(true);
    setSemanticResults(null);
    setSemanticError(null);
    try {
      const result = await semanticSearchDmsDocuments(semanticQuery.trim());
      if (result.success && result.data) {
        setSemanticResults(result.data);
      } else {
        setSemanticError(result.error ?? "Semantic search failed.");
      }
    } catch {
      setSemanticError("Semantic search failed. Please try again.");
    } finally {
      setSemanticLoading(false);
    }
  }

  async function handleAiSearch() {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    setAiResults(null);
    setAiError(null);
    setAiIntent(null);
    setShowIntent(false);
    try {
      const result = await askDmsDocumentsQuestion(aiQuestion.trim());
      if (result.success && result.data) {
        setAiResults(result.data.results);
        setAiIntent(result.data.intent);
      } else {
        setAiError(result.error ?? "AI search failed.");
      }
    } catch {
      setAiError("AI search failed. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  const filtered = useMemo(() => initialDocuments.filter((doc) => {
    if (search) {
      const s = search.toLowerCase();
      const matches =
        doc.document_no.toLowerCase().includes(s) ||
        doc.title.toLowerCase().includes(s) ||
        (doc.description ?? "").toLowerCase().includes(s) ||
        (doc.legacy_document_code ?? "").toLowerCase().includes(s);
      if (!matches) return false;
    }
    if (filterType != null && doc.document_type_id !== filterType) return false;
    if (filterCategory != null && doc.category_id !== filterCategory) return false;
    if (filterStatus != null && doc.status !== filterStatus) return false;
    if (filterConfidentiality != null && doc.confidentiality_level !== filterConfidentiality) return false;

    if (filterExpiry != null) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (filterExpiry === "expired") {
        if (!doc.expiry_date || new Date(doc.expiry_date) >= today) return false;
      } else if (filterExpiry === "expiring_30") {
        if (!doc.expiry_date) return false;
        const d = new Date(doc.expiry_date);
        const days = Math.ceil((d.getTime() - today.getTime()) / 86400000);
        if (days < 0 || days > 30) return false;
      } else if (filterExpiry === "valid") {
        if (!doc.expiry_date || new Date(doc.expiry_date) < today) return false;
      } else if (filterExpiry === "no_expiry") {
        if (doc.expiry_date) return false;
      }
    }

    return true;
  }), [initialDocuments, search, filterType, filterCategory, filterStatus, filterConfidentiality, filterExpiry]);

  const table = useSortPaginate(filtered, {
    memoryKey: "dms-documents:table",
    defaultSortKey: "created_at",
    defaultSortDir: "desc",
    defaultPageSize: 25,
    comparators: {
      document_type: (a, b) => (a.document_type?.name_en ?? "").localeCompare(b.document_type?.name_en ?? ""),
      tags: (a, b) => (a.tags?.length ?? 0) - (b.tags?.length ?? 0),
    },
  });

  const columnState = useListColumns("dms-documents", DOC_COLUMNS);
  const colWidths = Object.fromEntries(columnState.columns.map(column=>[column.id,column.width])) as Record<DocColKey,number>;

  function openDocument(id: number, mode: "edit" | "view" = "edit") {
    const route = `/dms/documents/record/${id}?mode=${mode}`;
    openTab({ route, title: `Document #${id}` });
  }

  function openNewDocument() {
    openTab({ route: "/dms/documents/record/new", title: "New Document" });
  }

  function handleArchive(doc: DmsDocumentRow) {
    startTransition(async () => {
      const result = doc.is_archived
        ? await unarchiveDmsDocument(doc.id)
        : await archiveDmsDocument(doc.id);
      if (result.success) {
        toast.success(doc.is_archived ? "Document unarchived" : "Document archived");
        router.refresh();
      } else {
        toast.error(result.error ?? "Action failed");
      }
    });
  }

  function handleDelete(doc: DmsDocumentRow) {
    setDeleteTarget(doc);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const doc = deleteTarget;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await deleteDmsDocument(doc.id);
      if (result.success) {
        toast.success(`Document "${doc.document_no}" permanently deleted`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Delete failed");
      }
    });
  }

  // ── Filter combobox options ──────────────────────────────────────────────
  const typeOptions: ERPComboboxOption[] = useMemo(
    () => documentTypes.map((t) => ({ value: t.id, label: t.name_en })),
    [documentTypes]
  );
  const categoryOptions: ERPComboboxOption[] = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name_en })),
    [categories]
  );
  const statusOptions: ERPComboboxOption[] = useMemo(
    () => DMS_STATUS_FILTER_VALUES.map((s) => ({ value: s, label: dmsStatusFilterLabel(s) })),
    []
  );
  const confidentialityOptions: ERPComboboxOption[] = useMemo(
    () => DMS_CONFIDENTIALITY_FILTER_VALUES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
    []
  );

  return (
    <div className="space-y-4">
      {/* Row 1: Search */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search mode selector */}
        <Select value={searchMode} onValueChange={(v) => {
          setSearchMode(v as SearchMode);
          setAiResults(null);
          setAiError(null);
          setSemanticResults(null);
          setSemanticError(null);
        }}>
          <SelectTrigger aria-label="Document search mode" className="h-8 w-[160px] text-xs gap-1 shrink-0">
            {searchMode === "ai" && <Sparkles className="h-3 w-3 text-purple-500" />}
            {searchMode === "semantic" && <Compass className="h-3 w-3 text-sky-500" />}
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="quick">Quick</SelectItem>
            <SelectItem value="safe">Safe Search</SelectItem>
            <SelectItem value="content">Content Search</SelectItem>
            <SelectItem value="ai">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-purple-500" />
                AI Search
              </span>
            </SelectItem>
            <SelectItem value="semantic">
              <span className="flex items-center gap-1.5">
                <Compass className="h-3 w-3 text-sky-500" />
                Semantic Search
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {searchMode === "semantic" ? (
          <div className="flex flex-1 gap-2 min-w-[300px]">
            <Input
              placeholder="Describe what you're looking for, e.g. 'documents similar to a trade licence'"
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !semanticLoading && handleSemanticSearch()}
              className="h-8 text-sm flex-1"
            />
            <Button
              size="sm"
              onClick={handleSemanticSearch}
              disabled={semanticLoading || !semanticQuery.trim()}
              className="gap-1.5 shrink-0"
            >
              {semanticLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Compass className="h-3.5 w-3.5" />
              )}
              Search
            </Button>
          </div>
        ) : searchMode === "ai" ? (
          <div className="flex flex-1 gap-2 min-w-[300px]">
            <Input
              placeholder="Ask a question, e.g. 'expired passports' or 'people who passed offshore medical'"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !aiLoading && handleAiSearch()}
              className="h-8 text-sm flex-1"
            />
            <Button
              size="sm"
              onClick={handleAiSearch}
              disabled={aiLoading || !aiQuestion.trim()}
              className="gap-1.5 shrink-0"
            >
              {aiLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Search
            </Button>
          </div>
        ) : (
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by number, title, description..."
              aria-label="Search documents"
              value={search}
              onChange={(e) => { setSearch(e.target.value); table.setPage(1); }}
              className="pl-8 h-8 text-sm"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" aria-label="Refresh documents" onClick={() => router.refresh()} disabled={isPending}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={openNewDocument} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Document
          </Button>
        </div>
      </div>

      {searchMode !== "ai" && searchMode !== "semantic" && <div className="flex flex-wrap gap-2 items-center">
        <EditColumns columns={columnState.columns} defaults={DOC_COLUMNS} onApply={columnState.setColumns} />
        <EditFilters scopeLabel="Filters apply to the permitted documents loaded into this list, not AI or semantic search results."
          definitions={[
            {id:"type",label:"Type",type:"select",options:typeOptions.map(o=>({value:String(o.value),label:o.label}))},
            {id:"category",label:"Category",type:"select",options:categoryOptions.map(o=>({value:String(o.value),label:o.label}))},
            {id:"status",label:"Status",type:"select",options:statusOptions.map(o=>({value:String(o.value),label:o.label}))},
            {id:"confidentiality",label:"Confidentiality",type:"select",options:confidentialityOptions.map(o=>({value:String(o.value),label:o.label}))},
            {id:"expiry",label:"Expiry",type:"select",options:DMS_EXPIRY_FILTER_OPTIONS.map(o=>({value:String(o.value),label:o.label}))}
          ]}
          values={{type:filterType == null ? "" : String(filterType),category:filterCategory == null ? "" : String(filterCategory),status:filterStatus ?? "",confidentiality:filterConfidentiality ?? "",expiry:filterExpiry ?? ""}}
          onApply={values=>{setFilterType(values.type ? Number(values.type):null);setFilterCategory(values.category ? Number(values.category):null);setFilterStatus(values.status || null);setFilterConfidentiality(values.confidentiality || null);setFilterExpiry(values.expiry || null);table.setPage(1);}} />
      </div>}

      {/* Search mode helper text */}
      {searchMode !== "auto" && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-0.5">
          {searchMode === "quick" && (
            <>
              <Search className="h-3 w-3 shrink-0" />
              <span>
                <strong>Quick:</strong> Searches document number and title for fast matches.
              </span>
            </>
          )}
          {searchMode === "safe" && (
            <>
              <Search className="h-3 w-3 shrink-0" />
              <span>
                <strong>Safe Search:</strong> Searches title, description, and AI summary using full-text search.
              </span>
            </>
          )}
          {searchMode === "content" && (
            <>
              <Search className="h-3 w-3 shrink-0" />
              <span>
                <strong>Content Search:</strong> Searches extracted document text (OCR / uploaded content).
                Results are only shown for documents with extracted text.
              </span>
            </>
          )}
          {searchMode === "ai" && (
            <>
              <Sparkles className="h-3 w-3 shrink-0 text-purple-500" />
              <span>
                <strong>AI Search:</strong> Understands a natural-language question and returns matched documents
                with a reason. No hallucinations — results come from the database.
              </span>
            </>
          )}
          {searchMode === "semantic" && (
            <>
              <Compass className="h-3 w-3 shrink-0 text-sky-500" />
              <span>
                <strong>Semantic Search:</strong> Finds documents by meaning, not keywords, using AI summary
                embeddings. Results are ranked by similarity — the original documents remain the source of truth.
              </span>
            </>
          )}
        </div>
      )}

      {/* AI Search Results Panel */}
      {searchMode === "ai" && (
        <div className="space-y-3">
          {aiError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {aiError}
            </div>
          )}

          {aiLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
              Extracting intent and searching…
            </div>
          )}

          {aiIntent && !aiLoading && (
            <div className="rounded-md border border-purple-200/50 bg-purple-50/30 dark:bg-purple-950/10 px-4 py-2">
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-400 font-medium w-full"
                onClick={() => setShowIntent((v) => !v)}
              >
                <Sparkles className="h-3 w-3" />
                Intent extracted
                {showIntent ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
              </button>
              {showIntent && (
                <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                  {aiIntent.keywords?.length > 0 && (
                    <div><span className="font-medium">Keywords:</span> {aiIntent.keywords.join(", ")}</div>
                  )}
                  {aiIntent.document_type_hint && (
                    <div><span className="font-medium">Type:</span> {aiIntent.document_type_hint}</div>
                  )}
                  {aiIntent.expiry_state && (
                    <div><span className="font-medium">Expiry:</span> {aiIntent.expiry_state.replace("_", " ")}</div>
                  )}
                  {aiIntent.risk_hint && (
                    <div><span className="font-medium">Risk:</span> {aiIntent.risk_hint}</div>
                  )}
                  {aiIntent.outcome_hint && (
                    <div><span className="font-medium">Outcome:</span> {aiIntent.outcome_hint}</div>
                  )}
                  {aiIntent.party_name_hint && (
                    <div><span className="font-medium">Party:</span> {aiIntent.party_name_hint}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {aiResults !== null && !aiLoading && (
            <>
              {aiResults.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-20 text-purple-400" />
                  No documents found matching your question.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Found {aiResults.length} document{aiResults.length !== 1 ? "s" : ""}
                  </p>
                  {aiResults.map((r) => (
                    <div
                      key={r.documentId}
                      className="rounded-md border border-border bg-card hover:bg-muted/20 transition-colors p-3 cursor-pointer"
                      onClick={() => openDocument(r.documentId)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-primary font-medium">{r.documentNo}</span>
                            <span className="font-medium text-sm truncate">{r.title}</span>
                            {r.riskLevel && r.riskLevel !== "none" && (
                              <DmsRiskBadge level={r.riskLevel} />
                            )}
                          </div>
                          {r.aiSummarySnippet && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic line-clamp-2">
                              {r.aiSummarySnippet}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span className="text-purple-600 dark:text-purple-400 font-medium">
                              {r.matchReason}
                            </span>
                            {r.completenessScore !== null && (
                              <span>Completeness: {r.completenessScore}%</span>
                            )}
                            {r.expiryDate && (
                              <span>Expiry: {format(parseISO(r.expiryDate), "dd MMM yyyy")}</span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11 sm:h-8 sm:w-8 shrink-0"
                          onClick={(e) => { e.stopPropagation(); openDocument(r.documentId); }}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {aiResults === null && !aiLoading && !aiError && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-20 text-purple-400" />
              Type a question above and press Search or Enter.
            </div>
          )}
        </div>
      )}

      {/* Semantic Search Results Panel (DMS 12.5) */}
      {searchMode === "semantic" && (
        <div className="space-y-3">
          {semanticError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {semanticError}
            </div>
          )}

          {semanticLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
              Embedding your query and searching by meaning…
            </div>
          )}

          {semanticResults !== null && !semanticLoading && (
            <>
              {semanticResults.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Compass className="h-8 w-8 mx-auto mb-2 opacity-20 text-sky-400" />
                  No semantically similar documents found. Documents need a generated embedding to appear here.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Found {semanticResults.length} similar document{semanticResults.length !== 1 ? "s" : ""}
                  </p>
                  {semanticResults.map((r) => (
                    <div
                      key={r.documentId}
                      className="rounded-md border border-border bg-card hover:bg-muted/20 transition-colors p-3 cursor-pointer"
                      onClick={() => openDocument(r.documentId)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-primary font-medium">{r.documentNo}</span>
                            <span className="font-medium text-sm truncate">{r.title}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-sky-400 text-sky-600">
                              {Math.round(r.similarity * 100)}% match
                            </Badge>
                            {r.riskLevel && r.riskLevel !== "none" && (
                              <DmsRiskBadge level={r.riskLevel} />
                            )}
                          </div>
                          {r.aiSummarySnippet && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic line-clamp-2">
                              {r.aiSummarySnippet}
                            </p>
                          )}
                          {r.chunkSnippet && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {r.chunkSnippet}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span className="text-sky-600 dark:text-sky-400 font-medium">{r.matchReason}</span>
                            {r.searchMode === "chunk" && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-400 text-purple-600">
                                Chunk match
                              </Badge>
                            )}
                            {r.completenessScore !== null && (
                              <span>Completeness: {r.completenessScore}%</span>
                            )}
                            {r.expiryDate && (
                              <span>Expiry: {format(parseISO(r.expiryDate), "dd MMM yyyy")}</span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11 sm:h-8 sm:w-8 shrink-0"
                          onClick={(e) => { e.stopPropagation(); openDocument(r.documentId); }}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {semanticResults === null && !semanticLoading && !semanticError && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Compass className="h-8 w-8 mx-auto mb-2 opacity-20 text-sky-400" />
              Describe what you&apos;re looking for above and press Search or Enter.
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {searchMode !== "ai" && searchMode !== "semantic" && (
      <div role="region" aria-label="Scrollable documents" tabIndex={0} className="rounded-md border border-border overflow-x-auto">
        <table aria-label="Documents" className="w-full text-sm table-fixed" style={{minWidth:columnState.visible.reduce((sum,col)=>sum+col.width,104)}}>
          <thead>
            <ConfiguredRow columns={columnState.columns} className="border-b border-border bg-muted/30">
              <SortColHeader data-column="docNo" field="document_no" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2 text-muted-foreground font-medium" width={colWidths.docNo}>Doc No</SortColHeader>
              <SortColHeader data-column="title" field="title" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2 text-muted-foreground font-medium" width={colWidths.title}>Title</SortColHeader>
              <SortColHeader data-column="type" field="document_type" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2 text-muted-foreground font-medium" width={colWidths.type}>Type</SortColHeader>
              <SortColHeader data-column="status" field="status" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2 text-muted-foreground font-medium" width={colWidths.status}>Status</SortColHeader>
              <SortColHeader data-column="expiry" field="expiry_date" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2 text-muted-foreground font-medium" width={colWidths.expiry}>Expiry</SortColHeader>
              <SortColHeader data-column="tags" field="tags" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} className="px-3 py-2 text-muted-foreground font-medium" width={colWidths.tags}>Tags</SortColHeader>
              <th className="px-3 py-2" style={{ width: 104 }} />
            </ConfiguredRow>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr>
                <td colSpan={columnState.visible.length + 1} className="text-center py-10 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No documents found</p>
                    <Button size="sm" variant="outline" onClick={openNewDocument} className="mt-1 gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Create first document
                    </Button>
                  </div>
                </td>
              </tr>
            ) : (
              table.rows.map((doc) => (
                <ConfiguredRow columns={columnState.columns} key={doc.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td data-column="docNo" className="px-3 py-2 font-mono font-medium text-primary overflow-hidden">
                    <button
                      type="button"
                      onClick={() => openDocument(doc.id)}
                      className="hover:underline truncate block max-w-full"
                    >
                      {doc.document_no}
                    </button>
                  </td>
                  <td data-column="title" className="px-3 py-2 overflow-hidden">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate min-w-0 flex-1 font-medium">{doc.title}</span>
                      {doc.is_archived && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground shrink-0">
                          Archived
                        </Badge>
                      )}
                      {doc.ai_risk_level && doc.ai_risk_level !== "none" && (
                        <DmsRiskBadge level={doc.ai_risk_level} />
                      )}
                    </div>
                    {/* AI summary secondary line (redacted for confidential if server already replaced it) */}
                    {doc.ai_summary && doc.ai_summary_status === "complete" && (
                      <p className="text-muted-foreground truncate mt-0.5 italic">
                        {doc.ai_summary}
                      </p>
                    )}
                    {!doc.ai_summary && doc.description && (
                      <p className="text-muted-foreground truncate mt-0.5">{doc.description}</p>
                    )}
                  </td>
                  <td data-column="type" className="px-3 py-2 text-muted-foreground truncate">
                    {doc.document_type?.name_en ?? "—"}
                  </td>
                  <td data-column="status" className="px-3 py-2">
                    <DmsDocumentStatusBadge status={doc.status} />
                  </td>
                  <td data-column="expiry" className="px-3 py-2">
                    {doc.expiry_date ? (
                      <div className="space-y-0.5">
                        <DmsExpiryBadge expiryDate={doc.expiry_date} />
                        <div className="text-[10px] text-muted-foreground">
                          {format(parseISO(doc.expiry_date), "dd MMM yyyy")}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td data-column="tags" className="px-3 py-2">
                    {doc.tags && doc.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-0.5">
                        {doc.tags.slice(0, 2).map((t) => (
                          <Badge
                            key={t.tag_id}
                            variant="outline"
                            className="text-[9px] px-1 py-0"
                            style={t.tag?.color_hex ? { borderColor: t.tag.color_hex, color: t.tag.color_hex } : undefined}
                          >
                            {t.tag?.tag_name ?? t.tag_id}
                          </Badge>
                        ))}
                        {doc.tags.length > 2 && (
                          <span className="text-[9px] text-muted-foreground">+{doc.tags.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <Button aria-label="Open"
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11 sm:h-8 sm:w-8"
                        onClick={() => openDocument(doc.id, "edit")}
                        title="Open"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button aria-label={doc.is_archived ? "Unarchive" : "Archive"}
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11 sm:h-8 sm:w-8"
                        onClick={() => handleArchive(doc)}
                        disabled={isPending}
                        title={doc.is_archived ? "Unarchive" : "Archive"}
                      >
                        {doc.is_archived ? (
                          <ArchiveX className="h-3 w-3" />
                        ) : (
                          <Archive className="h-3 w-3" />
                        )}
                      </Button>
                      {canHardDelete && (
                        <Button aria-label="Permanently Delete (system admin only)"
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(doc)}
                          disabled={isPending}
                          title="Permanently Delete (system admin only)"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}                    </div>
                  </td>
                </ConfiguredRow>
              ))
            )}
          </tbody>
        </table>
        <TablePagination
          page={table.page}
          totalPages={table.totalPages}
          onPage={table.setPage}
          pageSize={table.pageSize}
          onPageSize={table.setPageSize}
          total={table.total}
        />
      </div>
      )}

      {searchMode !== "ai" && searchMode !== "semantic" && (
        <div className="text-xs text-muted-foreground">
          Showing {table.total} of {initialDocuments.length} document{initialDocuments.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* ── Hard Delete Confirmation Dialog ─────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently Delete Document?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  You are about to permanently delete{" "}
                  <span className="font-semibold text-foreground">{deleteTarget?.document_no}</span>
                  {deleteTarget?.title ? ` — ${deleteTarget.title}` : ""}.
                </p>
                <p className="font-medium text-destructive">
                  This action is irreversible. The document and all associated data
                  (files, versions, metadata, review queue items, upload sessions) will be
                  permanently removed from the system.
                </p>
                <p className="text-xs text-muted-foreground">
                  Only system administrators may perform this action.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Permanently Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
