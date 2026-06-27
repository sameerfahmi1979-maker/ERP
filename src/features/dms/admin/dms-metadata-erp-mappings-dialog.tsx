"use client";

/**
 * ERP DMS AI Phase 8 — DMS Admin ERP Mappings Dialog
 *
 * Admin-only child dialog for configuring ERP mapping rules per metadata definition.
 * Uses ERPChildDialogForm pattern. Read-only list for non-admins.
 *
 * Phase 8: allow_apply_to_existing is ALWAYS false (preview-only).
 */

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Network, Plus, Pencil, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getDmsErpMappingsForDefinition,
  getDmsErpMappingTargetRegistry,
  createDmsErpMapping,
  updateDmsErpMapping,
  deleteDmsErpMapping,
  type DmsErpMappingRow,
} from "@/server/actions/dms/erp-mappings";
import { listErpMappingFields } from "@/lib/dms/erp-mapping/erp-mapping-targets";
import { queryKeys } from "@/lib/query/query-keys";
import type { AuthContext } from "@/lib/rbac/check";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definitionId: number;
  documentTypeId: number;
  fieldCode: string;
  fieldLabelEn: string;
  authContext: AuthContext;
};

type MappingFormState = {
  target_module: string;
  target_entity: string;
  target_table: string;
  target_field: string;
  target_record_strategy: "link_exact" | "link_parent";
  mapping_priority: string;
  is_active: boolean;
  requires_confirmation: boolean;
  notes: string;
};

const EMPTY_FORM: MappingFormState = {
  target_module: "",
  target_entity: "",
  target_table: "",
  target_field: "",
  target_record_strategy: "link_exact",
  mapping_priority: "10",
  is_active: true,
  requires_confirmation: true,
  notes: "",
};

function isAdmin(ctx: AuthContext): boolean {
  return (
    ctx.permissionCodes?.includes("dms.admin") ||
    ctx.permissionCodes?.includes("dms.documents.manage_types") ||
    ctx.roleCodes?.includes("system_admin") ||
    ctx.roleCodes?.includes("group_admin") ||
    false
  );
}

