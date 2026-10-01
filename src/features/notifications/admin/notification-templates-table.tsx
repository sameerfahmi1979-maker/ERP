"use client";
import { LoadedListTools, useLoadedListView, type LoadedListField } from "@/components/erp/table/loaded-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { TablePagination } from "@/components/erp/table/table-pagination";

import { useState, useTransition, useRef } from "react";
import { toast } from "sonner";
import { PlusCircle, ToggleLeft, ToggleRight, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { NotificationTemplateRow } from "@/server/actions/notifications/templates";
import {
  deactivateNotificationTemplate,
  activateNotificationTemplate,
} from "@/server/actions/notifications/templates";
import { NotificationTemplateFormDialog } from "./notification-template-form-dialog";

interface NotificationTemplatesTableProps {
  templates: NotificationTemplateRow[];
  onRefresh: () => void;
  canManage: boolean;
}

const LIST_FIELDS: LoadedListField[] = [
  {
    "id": "templateCode",
    "label": "Code",
    "path": "templateCode",
    "type": "text",
    "width": 180,
    "required": true
  },
  {
    "id": "templateName",
    "label": "Name",
    "path": "templateName",
    "type": "text",
    "width": 180
  },
  {
    "id": "sourceModule",
    "label": "Module",
    "path": "sourceModule",
    "type": "text",
    "width": 180
  },
  {
    "id": "notificationType",
    "label": "Type",
    "path": "notificationType",
    "type": "text",
    "width": 180
  },
  {
    "id": "defaultSeverity",
    "label": "Severity",
    "path": "defaultSeverity",
    "type": "text",
    "width": 180
  },
  {
    "id": "channels",
    "label": "Channels",
    "type": "text",
    "width": 180
  },
  {
    "id": "isActive",
    "label": "Active",
    "path": "isActive",
    "type": "select",
    "width": 180,
    "options": [
      {
        "value": "true",
        "label": "Active"
      },
      {
        "value": "false",
        "label": "Inactive"
      }
    ]
  },
  {
    "id": "actions",
    "label": "Actions",
    "type": "text",
    "width": 160
  }
];
export function NotificationTemplatesTable({ templates, onRefresh, canManage }: NotificationTemplatesTableProps) {
  const [actingId, setActingId] = useState<number | null>(null);
  const flight = useRef(false);
  const [, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplateRow | null>(null);

  const listView = useLoadedListView("NotificationTemplatesTable", templates, LIST_FIELDS.filter(field => field.id !== "actions" || canManage));
  const pagination = useSortPaginate(listView.rows,{memoryKey:"NotificationTemplatesTable"});
  const handleToggle = (id: number, currentActive: boolean) => {
    if (flight.current || !canManage) return;
    flight.current = true;
    setActingId(id);
    startTransition(async () => {
      try {
      const result = currentActive
        ? await deactivateNotificationTemplate(id)
        : await activateNotificationTemplate(id);
      if (result.success) {
        toast.success(currentActive ? "Deactivated" : "Activated");
        onRefresh();
      } else {
        toast.error(result.error ?? "Failed");
      }
      } catch { toast.error("The template change could not be confirmed. Refresh before retrying."); }
      finally { setActingId(null); flight.current = false; }
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
      <div className="rounded-lg border bg-card overflow-x-auto"><LoadedListTools view={listView} search />
        <div role="region" aria-label="NotificationTemplatesTable results" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{minWidth:listView.visible.reduce((sum,c)=>sum+c.width,0)}}><colgroup>{listView.visible.map(c=><col key={c.id} style={{width:c.width}} />)}</colgroup>
          <thead className="border-b bg-muted/40">
            <ConfiguredRow columns={listView.columns}>
              <th data-column="templateCode" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Code</th>
              <th data-column="templateName" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Name</th>
              <th data-column="sourceModule" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Module</th>
              <th data-column="notificationType" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Type</th>
              <th data-column="defaultSeverity" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Severity</th>
              <th data-column="channels" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Channels</th>
              <th data-column="isActive" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Status</th>
              {canManage && (
                <th data-column="actions" className="text-right px-3 py-2 font-medium text-xs text-muted-foreground">Actions</th>
              )}
            </ConfiguredRow>
          </thead>
          <tbody className="divide-y divide-border">
            {pagination.rows.map((t) => (
              <ConfiguredRow columns={listView.columns} key={t.id} className="hover:bg-muted/20 transition-colors">
                <td data-column="templateCode" className="px-3 py-2">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.templateCode}</code>
                </td>
                <td data-column="templateName" className="px-3 py-2 text-xs font-medium">{t.templateName}</td>
                <td data-column="sourceModule" className="px-3 py-2 text-xs">{t.sourceModule}</td>
                <td data-column="notificationType" className="px-3 py-2 text-xs text-muted-foreground">{t.notificationType}</td>
                <td data-column="defaultSeverity" className="px-3 py-2 text-xs capitalize">{t.defaultSeverity}</td>
                <td data-column="channels" className="px-3 py-2">
                  <div className="flex gap-1">
                    {t.defaultChannelInApp && <Badge variant="outline" className="text-xs py-0">In-App</Badge>}
                    {t.defaultChannelEmail && <Badge variant="outline" className="text-xs py-0 border-blue-200 text-blue-700">Email</Badge>}
                  </div>
                </td>
                <td data-column="isActive" className="px-3 py-2">
                  <Badge variant={t.isActive ? "default" : "secondary"} className="text-xs">
                    {t.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                {canManage && (
                  <td data-column="actions" className="px-3 py-2">
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
              </ConfiguredRow>
            ))}
          </tbody>
        </table></div>
      <TablePagination page={pagination.page} totalPages={pagination.totalPages} onPage={pagination.setPage} pageSize={pagination.pageSize} onPageSize={pagination.setPageSize} total={pagination.totalFiltered}/></div>
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
