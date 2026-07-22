"use client";

import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, Zap, GitMerge, Send, Mail, Download } from "lucide-react";
import { DmsExpirySummaryCards } from "./dms-expiry-summary-cards";
import { DmsExpiringDocumentsTable } from "./dms-expiring-documents-table";
import { DmsExpiryFilterBar, type ExpiryAdvancedFilter } from "./dms-expiry-filter-bar";
import { DmsExpiryEmailDialog } from "./dms-expiry-email-dialog";
import { DmsStartRenewalDialog } from "@/features/dms/renewals/dms-start-renewal-dialog";
import { DmsRenewalRequestsTable } from "@/features/dms/renewals/dms-renewal-requests-table";
import { generateDmsExpiryRemindersBulk } from "@/server/actions/dms/expiry-reminders";
import { generateDmsExpiryNotifications } from "@/server/actions/dms/notifications";
import {
  bridgeDueDmsNotificationsToGlobal,
  processDmsExpiryEmailQueue,
} from "@/server/actions/dms/dms-email-bridge";
import { invalidateDmsExpiry, invalidateDmsNotifications, invalidateEmailQueue } from "@/lib/query/invalidation";
import { ERPExportMenu } from "@/components/erp/export/erp-export-menu";
import { format } from "date-fns";
import type { DmsExpiringDocumentRow } from "@/server/actions/dms/expiry-reminders";
import type { ERPExportColumn } from "@/lib/export";

interface DmsExpiryDashboardPageClientProps {
  isAdmin: boolean;
  canBridge?: boolean;
}

const EXPIRY_EXPORT_COLUMNS: ERPExportColumn<DmsExpiringDocumentRow>[] = [
  { key: "document_no", header: "Doc No", width: 14 },
  { key: "title", header: "Title", width: 30 },
  { key: "document_type", header: "Type", width: 20 },
  { key: "category", header: "Category", width: 18 },
  { key: "expiry_date", header: "Expiry Date", width: 14 },
  { key: "days_remaining", header: "Days Remaining", width: 14 },
  { key: "status", header: "Status", width: 12 },
];

const TAB_TITLES: Record<string, string> = {
  expired: "Expired Documents",
  expiring: "Expiring Soon",
  missing: "Missing Expiry",
  renewals: "Renewal Requests",
  ignored: "Ignored Documents",
};

