"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { Tag, PlusCircle, Pencil, Power, Trash2 } from "lucide-react";
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
  createDmsTag,
  updateDmsTag,
  activateDmsTag,
  deactivateDmsTag,
  deleteDmsTag,
  type DmsTagRow,
} from "@/server/actions/dms/tags";
import type { AuthContext } from "@/lib/rbac/check";
import { format } from "date-fns";

type Props = {
  rows: DmsTagRow[];
  authContext: AuthContext;
};

type FormState = {
  tag_code: string;
  tag_name: string;
  color_hex: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  tag_code: "",
  tag_name: "",
  color_hex: "#6366f1",
  is_active: true,
};

function canManage(ctx: AuthContext) {
  return (
    ctx.permissionCodes?.includes("dms.documents.manage_tags") ||
    ctx.permissionCodes?.includes("dms.admin") ||
    ctx.roleCodes?.includes("system_admin") ||
    ctx.roleCodes?.includes("group_admin")
  );
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#64748b",
];

export function DmsTagsTable({ rows, authContext }: Props) {
  const router = useRouter();
  const manage = canManage(authContext);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DmsTagRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DmsTagRow | null>(null);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (row: DmsTagRow) => {
    setEditing(row);
    setForm({
      tag_code: row.tag_code ?? "",
      tag_name: row.tag_name,
      color_hex: row.color_hex ?? "#6366f1",
      is_active: row.is_active,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.tag_name) {
      toast.error("Tag name is required");
      return;
    }
    if (form.color_hex && !/^#[0-9A-Fa-f]{6}$/.test(form.color_hex)) {
      toast.error("Color must be a valid hex (e.g. #FF5733)");
      return;
    }
    setIsSubmitting(true);
    const payload = {
      tag_code: form.tag_code ? form.tag_code.toUpperCase() : null,
      tag_name: form.tag_name,
      color_hex: form.color_hex || null,
      is_active: form.is_active,
    };
    const result = editing
      ? await updateDmsTag(editing.id, payload)
      : await createDmsTag(payload);
    setIsSubmitting(false);
    if (!result.success) { toast.error(result.error ?? "Failed to save"); return; }
    toast.success(editing ? "Tag updated" : "Tag created");
    setDialogOpen(false);
    router.refresh();
  };

  const handleToggle = async (row: DmsTagRow) => {
    const result = row.is_active ? await deactivateDmsTag(row.id) : await activateDmsTag(row.id);
    if (!result.success) { toast.error(result.error ?? "Failed"); return; }
    toast.success(row.is_active ? "Tag deactivated" : "Tag activated");
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteDmsTag(deleteTarget.id);
    setDeleteTarget(null);
    if (!result.success) { toast.error(result.error ?? "Failed to delete"); return; }
    toast.success("Tag deleted");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? "tag" : "tags"}</p>
        {manage && (
          <Button onClick={openAdd} size="sm">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Tag
          </Button>
        )}
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Tag</th>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Code</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Color</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">System</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Docs</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground hidden md:table-cell">Updated</th>
              {manage && <th className="px-4 py-2.5 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">No tags found</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/25 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {row.color_hex && (
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: row.color_hex }} />
                    )}
                    <span className="font-medium text-sm">{row.tag_name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground hidden sm:table-cell">
                  {row.tag_code ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {row.color_hex ? (
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="h-4 w-4 rounded border border-border/50" style={{ backgroundColor: row.color_hex }} />
                      <span className="font-mono text-[10px] text-muted-foreground">{row.color_hex}</span>
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {row.is_system && <Badge variant="outline" className="text-[10px] px-1.5 py-0">System</Badge>}
                </td>
                <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">
                  {row.document_count ?? 0}
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
                      {!row.is_system && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(row)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Tag" : "Add Tag"}
        subtitle="Tags help categorize and filter DMS documents"
        icon={<Tag className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="sm"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-8">
            <RequiredLabel required>Tag Name</RequiredLabel>
            <Input
              value={form.tag_name}
              onChange={(e) => setForm((f) => ({ ...f, tag_name: e.target.value }))}
              placeholder="e.g. Urgent Review"
            />
          </div>
          <div className="col-span-4">
            <Label>Tag Code</Label>
            <Input
              value={form.tag_code}
              onChange={(e) => setForm((f) => ({ ...f, tag_code: e.target.value.toUpperCase() }))}
              placeholder="URGENT"
              className="font-mono"
            />
          </div>
          <div className="col-span-12">
            <Label>Color</Label>
            <div className="flex items-center gap-3 mt-1.5">
              <Input
                value={form.color_hex}
                onChange={(e) => setForm((f) => ({ ...f, color_hex: e.target.value }))}
                placeholder="#6366f1"
                className="font-mono w-32"
              />
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color_hex: c }))}
                    className={`h-6 w-6 rounded-full border-2 transition-all ${form.color_hex === c ? "border-primary scale-110" : "border-transparent hover:border-muted-foreground/50"}`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
            {form.color_hex && (
              <div className="flex items-center gap-2 mt-2">
                <span className="h-4 w-4 rounded border" style={{ backgroundColor: form.color_hex }} />
                <span className="text-xs text-muted-foreground">Preview</span>
                <Badge style={{ backgroundColor: form.color_hex, color: "#fff" }} className="text-xs border-0">
                  {form.tag_name || "Tag Name"}
                </Badge>
              </div>
            )}
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
            <AlertDialogTitle>Delete Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Delete tag &quot;{deleteTarget?.tag_name}&quot;? Tags in use cannot be deleted.
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
