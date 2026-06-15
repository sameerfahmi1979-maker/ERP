"use client";

import { useState, useTransition, useCallback } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationTemplatesTable } from "./notification-templates-table";
import type { NotificationTemplateRow } from "@/server/actions/notifications/templates";
import { getNotificationTemplates } from "@/server/actions/notifications/templates";

interface NotificationTemplatesPageClientProps {
  initialTemplates: NotificationTemplateRow[];
  canManage: boolean;
}

export function NotificationTemplatesPageClient({ initialTemplates, canManage }: NotificationTemplatesPageClientProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [loading, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await getNotificationTemplates();
      if (result.success && result.data) setTemplates(result.data);
    });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Notification Templates</h1>
            <p className="text-sm text-muted-foreground">
              Reusable templates for in-app and email notifications — {templates.length} templates
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <NotificationTemplatesTable templates={templates} onRefresh={refresh} canManage={canManage} />
    </div>
  );
}
