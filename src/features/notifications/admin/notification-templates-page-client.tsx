"use client";

import { useRefreshableRows } from "@/hooks/use-refreshable-rows";
import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationTemplatesTable } from "./notification-templates-table";
import type { NotificationTemplateRow } from "@/server/actions/notifications/templates";
import { getNotificationTemplates } from "@/server/actions/notifications/templates";

interface NotificationTemplatesPageClientProps {
  initialTemplates: NotificationTemplateRow[];
  canManage: boolean;
  initialError?: boolean;
}

export function NotificationTemplatesPageClient({ initialTemplates, canManage, initialError = false }: NotificationTemplatesPageClientProps) {
  const {rows:templates,failed,loading,refresh}=useRefreshableRows(initialTemplates,initialError,getNotificationTemplates);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Notification Templates</h1>
            <p className="text-sm text-muted-foreground">
              Reusable templates for in-app and email notifications — {templates.length} templates
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} title="Refresh" aria-label="Refresh templates">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {failed && <p role="alert">Templates could not be refreshed. Use Refresh to retry. Changes are disabled until the list is current.</p>}
      <NotificationTemplatesTable templates={templates} onRefresh={refresh} canManage={canManage && !failed && !loading} />
    </div>
  );
}
