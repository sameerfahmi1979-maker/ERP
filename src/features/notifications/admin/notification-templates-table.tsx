"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PlusCircle, ToggleLeft, ToggleRight, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { NotificationTemplateRow } from "@/server/actions/notifications/templates";
import {
  deactivateNotificationTemplate,
  updateNotificationTemplate,
} from "@/server/actions/notifications/templates";
import { NotificationTemplateFormDialog } from "./notification-template-form-dialog";

interface NotificationTemplatesTableProps {
  templates: NotificationTemplateRow[];
  onRefresh: () => void;
  canManage: boolean;
}

export function NotificationTemplatesTable({ templates, onRefresh, canManage }: NotificationTemplatesTableProps) {
  const [actingId, setActingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplateRow | null>(null);

  const handleToggle = (id: number, currentActive: boolean) => {
    setActingId(id);
    startTransition(async () => {
      const result = currentActive
        ? await deactivateNotificationTemplate(id)
        : await updateNotificationTemplate(id, { is_system: undefined });
      if (result.success) {
        toast.success(currentActive ? "Deactivated" : "Activated");
        onRefresh();
      } else {
        toast.error(result.error ?? "Failed");
      }
      setActingId(null);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => { setEditingTemplate(null); setDialogOpen(true); }}
          >
            <PlusCircle className="h-4 w-4" />
            New Template
          </Button>
        </div>
      )}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Code</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Name</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Module</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Type</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Severity</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Channels</th>
              <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Status</th>
              {canManage && (
                <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {templates.map((t) => (
              <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.templateCode}</code>
                </td>
                <td className="px-3 py-2 text-xs font-medium">{t.templateName}</td>
                <td className="px-3 py-2 text-xs">{t.sourceModule}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{t.notificationType}</td>
                <td className="px-3 py-2 text-xs capitalize">{t.defaultSeverity}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {t.defaultChannelInApp && <Badge variant="outline" className="text-xs py-0">In-App</Badge>}
                    {t.defaultChannelEmail && <Badge variant="outline" className="text-xs py-0 border-blue-200 text-blue-700">Email</Badge>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={t.isActive ? "default" : "secondary"} className="text-xs">
                    {t.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                {canManage && (
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Edit"
                        onClick={() => { setEditingTemplate(t); setDialogOpen(true); }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={t.isActive ? "Deactivate" : "Activate"}
                        disabled={actingId === t.id}
                        onClick={() => handleToggle(t.id, t.isActive)}
                      >
                        {t.isActive ? (
                          <ToggleRight className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialogOpen && (
        <NotificationTemplateFormDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditingTemplate(null); }}
          onSuccess={() => { setDialogOpen(false); setEditingTemplate(null); onRefresh(); }}
          template={editingTemplate}
        />
      )}
    </div>
  );
}
