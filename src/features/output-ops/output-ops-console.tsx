"use client";

/**
 * OUTPUT.6 (WP10) — Global Output Operations Console.
 *
 * Module-agnostic operator workspace over the issuance lifecycle:
 * metrics + renderer health, server-side filtered & paginated history,
 * per-issuance operational detail, and permissioned retry / cancel / revoke.
 *
 * Separation of duties: this console shows operational METADATA. Document
 * content (downloads) stays behind document-level permissions and is served
 * exclusively through `getIssuanceDownloadUrl`.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileWarning,
  HeartPulse,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import {
  listOpsIssuances,
  getOpsIssuanceDetail,
  retryOpsIssuance,
  cancelOpsIssuance,
  getOpsMetrics,
  type OpsIssuanceRow,
  type OpsIssuanceDetail,
  type OpsMetrics,
} from "@/server/actions/output/ops-console";
import { revokeIssuance } from "@/server/actions/output/issuance-history";

const LIFECYCLE_STATES = [
  "pending",
  "rendering",
  "uploaded",
  "issued",
  "failed_retryable",
  "failed_terminal",
  "cancelled",
  "reconciliation_required",
] as const;

const STATE_STYLES: Record<string, string> = {
  issued: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  rendering: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  uploaded: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  failed_retryable: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  failed_terminal: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  reconciliation_required: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

const CLASSES = ["A", "B", "C", "D", "E", "F", "G"] as const;
const PAGE_SIZE = 25;

function StateChip({ state, revoked, superseded }: { state: string | null; revoked?: boolean; superseded?: boolean }) {
  if (revoked) {
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px]">Revoked</Badge>;
  }
  if (superseded) {
    return <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 text-[10px]">Superseded</Badge>;
  }
  const s = state ?? "unknown";
  return <Badge className={`${STATE_STYLES[s] ?? "bg-slate-100 text-slate-600"} text-[10px]`}>{s.replace(/_/g, " ")}</Badge>;
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function OutputOpsConsole() {
  const [metrics, setMetrics] = useState<OpsMetrics | null>(null);
  const [rows, setRows] = useState<OpsIssuanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [canRetry, setCanRetry] = useState(false);
  const [canRevoke, setCanRevoke] = useState(false);
  const [isLoading, startLoading] = useTransition();

  // Filters
  const [page, setPage] = useState(0);
  const [stateFilter, setStateFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");

  // Detail + actions
  const [detail, setDetail] = useState<OpsIssuanceDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ kind: "retry" | "cancel" | "revoke"; row: OpsIssuanceRow } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionPending, setActionPending] = useState(false);

  const load = useCallback(() => {
    startLoading(async () => {
      const [m, l] = await Promise.all([
        getOpsMetrics(),
        listOpsIssuances({
          page,
          pageSize: PAGE_SIZE,
          lifecycleState: stateFilter || undefined,
          documentClass: classFilter || undefined,
          search: search || undefined,
        }),
      ]);
      if (m.success && m.data) setMetrics(m.data);
      else if (m.error) toast.error("Metrics failed", { description: m.error });
      if (l.success && l.data) {
        setRows(l.data.rows);
        setTotal(l.data.total);
        setCanRetry(l.data.canRetry);
        setCanRevoke(l.data.canRevoke);
      } else if (l.error) toast.error("History failed", { description: l.error });
    });
  }, [page, stateFilter, classFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (row: OpsIssuanceRow) => {
    setDetailOpen(true);
    setDetail(null);
    const res = await getOpsIssuanceDetail(row.id);
    if (res.success && res.data) setDetail(res.data);
    else {
      toast.error("Detail failed", { description: res.error });
      setDetailOpen(false);
    }
  };

  const runAction = async () => {
    if (!actionTarget) return;
    if (actionReason.trim().length < 5) {
      toast.error("A reason of at least 5 characters is required.");
      return;
    }
    setActionPending(true);
    try {
      let ok = false;
      if (actionTarget.kind === "retry") {
        const res = await retryOpsIssuance({ issuanceId: actionTarget.row.id, reason: actionReason });
        if (res.success && res.data) {
          ok = true;
          const o = res.data.outcome;
          if (o.success) toast.success("Retry issued", { description: `New issuance #${o.issuanceId} (${o.serialNo ?? "no serial"})` });
          else toast.warning("Retry ran but did not issue", { description: o.error });
        } else toast.error("Retry failed", { description: res.error });
      } else if (actionTarget.kind === "cancel") {
        const res = await cancelOpsIssuance({ issuanceId: actionTarget.row.id, reason: actionReason });
        ok = res.success;
        if (res.success) toast.success("Issuance cancelled");
        else toast.error("Cancel failed", { description: res.error });
      } else {
        const res = await revokeIssuance({ issuanceId: actionTarget.row.id, reason: actionReason });
        ok = res.success;
        if (res.success) toast.success("Document revoked");
        else toast.error("Revoke failed", { description: res.error });
      }
      if (ok) {
        setActionTarget(null);
        setActionReason("");
        load();
      }
    } finally {
      setActionPending(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const stateEntries = useMemo(
    () => Object.entries(metrics?.stateCounts ?? {}).sort((a, b) => b[1] - a[1]),
    [metrics]
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <ERPPageHeader
        title="Output Operations"
        description="Global issuance lifecycle, renderer health, and operational actions across all modules"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Report Center", href: "/admin/reports" },
          { label: "Output Operations" },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* ── Metrics ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><HeartPulse className="h-3.5 w-3.5" />Renderer</div>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
            {metrics == null ? "…" : metrics.rendererHealthy ? (
              <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Healthy</>
            ) : (
              <><ShieldAlert className="h-4 w-4 text-red-500" /> Unreachable</>
            )}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Activity className="h-3.5 w-3.5" />Issued 24h</div>
          <div className="mt-1 text-sm font-semibold">{metrics?.issuedLast24h ?? "…"}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><FileWarning className="h-3.5 w-3.5" />Failed 24h</div>
          <div className="mt-1 text-sm font-semibold">{metrics?.failedLast24h ?? "…"}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />Avg render 24h</div>
          <div className="mt-1 text-sm font-semibold">{metrics ? fmtMs(metrics.avgRenderMsLast24h) : "…"}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" />Stuck in-flight</div>
          <div className="mt-1 text-sm font-semibold">{metrics?.stuckInFlight.length ?? "…"}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Ban className="h-3.5 w-3.5" />Voided serials</div>
          <div className="mt-1 text-sm font-semibold">{metrics?.voidedSerials ?? "…"}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />Schedule runs</div>
          <div className="mt-1 text-sm font-semibold">
            {metrics == null ? "…" : (
              <span>
                {metrics.scheduleRuns.succeededLast24h} ok
                {metrics.scheduleRuns.retryable > 0 && <span className="ml-1.5 text-amber-600">{metrics.scheduleRuns.retryable} retrying</span>}
                {metrics.scheduleRuns.terminal > 0 && <span className="ml-1.5 text-red-600">{metrics.scheduleRuns.terminal} failed</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      {(metrics?.scheduleRuns.terminalRecent.length ?? 0) > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-xs">
          <span className="font-semibold text-red-700 dark:text-red-300">
            {metrics!.scheduleRuns.terminalRecent.length} schedule run(s) failed terminally:
          </span>{" "}
          {metrics!.scheduleRuns.terminalRecent
            .map((r) => `run #${r.id} (schedule ${r.schedule_id}): ${r.failure_reason ?? "no reason recorded"}`)
            .join(" · ")}
        </div>
      )}

      {stateEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stateEntries.map(([state, count]) => (
            <button
              key={state}
              type="button"
              onClick={() => { setPage(0); setStateFilter(state === stateFilter ? "" : state); }}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                stateFilter === state ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted/40"
              }`}
            >
              {state.replace(/_/g, " ")} <span className="font-mono">{count}</span>
            </button>
          ))}
        </div>
      )}

      {(metrics?.reconciliationRequired.length ?? 0) > 0 && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 p-3 text-xs">
          <span className="font-semibold text-orange-700 dark:text-orange-300">
            {metrics!.reconciliationRequired.length} issuance(s) require reconciliation:
          </span>{" "}
          {metrics!.reconciliationRequired.map((r) => `#${r.id} ${r.output_code ?? ""}`).join(", ")}
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-52">
          <Label className="text-[11px] text-muted-foreground">Lifecycle state</Label>
          <select
            className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs"
            value={stateFilter}
            onChange={(e) => { setPage(0); setStateFilter(e.target.value); }}
          >
            <option value="">All states</option>
            {LIFECYCLE_STATES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div className="w-36">
          <Label className="text-[11px] text-muted-foreground">Class</Label>
          <select
            className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs"
            value={classFilter}
            onChange={(e) => { setPage(0); setClassFilter(e.target.value); }}
          >
            <option value="">All classes</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>Class {c}</option>
            ))}
          </select>
        </div>
        <div className="relative flex-1 min-w-52 max-w-md">
          <Label className="text-[11px] text-muted-foreground">Search serial / file / output</Label>
          <Search className="absolute left-2.5 bottom-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="mt-1 h-8 pl-8 text-xs"
            placeholder="e.g. HR_NOC-C1-2026…"
            value={search}
            onChange={(e) => { setPage(0); setSearch(e.target.value); }}
          />
        </div>
        <div className="ml-auto text-xs text-muted-foreground pb-2">{total} issuance(s)</div>
      </div>

      {/* ── History table ───────────────────────────────────────────────── */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">ID</th>
              <th className="px-3 py-2 text-left font-medium">Output</th>
              <th className="px-3 py-2 text-left font-medium">Class</th>
              <th className="px-3 py-2 text-left font-medium">State</th>
              <th className="px-3 py-2 text-left font-medium">Serial</th>
              <th className="px-3 py-2 text-left font-medium">QR</th>
              <th className="px-3 py-2 text-left font-medium">Generated</th>
              <th className="px-3 py-2 text-left font-medium">Duration</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  {isLoading ? "Loading…" : "No issuances match the current filters."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => openDetail(r)}>
                <td className="px-3 py-2 font-mono">#{r.id}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.output_code ?? r.template_key}</div>
                  <div className="text-muted-foreground">{r.source_record_type} #{r.source_record_id} · Co {r.owner_company_id}</div>
                </td>
                <td className="px-3 py-2">{r.document_class ?? "—"}</td>
                <td className="px-3 py-2">
                  <StateChip state={r.lifecycle_state} revoked={!!r.revoked_at} superseded={r.superseded_by_id != null} />
                </td>
                <td className="px-3 py-2 font-mono text-[10px]">
                  {r.serial_no ?? "—"}
                  {r.serial_status === "voided" && <span className="ml-1 text-red-500">(voided)</span>}
                </td>
                <td className="px-3 py-2">
                  {r.qr_status ? (
                    <span className="inline-flex items-center gap-1"><QrCode className="h-3 w-3" />{r.qr_status}</span>
                  ) : "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.generated_at)}</td>
                <td className="px-3 py-2">{fmtMs(r.total_duration_ms)}</td>
                <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1 justify-end">
                    {canRetry && (r.lifecycle_state === "failed_retryable" || r.lifecycle_state === "reconciliation_required") && (
                      <Button
                        variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => { setActionReason(""); setActionTarget({ kind: "retry", row: r }); }}
                      >
                        <RotateCcw className="h-3 w-3" /> Retry
                      </Button>
                    )}
                    {canRetry && (r.lifecycle_state === "pending" || r.lifecycle_state === "failed_retryable" || r.lifecycle_state === "reconciliation_required") && (
                      <Button
                        variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => { setActionReason(""); setActionTarget({ kind: "cancel", row: r }); }}
                      >
                        <Ban className="h-3 w-3" /> Cancel
                      </Button>
                    )}
                    {canRevoke && r.lifecycle_state === "issued" && !r.revoked_at && (
                      <Button
                        variant="outline" size="sm"
                        className="h-6 px-2 text-[10px] gap-1 text-red-600 hover:text-red-700"
                        onClick={() => { setActionReason(""); setActionTarget({ kind: "revoke", row: r }); }}
                      >
                        <Ban className="h-3 w-3" /> Revoke
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Page {page + 1} of {pageCount}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-7 px-2" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Detail dialog ───────────────────────────────────────────────── */}
      <ERPChildDialogForm
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={detail ? `Issuance #${detail.id} — ${detail.output_code ?? detail.template_key}` : "Issuance detail"}
        subtitle="Operational metadata, lifecycle timings, QR links, and snapshots"
        icon={<Activity className="h-5 w-5" />}
        mode="view"
        size="lg"
        submitLabel="Close"
        onSubmit={() => setDetailOpen(false)}
      >
        {!detail ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-12 gap-4 text-xs">
            <div className="col-span-6 space-y-1.5">
              <h4 className="font-semibold text-sm">Lifecycle</h4>
              <div className="flex items-center gap-2">
                <StateChip state={detail.lifecycle_state} revoked={!!detail.revoked_at} superseded={detail.superseded_by_id != null} />
                {detail.failure_reason && <span className="text-red-600">{detail.failure_reason}</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                <span className="text-muted-foreground">Generated</span><span>{fmtDate(detail.generated_at)}</span>
                <span className="text-muted-foreground">Render started</span><span>{fmtDate(detail.rendering_started_at)}</span>
                <span className="text-muted-foreground">Uploaded</span><span>{fmtDate(detail.uploaded_at)}</span>
                <span className="text-muted-foreground">Issued</span><span>{fmtDate(detail.issued_at)}</span>
                <span className="text-muted-foreground">Queue → render</span><span>{fmtMs(detail.stage_durations_ms.queue)}</span>
                <span className="text-muted-foreground">Render</span><span>{fmtMs(detail.stage_durations_ms.render)}</span>
                <span className="text-muted-foreground">Finalize</span><span>{fmtMs(detail.stage_durations_ms.upload_finalize)}</span>
                <span className="text-muted-foreground">Total</span><span>{fmtMs(detail.stage_durations_ms.total)}</span>
              </div>
            </div>
            <div className="col-span-6 space-y-1.5">
              <h4 className="font-semibold text-sm">Identity & integrity</h4>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="text-muted-foreground">Serial</span>
                <span className="font-mono text-[10px]">{detail.serial_no ?? "—"} {detail.serial_status ? `(${detail.serial_status})` : ""}</span>
                <span className="text-muted-foreground">Serial void reason</span><span>{detail.serial_void_reason ?? "—"}</span>
                <span className="text-muted-foreground">Checksum</span>
                <span className="font-mono text-[10px] break-all">{detail.checksum?.slice(0, 24) ?? "—"}…</span>
                <span className="text-muted-foreground">Size / pages</span>
                <span>{detail.file_size_bytes ?? "—"} B / {detail.page_count ?? "—"}</span>
                <span className="text-muted-foreground">Renderer</span>
                <span>{detail.renderer ?? "—"} {detail.renderer_version ?? ""} {detail.chromium_version ? `(Chromium ${detail.chromium_version})` : ""}</span>
                <span className="text-muted-foreground">Template</span>
                <span>{detail.template_id ?? "—"} v{detail.template_version ?? "—"}</span>
                <span className="text-muted-foreground">Request key</span>
                <span className="font-mono text-[10px] break-all">{detail.request_key ?? "—"}</span>
                <span className="text-muted-foreground">Supersedes / by</span>
                <span>{detail.supersedes_issuance_id ?? "—"} / {detail.superseded_by_id ?? "—"}</span>
                <span className="text-muted-foreground">Revoked</span>
                <span>{detail.revoked_at ? `${fmtDate(detail.revoked_at)} — ${detail.revoke_reason ?? ""}` : "No"}</span>
              </div>
            </div>

            <div className="col-span-12">
              <h4 className="font-semibold text-sm mb-1.5">Public verification links</h4>
              {detail.qr_links.length === 0 ? (
                <p className="text-muted-foreground">No public links (policy: none, or QR not requested).</p>
              ) : (
                <div className="rounded border divide-y">
                  {detail.qr_links.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 px-3 py-1.5">
                      <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
                      <Badge variant="secondary" className="text-[10px]">{l.status}</Badge>
                      <span className="text-muted-foreground">issued {fmtDate(l.issued_at)}</span>
                      <span className="text-muted-foreground">expires {l.expires_at ? fmtDate(l.expires_at) : "never"}</span>
                      <span className="text-muted-foreground">views {l.view_count ?? 0}</span>
                      {l.cancel_reason && <span className="text-red-600">{l.cancel_reason}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="col-span-6">
              <h4 className="font-semibold text-sm mb-1.5">Policy snapshot</h4>
              <pre className="rounded border bg-muted/30 p-2 text-[10px] overflow-auto max-h-40">
                {JSON.stringify(detail.policy_snapshot_json, null, 2) ?? "—"}
              </pre>
            </div>
            <div className="col-span-6">
              <h4 className="font-semibold text-sm mb-1.5">Branding snapshot</h4>
              <pre className="rounded border bg-muted/30 p-2 text-[10px] overflow-auto max-h-40">
                {JSON.stringify(detail.branding_snapshot_json, null, 2) ?? "—"}
              </pre>
            </div>
            <div className="col-span-12">
              <h4 className="font-semibold text-sm mb-1.5">Data snapshot</h4>
              {detail.data_snapshot_hidden ? (
                <p className="text-muted-foreground">
                  Hidden — viewing rendered document data requires document-level report permissions.
                </p>
              ) : detail.data_snapshot_json == null ? (
                <p className="text-muted-foreground">No data snapshot captured (legacy issuance).</p>
              ) : (
                <pre className="rounded border bg-muted/30 p-2 text-[10px] overflow-auto max-h-40">
                  {JSON.stringify(detail.data_snapshot_json, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </ERPChildDialogForm>

      {/* ── Action dialog (retry / cancel / revoke) ─────────────────────── */}
      <ERPChildDialogForm
        open={actionTarget != null}
        onOpenChange={(open) => { if (!open) setActionTarget(null); }}
        title={
          actionTarget?.kind === "retry" ? "Retry Failed Issuance"
            : actionTarget?.kind === "cancel" ? "Cancel Issuance"
            : "Revoke Issued Document"
        }
        subtitle={
          actionTarget?.kind === "retry"
            ? "The failed attempt is closed out (serial voided, never recycled) and a fresh issuance is started."
            : actionTarget?.kind === "cancel"
            ? "The issuance is cancelled; a reserved serial is voided and never recycled."
            : "The document and its public verification link become permanently invalid."
        }
        icon={actionTarget?.kind === "retry" ? <RotateCcw className="h-5 w-5" /> : <Ban className="h-5 w-5" />}
        mode="edit"
        size="sm"
        isSubmitting={actionPending}
        submitLabel={
          actionTarget?.kind === "retry" ? "Retry Issuance"
            : actionTarget?.kind === "cancel" ? "Cancel Issuance"
            : "Revoke Document"
        }
        onSubmit={runAction}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label className="text-xs">Reason *</Label>
            <Textarea
              className="mt-1 text-sm"
              rows={3}
              placeholder="Why is this operational action required? (min 5 characters)"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
            />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
