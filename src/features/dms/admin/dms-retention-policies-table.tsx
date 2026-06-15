"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { Clock, PlusCircle, Pencil, Power, Trash2, Info } from "lucide-react";
import { toast } from "sonner";
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
  createDmsRetentionPolicy,
  updateDmsRetentionPolicy,
  activateDmsRetentionPolicy,
  deactivateDmsRetentionPolicy,
  deleteDmsRetentionPolicy,
  type DmsRetentionPolicyRow,
} from "@/server/actions/dms/retention-policies";
import { ALLOWED_ACTIONS_ON_EXPIRY } from "@/features/dms/admin/dms-constants";
import type { AuthContext } from "@/lib/rbac/check";
import { format } from "date-fns";

type Props = {
  rows: DmsRetentionPolicyRow[];
  authContext: AuthContext;
};

type FormState = {
  policy_code: string;
  name_en: string;
  name_ar: string;
  description: string;
  retain_for_days: string;
  action_on_expiry: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  policy_code: "",
  name_en: "",
  name_ar: "",
  description: "",
  retain_for_days: "",
  action_on_expiry: "notify",
  is_active: true,
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  notify: { label: "Notify", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  archive: { label: "Archive", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  delete_prompt: { label: "Delete Prompt", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  review: { label: "Review", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
};

function canManage(ctx: AuthContext) {
  return (
    ctx.permissionCodes?.includes("dms.documents.manage_types") ||
    ctx.permissionCodes?.includes("dms.admin") ||
    ctx.roleCodes?.includes("system_admin") ||
    ctx.roleCodes?.includes("group_admin")
  );
}

export function DmsRetentionPoliciesTable({ rows, authContext }: Props) {
  const router = useRouter();
  const manage = canManage(authContext);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DmsRetentionPolicyRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DmsRetentionPolicyRow | null>(null);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (row: DmsRetentionPolicyRow) => {
    setEditing(row);
    setForm({
      policy_code: row.policy_code,
      name_en: row.name_en,
      name_ar: row.name_ar ?? "",
      description: row.description ?? "",
      retain_for_days: row.retain_for_days ? String(row.retain_for_days) : "",
      action_on_expiry: row.action_on_expiry,
      is_active: row.is_active,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.policy_code || !form.name_en) {
      toast.error("Code and English name are required");
      return;
    }
    const days = form.retain_for_days ? parseInt(form.retain_for_days) : null;
    if (form.retain_for_days && (isNaN(days!) || days! <= 0)) {
      toast.error("Retention days must be a positive number");
      return;
    }
    setIsSubmitting(true);
    const payload = {
      policy_code: form.policy_code.toUpperCase(),
      name_en: form.name_en,
      name_ar: form.name_ar || null,
      description: form.description || null,
      retain_for_days: days,
      action_on_expiry: form.action_on_expiry as typeof ALLOWED_ACTIONS_ON_EXPIRY[number],
      applies_to_types: editing?.applies_to_types ?? [],
      is_active: form.is_active,
    };
    const result = editing
      ? await updateDmsRetentionPolicy(editing.id, payload)
      : await createDmsRetentionPolicy(payload);
    setIsSubmitting(false);
    if (!result.success) { toast.error(result.error ?? "Failed to save"); return; }
    toast.success(editing ? "Retention policy updated" : "Retention policy created");
    setDialogOpen(false);
    router.refresh();
  };

  const handleToggle = async (row: DmsRetentionPolicyRow) => {
    const result = row.is_active ? await deactivateDmsRetentionPolicy(row.id) : await activateDmsRetentionPolicy(row.id);
    if (!result.success) { toast.error(result.error ?? "Failed"); return; }
    toast.success(row.is_active ? "Policy deactivated" : "Policy activated");
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteDmsRetentionPolicy(deleteTarget.id);
    setDeleteTarget(null);
    if (!result.success) { toast.error(result.error ?? "Failed to delete"); return; }
    toast.success("Retention policy deleted");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* delete_prompt safety banner */}
      <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-xs">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          <strong>No automatic hard deletion.</strong> The &quot;Delete Prompt&quot; action only prompts administrators — documents are never auto-deleted.
        </span>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? "policy" : "policies"}</p>
        {manage && (
          <Button onClick={openAdd} size="sm">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Policy
          </Button>
        )}
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Code</th>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Retain (Days)</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Action on Expiry</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground hidden md:table-cell">Updated</th>
              {manage && <th className="px-4 py-2.5 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">No retention policies found</td>
              </tr>
            )}
            {rows.map((row) => {
              const action = ACTION_LABELS[row.action_on_expiry] ?? { label: row.action_on_expiry, color: "bg-gray-100 text-gray-600" };
              return (
                <tr key={row.id} className="hover:bg-muted/25 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs font-medium">{row.policy_code}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-sm">{row.name_en}</div>
                    {row.name_ar && <div className="text-xs text-muted-foreground" dir="rtl">{row.name_ar}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-center text-sm">
                    {row.retain_for_days ? (
                      <span className="font-medium">{row.retain_for_days.toLocaleString()}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge className={`text-[10px] px-1.5 py-0 ${action.color}`}>{action.label}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge className={`text-[10px] px-1.5 py-0 ${row.is_active ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                      {row.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-muted-foreground hidden md:table-cell">
                    {format(new Date(row.updated_at), "dd MMM yyyy")}
                  </td>
                  {manage && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleToggle(row)} title={row.is_active ? "Deactivate" : "Activate"}>
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Retention Policy" : "Add Retention Policy"}
        subtitle="Define document retention rules and actions on expiry"
        icon={<Clock className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-5">
            <RequiredLabel required>Policy Code</RequiredLabel>
            <Input
              value={form.policy_code}
              onChange={(e) => setForm((f) => ({ ...f, policy_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. STANDARD_7Y"
              disabled={!!editing}
              className="font-mono"
            />
          </div>
          <div className="col-span-4">
            <Label>Retain For (Days)</Label>
            <Input
              type="number"
              value={form.retain_for_days}
              onChange={(e) => setForm((f) => ({ ...f, retain_for_days: e.target.value }))}
              placeholder="e.g. 2555"
              min={1}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Leave blank for indefinite</p>
          </div>
          <div className="col-span-3">
            <RequiredLabel required>Action on Expiry</RequiredLabel>
            <Select value={form.action_on_expiry} onValueChange={(v) => setForm((f) => ({ ...f, action_on_expiry: v ?? "notify" }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLOWED_ACTIONS_ON_EXPIRY.map((a) => (
                  <SelectItem key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.action_on_expiry === "delete_prompt" && (
            <div className="col-span-12">
              <div className="flex items-center gap-2 p-2 rounded bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300 text-xs">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Delete Prompt only shows an admin prompt — no automatic deletion occurs.
              </div>
            </div>
          )}
          <div className="col-span-6">
            <RequiredLabel required>Name (English)</RequiredLabel>
            <Input
              value={form.name_en}
              onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
              placeholder="e.g. Standard 7 Years"
            />
          </div>
          <div className="col-span-6">
            <Label>Name (Arabic)</Label>
            <Input
              value={form.name_ar}
              onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))}
              placeholder="الاسم بالعربي"
              dir="rtl"
            />
          </div>
          <div className="col-span-12">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional description"
              rows={2}
            />
          </div>
          <div className="col-span-12 flex items-center gap-3">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            <Label>Active</Label>
          </div>
        </div>
      </ERPChildDialogForm>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Retention Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Delete policy &quot;{deleteTarget?.name_en}&quot;? Policies assigned to documents cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
