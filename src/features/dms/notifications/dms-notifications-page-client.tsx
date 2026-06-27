"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Zap, GitMerge, Mail, Send } from "lucide-react";
import { useState } from "react";
import { DmsNotificationsTable } from "./dms-notifications-table";
import { generateDmsExpiryNotifications } from "@/server/actions/dms/notifications";
import {
  bridgeDueDmsNotificationsToGlobal,
  processDmsExpiryEmailQueue,
} from "@/server/actions/dms/dms-email-bridge";
import { invalidateDmsNotifications, invalidateEmailQueue } from "@/lib/query/invalidation";

interface DmsNotificationsPageClientProps {
  isAdmin: boolean;
  canBridge: boolean;
}

export function DmsNotificationsPageClient({
  isAdmin,
  canBridge,
}: DmsNotificationsPageClientProps) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [bridging, setBridging] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateDmsExpiryNotifications({ limit: 100 });
      if (result.success) {
        toast.success(`${result.data?.created} notifications created, ${result.data?.skipped} skipped`);
        invalidateDmsNotifications(queryClient);
      } else {
        toast.error(result.error ?? "Failed to generate");
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleBridge = async () => {
    setBridging(true);
    try {
      const result = await bridgeDueDmsNotificationsToGlobal({ limit: 50, dryRun: false });
      if (result.success && result.data) {
        const { bridged, alreadyDone, failed } = result.data;
        toast.success(`Bridge complete: ${bridged} bridged, ${alreadyDone} already done, ${failed} failed`);
        invalidateDmsNotifications(queryClient);
        invalidateEmailQueue(queryClient);
      } else {
        toast.error(result.error ?? "Bridge failed");
      }
    } finally {
      setBridging(false);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    try {
      const result = await processDmsExpiryEmailQueue({ limit: 20, dryRun: false });
      if (result.success && result.data) {
        const { processed, sent, failed } = result.data;
        toast.success(`Processed ${processed}: ${sent} sent, ${failed} failed`);
        invalidateDmsNotifications(queryClient);
        invalidateEmailQueue(queryClient);
      } else {
        toast.error(result.error ?? "Processing failed");
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">DMS Notifications</h1>

        </div>
        {(isAdmin || canBridge) && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={generating}
              onClick={handleGenerate}
            >
              <Zap className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
              Generate Due
            </Button>
            {canBridge && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={bridging}
                  onClick={handleBridge}
                >
                  <GitMerge className={`h-4 w-4 ${bridging ? "animate-spin" : ""}`} />
                  Bridge to Global
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={processing}
                  onClick={handleProcess}
                >
                  <Send className={`h-4 w-4 ${processing ? "animate-spin" : ""}`} />
                  Send Emails
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="my">
        <TabsList>
          <TabsTrigger value="my">My Notifications</TabsTrigger>
          {isAdmin && <TabsTrigger value="all">All Notifications</TabsTrigger>}
          <TabsTrigger value="unread">Unread</TabsTrigger>
          {canBridge && <TabsTrigger value="not_bridged">Not Bridged</TabsTrigger>}
        </TabsList>

        <TabsContent value="my" className="mt-4">
          <DmsNotificationsTable filter={{ myOnly: true }} showBridgeStatus={canBridge} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="all" className="mt-4">
            <DmsNotificationsTable filter={{}} showBridgeStatus={canBridge} />
          </TabsContent>
        )}

        <TabsContent value="unread" className="mt-4">
          <DmsNotificationsTable filter={{ myOnly: true, unreadOnly: true }} showBridgeStatus={canBridge} />
        </TabsContent>

        {canBridge && (
          <TabsContent value="not_bridged" className="mt-4">
            <DmsNotificationsTable filter={{ bridgeStatus: "not_bridged" }} showBridgeStatus={true} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
