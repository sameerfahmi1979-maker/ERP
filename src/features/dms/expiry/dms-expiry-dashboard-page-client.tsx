"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, Zap, GitMerge, Send } from "lucide-react";
import { DmsExpirySummaryCards } from "./dms-expiry-summary-cards";
import { DmsExpiringDocumentsTable } from "./dms-expiring-documents-table";
import { DmsStartRenewalDialog } from "@/features/dms/renewals/dms-start-renewal-dialog";
import { DmsRenewalRequestsTable } from "@/features/dms/renewals/dms-renewal-requests-table";
import { generateDmsExpiryRemindersBulk } from "@/server/actions/dms/expiry-reminders";
import { generateDmsExpiryNotifications } from "@/server/actions/dms/notifications";
import {
  bridgeDueDmsNotificationsToGlobal,
  processDmsExpiryEmailQueue,
} from "@/server/actions/dms/dms-email-bridge";
import { invalidateDmsExpiry, invalidateDmsNotifications, invalidateEmailQueue } from "@/lib/query/invalidation";
import type { DmsExpiringDocumentRow } from "@/server/actions/dms/expiry-reminders";

interface DmsExpiryDashboardPageClientProps {
  isAdmin: boolean;
  canBridge?: boolean;
}

export function DmsExpiryDashboardPageClient({ isAdmin, canBridge = false }: DmsExpiryDashboardPageClientProps) {
  const queryClient = useQueryClient();
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [notifyGenerating, setNotifyGenerating] = useState(false);
  const [bridging, setBridging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [startRenewalDoc, setStartRenewalDoc] = useState<DmsExpiringDocumentRow | null>(null);

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
          <h1 className="text-xl font-semibold">Expiry & Renewals</h1>
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

      {/* Tabs */}
      <Tabs defaultValue="expired">
        <TabsList>
          <TabsTrigger value="expired">Expired</TabsTrigger>
          <TabsTrigger value="expiring">Expiring Soon</TabsTrigger>
          <TabsTrigger value="missing">Missing Expiry</TabsTrigger>
          <TabsTrigger value="renewals">Renewal Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="expired" className="mt-4">
          <DmsExpiringDocumentsTable
            view="expired"
            onStartRenewal={(doc) => setStartRenewalDoc(doc)}
          />
        </TabsContent>

        <TabsContent value="expiring" className="mt-4">
          <DmsExpiringDocumentsTable
            view="expiring"
            onStartRenewal={(doc) => setStartRenewalDoc(doc)}
          />
        </TabsContent>

        <TabsContent value="missing" className="mt-4">
          <DmsExpiringDocumentsTable view="missing_expiry" />
        </TabsContent>

        <TabsContent value="renewals" className="mt-4">
          <DmsRenewalRequestsTable />
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
    </div>
  );
}