export function DmsExpiryDashboardPageClient({ isAdmin, canBridge = false }: DmsExpiryDashboardPageClientProps) {
  const queryClient = useQueryClient();
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [notifyGenerating, setNotifyGenerating] = useState(false);
  const [bridging, setBridging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [startRenewalDoc, setStartRenewalDoc] = useState<DmsExpiringDocumentRow | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState("expired");

  // Advanced filter (shared across tabs)
  const [advancedFilter, setAdvancedFilter] = useState<ExpiryAdvancedFilter>({});
  // Debounce filter changes
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleFilterChange = useCallback((f: ExpiryAdvancedFilter) => {
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => setAdvancedFilter(f), 300);
  }, []);

  // Current tab's rows (for export and email)
  const [currentRows, setCurrentRows] = useState<DmsExpiringDocumentRow[]>([]);
  const handleRowsLoaded = useCallback((rows: DmsExpiringDocumentRow[]) => {
    setCurrentRows(rows);
  }, []);

  // Email dialog
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const exportTitle = `${TAB_TITLES[activeTab] ?? "Documents"} — ${format(new Date(), "dd MMM yyyy")}`;
  const exportFilename = `${(TAB_TITLES[activeTab] ?? "documents").toLowerCase().replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}`;

  const handleBulkGenerate = async () => {
    setBulkGenerating(true);
    try {
      const result = await generateDmsExpiryRemindersBulk({ limit: 100 });
      if (result.success) {
        toast.success(`Reminder schedules generated for ${result.data?.processed} documents`);
        invalidateDmsExpiry(queryClient);
      } else {
        toast.error(result.error ?? "Failed");
      }
    } finally {
      setBulkGenerating(false);
    }
  };

  const handleGenerateNotifications = async () => {
    setNotifyGenerating(true);
    try {
      const result = await generateDmsExpiryNotifications({ limit: 100 });
      if (result.success) {
        toast.success(`${result.data?.created} notifications created`);
        invalidateDmsNotifications(queryClient);
      } else {
        toast.error(result.error ?? "Failed");
      }
    } finally {
      setNotifyGenerating(false);
    }
  };

  const handleBridgeNotifications = async () => {
    setBridging(true);
    try {
      const result = await bridgeDueDmsNotificationsToGlobal({ limit: 50 });
      if (result.success && result.data) {
        toast.success(`Bridged: ${result.data.bridged} new, ${result.data.alreadyDone} already done, ${result.data.failed} failed`);
        invalidateDmsNotifications(queryClient);
        invalidateEmailQueue(queryClient);
      } else {
        toast.error(result.error ?? "Bridge failed");
      }
    } finally {
      setBridging(false);
    }
  };

  const handleProcessEmailQueue = async () => {
    setProcessing(true);
    try {
      const result = await processDmsExpiryEmailQueue({ limit: 20 });
      if (result.success && result.data) {
        toast.success(`Queue processed: ${result.data.sent} sent, ${result.data.failed} failed`);
        invalidateEmailQueue(queryClient);
        invalidateDmsNotifications(queryClient);
      } else {
        toast.error(result.error ?? "Processing failed");
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Expiry &amp; Renewals</h1>
          <p className="text-sm text-muted-foreground">
            Monitor document expiry, manage reminder schedules, and track renewals.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={bulkGenerating}
              onClick={handleBulkGenerate}
            >
              <RefreshCw className={`h-4 w-4 ${bulkGenerating ? "animate-spin" : ""}`} />
              Bulk Generate Reminders
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={notifyGenerating}
              onClick={handleGenerateNotifications}
            >
              <Zap className={`h-4 w-4 ${notifyGenerating ? "animate-spin" : ""}`} />
              Generate Notifications
            </Button>
            {canBridge && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={bridging}
                  onClick={handleBridgeNotifications}
                >
                  <GitMerge className={`h-4 w-4 ${bridging ? "animate-spin" : ""}`} />
                  Bridge Notifications
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={processing}
                  onClick={handleProcessEmailQueue}
                >
                  <Send className={`h-4 w-4 ${processing ? "animate-spin" : ""}`} />
                  Send Emails
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <DmsExpirySummaryCards />

      {/* Filter Bar */}
      <DmsExpiryFilterBar onChange={handleFilterChange} />

      {/* Tabs */}
      <Tabs
        defaultValue="expired"
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v);
          setCurrentRows([]); // reset while new tab loads
        }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="expired">Expired</TabsTrigger>
            <TabsTrigger value="expiring">Expiring Soon</TabsTrigger>
            <TabsTrigger value="missing">Missing Expiry</TabsTrigger>
            <TabsTrigger value="renewals">Renewal Requests</TabsTrigger>
            <TabsTrigger value="ignored">Ignored</TabsTrigger>
          </TabsList>

          {/* Export + Email toolbar — hidden for Renewals tab */}
          {activeTab !== "renewals" && (
            <div className="flex items-center gap-2">
              <ERPExportMenu
                title={exportTitle}
                filename={exportFilename}
                data={currentRows}
                columns={EXPIRY_EXPORT_COLUMNS}
                moduleCode="DMS"
                exportMode="filtered"
                orientation="landscape"
                size="sm"
                variant="outline"
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={currentRows.length === 0}
                onClick={() => setEmailDialogOpen(true)}
              >
                <Mail className="h-4 w-4" />
                Send by Email
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="expired" className="mt-4">
          <DmsExpiringDocumentsTable
            view="expired"
            advancedFilter={advancedFilter}
            onRowsLoaded={handleRowsLoaded}
            onStartRenewal={(doc) => setStartRenewalDoc(doc)}
          />
        </TabsContent>

        <TabsContent value="expiring" className="mt-4">
          <DmsExpiringDocumentsTable
            view="expiring"
            advancedFilter={advancedFilter}
            onRowsLoaded={handleRowsLoaded}
            onStartRenewal={(doc) => setStartRenewalDoc(doc)}
          />
        </TabsContent>

        <TabsContent value="missing" className="mt-4">
          <DmsExpiringDocumentsTable
            view="missing_expiry"
            advancedFilter={advancedFilter}
            onRowsLoaded={handleRowsLoaded}
          />
        </TabsContent>

        <TabsContent value="renewals" className="mt-4">
          <DmsRenewalRequestsTable />
        </TabsContent>

        <TabsContent value="ignored" className="mt-4">
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            Documents listed here have been manually excluded from expiry dashboards.
            Click <strong>Restore</strong> on any row to resume normal tracking.
          </div>
          <DmsExpiringDocumentsTable
            view="ignored"
            advancedFilter={advancedFilter}
            onRowsLoaded={handleRowsLoaded}
          />
        </TabsContent>
      </Tabs>

      {startRenewalDoc && (
        <DmsStartRenewalDialog
          open
          onOpenChange={(v) => { if (!v) setStartRenewalDoc(null); }}
          documentId={startRenewalDoc.id}
          documentNo={startRenewalDoc.document_no}
          documentTitle={startRenewalDoc.title}
          onSuccess={() => setStartRenewalDoc(null)}
        />
      )}

      <DmsExpiryEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        docs={currentRows}
        tabTitle={TAB_TITLES[activeTab] ?? "Documents"}
      />
    </div>
  );
}