export function DmsMetadataErpMappingsDialog({
  open,
  onOpenChange,
  definitionId,
  documentTypeId,
  fieldCode,
  fieldLabelEn,
  authContext,
}: Props) {
  const qc = useQueryClient();
  const manage = isAdmin(authContext);

  const [innerDialogOpen, setInnerDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DmsErpMappingRow | null>(null);
  const [form, setForm] = useState<MappingFormState>({ ...EMPTY_FORM });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DmsErpMappingRow | null>(null);

  // Load existing mappings
  const { data: mappingsResult, isLoading } = useQuery({
    queryKey: queryKeys.dms.erpMappingsForDefinition(definitionId),
    queryFn: () => getDmsErpMappingsForDefinition(definitionId),
    enabled: open,
  });
  const mappings = mappingsResult?.data ?? [];

  // Load target registry for dropdowns
  const { data: registryResult } = useQuery({
    queryKey: queryKeys.dms.erpMappingTargets(),
    queryFn: () => getDmsErpMappingTargetRegistry(),
    enabled: open && manage,
    staleTime: 5 * 60 * 1000,
  });
  const registry = registryResult?.data ?? [];

  // Build available tables filtered by selected module
  const availableModules = [...new Set(registry.map((r) => r.module))];
  const availableTables = registry
    .filter((r) => r.module === form.target_module)
    .map((r) => ({ table: r.table, label: r.config.tableLabel }));

  const availableFields = form.target_table
    ? listErpMappingFields(form.target_module, form.target_table)
    : [];

  const setFormField = <K extends keyof MappingFormState>(key: K, value: MappingFormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Reset cascading selections when parent changes
      if (key === "target_module") {
        next.target_table = "";
        next.target_field = "";
        next.target_entity = "";
      }
      if (key === "target_table") {
        next.target_field = "";
        // Auto-fill target_entity from registry
        const found = registry.find((r) => r.module === next.target_module && r.table === value);
        if (found) {
          next.target_entity = found.config.directEntityTypes[0] ?? "";
        }
      }
      return next;
    });
  };

  const openAdd = useCallback(() => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setInnerDialogOpen(true);
  }, []);

  const openEdit = useCallback((row: DmsErpMappingRow) => {
    setEditing(row);
    setForm({
      target_module: row.target_module,
      target_entity: row.target_entity,
      target_table: row.target_table,
      target_field: row.target_field,
      target_record_strategy: (row.target_record_strategy as "link_exact" | "link_parent") ?? "link_exact",
      mapping_priority: String(row.mapping_priority),
      is_active: row.is_active,
      requires_confirmation: row.requires_confirmation,
      notes: row.notes ?? "",
    });
    setInnerDialogOpen(true);
  }, []);

  const handleSubmit = async () => {
    if (!form.target_module || !form.target_table || !form.target_field) {
      toast.error("Please select target module, table, and field.");
      return;
    }
    setIsSubmitting(true);
    try {
      const priority = parseInt(form.mapping_priority);
      if (editing) {
        const r = await updateDmsErpMapping(editing.id, {
          target_module: form.target_module,
          target_entity: form.target_entity,
          target_table: form.target_table,
          target_field: form.target_field,
          target_relation_field: "", // server derives from registry
          target_record_strategy: form.target_record_strategy,
          mapping_priority: isNaN(priority) ? 10 : priority,
          is_active: form.is_active,
          requires_confirmation: form.requires_confirmation,
          notes: form.notes || null,
        });
        if (!r.success) { toast.error(r.error ?? "Failed to update mapping"); return; }
        toast.success("ERP mapping updated");
      } else {
        const found = registry.find((r) => r.module === form.target_module && r.table === form.target_table);
        const r = await createDmsErpMapping({
          metadata_definition_id: definitionId,
          document_type_id: documentTypeId,
          target_module: form.target_module,
          target_entity: form.target_entity,
          target_table: form.target_table,
          target_field: form.target_field,
          target_relation_field: found?.config.relationField ?? "",
          target_record_strategy: form.target_record_strategy,
          mapping_priority: isNaN(priority) ? 10 : priority,
          is_active: form.is_active,
          requires_confirmation: form.requires_confirmation,
          notes: form.notes || null,
        });
        if (!r.success) { toast.error(r.error ?? "Failed to create mapping"); return; }
        toast.success("ERP mapping created");
      }
      void qc.invalidateQueries({ queryKey: queryKeys.dms.erpMappingsForDefinition(definitionId) });
      void qc.invalidateQueries({ queryKey: queryKeys.dms.erpMappingsForDocumentType(documentTypeId) });
      setInnerDialogOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const r = await deleteDmsErpMapping(deleteTarget.id);
    if (!r.success) { toast.error(r.error ?? "Failed to delete"); return; }
    toast.success("ERP mapping deleted");
    void qc.invalidateQueries({ queryKey: queryKeys.dms.erpMappingsForDefinition(definitionId) });
    void qc.invalidateQueries({ queryKey: queryKeys.dms.erpMappingsForDocumentType(documentTypeId) });
    setDeleteTarget(null);
  };

  // Auto-fill relation field label for display
  const currentTargetConfig = registry.find(
    (r) => r.module === form.target_module && r.table === form.target_table
  );

  return (
    <>
      {/* Main list dialog */}
      <ERPChildDialogForm
        open={open}
        onOpenChange={onOpenChange}
        title={`ERP Mappings — ${fieldLabelEn}`}
        subtitle={`field_code: ${fieldCode} · Configure how this metadata field maps to ERP records`}
        icon={<Network className="h-5 w-5" />}
        mode="view"
        size="xl"
        onSubmit={manage ? openAdd : undefined}
        submitLabel="Add Mapping"
        cancelLabel="Close"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : mappings.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Network className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p>No ERP mappings configured for this field.</p>
            {manage && (
              <p className="mt-1 text-xs">Click &quot;Add Mapping&quot; to create the first rule.</p>
            )}
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Module</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Target Table</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Target Field</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Strategy</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Priority</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Permission</th>
                  {manage && <th className="w-16"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {mappings.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/10">
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase">
                        {m.target_module}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-foreground">{m.target_table}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-foreground">{m.target_field}</td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground">{m.target_record_strategy}</td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground tabular-nums">{m.mapping_priority}</td>
                    <td className="px-3 py-2">
                      <Badge
                        className={`text-[10px] px-1.5 py-0 ${m.is_active ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600"}`}
                      >
                        {m.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground font-mono">
                      {m.requires_target_permission}
                    </td>
                    {manage && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => openEdit(m)}
                            title="Edit mapping"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-red-600 hover:text-red-700"
                            onClick={() => setDeleteTarget(m)}
                            title="Delete mapping"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md p-3">
          <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
          <span>
            Phase 8: ERP mapping is read-only preview. No ERP records are updated.
            Apply-to-ERP functionality is planned for Phase 9.
          </span>
        </div>
      </ERPChildDialogForm>

      {/* Add/Edit mapping inner dialog */}
      {manage && (
        <ERPChildDialogForm
          open={innerDialogOpen}
          onOpenChange={setInnerDialogOpen}
          title={editing ? "Edit ERP Mapping" : "Add ERP Mapping"}
          subtitle={`Mapping for: ${fieldLabelEn} (${fieldCode})`}
          icon={<Network className="h-5 w-5" />}
          mode={editing ? "edit" : "add"}
          size="lg"
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
        >
          <div className="grid grid-cols-12 gap-4">
            {/* Target Module */}
            <div className="col-span-6">
              <label className="block text-xs font-medium text-foreground mb-1">
                Target Module <span className="text-red-500">*</span>
              </label>
              <Select
                value={form.target_module}
                onValueChange={(v) => setFormField("target_module", v ?? "")}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select module..." />
                </SelectTrigger>
                <SelectContent>
                  {availableModules.map((mod) => (
                    <SelectItem key={mod} value={mod}>
                      {mod === "hr" ? "HR" : mod === "party" ? "Party Master" : mod}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target Table */}
            <div className="col-span-6">
              <label className="block text-xs font-medium text-foreground mb-1">
                Target Table <span className="text-red-500">*</span>
              </label>
              <Select
                value={form.target_table}
                onValueChange={(v) => setFormField("target_table", v ?? "")}
                disabled={!form.target_module}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select table..." />
                </SelectTrigger>
                <SelectContent>
                  {availableTables.map((t) => (
                    <SelectItem key={t.table} value={t.table}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target Field */}
            <div className="col-span-6">
              <label className="block text-xs font-medium text-foreground mb-1">
                Target Field <span className="text-red-500">*</span>
              </label>
              <Select
                value={form.target_field}
                onValueChange={(v) => setFormField("target_field", v ?? "")}
                disabled={!form.target_table}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select field..." />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map((f) => (
                    <SelectItem key={f.column} value={f.column}>
                      {f.label} <span className="text-muted-foreground ml-1 text-[10px]">({f.column})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Record Strategy */}
            <div className="col-span-6">
              <label className="block text-xs font-medium text-foreground mb-1">
                Record Strategy
              </label>
              <Select
                value={form.target_record_strategy}
                onValueChange={(v) => setFormField("target_record_strategy", v as "link_exact" | "link_parent")}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="link_exact">link_exact — linked entity IS the target record</SelectItem>
                  <SelectItem value="link_parent">link_parent — linked entity is the parent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Auto-filled read-only fields */}
            {currentTargetConfig && (
              <>
                <div className="col-span-6">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Relation Field (auto)
                  </label>
                  <div className="h-8 px-3 flex items-center rounded-md border border-border bg-muted/30 text-xs font-mono text-muted-foreground">
                    {currentTargetConfig.config.relationField}
                  </div>
                </div>
                <div className="col-span-6">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Required Permission (auto)
                  </label>
                  <div className="h-8 px-3 flex items-center rounded-md border border-border bg-muted/30 text-xs font-mono text-muted-foreground truncate">
                    {currentTargetConfig.config.permission}
                  </div>
                </div>
              </>
            )}

            {/* Priority */}
            <div className="col-span-4">
              <label className="block text-xs font-medium text-foreground mb-1">Priority</label>
              <input
                type="number"
                min={1}
                max={999}
                value={form.mapping_priority}
                onChange={(e) => setFormField("mapping_priority", e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Active */}
            <div className="col-span-4 flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setFormField("is_active", e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Active
              </label>
            </div>

            {/* Requires confirmation */}
            <div className="col-span-4 flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requires_confirmation}
                  onChange={(e) => setFormField("requires_confirmation", e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Requires Confirmation
              </label>
            </div>

            {/* Notes */}
            <div className="col-span-12">
              <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setFormField("notes", e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Optional notes about this mapping..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Phase 8 notice */}
            <div className="col-span-12">
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
                <span>
                  Phase 8: <strong>Allow Apply to Existing</strong> is disabled.
                  ERP mapping is preview-only. Enable apply in Phase 9.
                </span>
              </div>
            </div>
          </div>
        </ERPChildDialogForm>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ERP Mapping</AlertDialogTitle>
            <AlertDialogDescription>
              Remove mapping from <strong>{deleteTarget?.target_table}.{deleteTarget?.target_field}</strong>?
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
