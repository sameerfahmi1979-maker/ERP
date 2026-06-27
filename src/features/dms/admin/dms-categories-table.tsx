"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { TableSearchInput } from "@/components/erp/table/table-search-input";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { FolderOpen, PlusCircle, Pencil, Power, Trash2 } from "lucide-react";
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
  createDmsCategory,
  updateDmsCategory,
  activateDmsCategory,
  deactivateDmsCategory,
  deleteDmsCategory,
  type DmsCategoryRow,
} from "@/server/actions/dms/categories";
import type { AuthContext } from "@/lib/rbac/check";

type Props = {
  rows: DmsCategoryRow[];
  authContext: AuthContext;
};

type FormState = {
  category_code: string;
  name_en: string;
  name_ar: string;
  description: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
};

const emptyForm: FormState = {
  category_code: "",
  name_en: "",
  name_ar: "",
  description: "",
  icon: "",
  sort_order: 0,
  is_active: true,
};

function canManage(ctx: AuthContext) {
  return (
    ctx.permissionCodes?.includes("dms.documents.manage_types") ||
    ctx.permissionCodes?.includes("dms.admin") ||
    ctx.roleCodes?.includes("system_admin") ||
    ctx.roleCodes?.includes("group_admin")
  );
}

function canDelete(ctx: AuthContext) {
  return ctx.permissionCodes?.includes("dms.admin") || ctx.roleCodes?.includes("system_admin");
}

export function DmsCategoriesTable({ rows, authContext }: Props) {
  const router = useRouter();
  const manage = canManage(authContext);
  const allowDelete = canDelete(authContext);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DmsCategoryRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DmsCategoryRow | null>(null);

  const table = useSortPaginate(rows, {
    defaultSortKey: "sort_order",
    defaultSortDir: "asc",
    defaultPageSize: 25,
    getSearchText: (r) => [r.category_code, r.name_en, r.name_ar ?? "", r.description ?? ""].join(" "),
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (row: DmsCategoryRow) => {
    setEditing(row);
    setForm({
      category_code: row.category_code,
      name_en: row.name_en,
      name_ar: row.name_ar ?? "",
      description: row.description ?? "",
      icon: row.icon ?? "",
      sort_order: row.sort_order,
      is_active: row.is_active,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.category_code || !form.name_en) {
      toast.error("Code and English name are required");
      return;
    }
    setIsSubmitting(true);
    const payload = {
      category_code: form.category_code.toUpperCase(),
      name_en: form.name_en,
      name_ar: form.name_ar || null,
      description: form.description || null,
      icon: form.icon || null,
      sort_order: form.sort_order,
      is_active: form.is_active,
    };
    const result = editing
      ? await updateDmsCategory(editing.id, payload)
      : await createDmsCategory(payload);
    setIsSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Failed to save");
      return;
    }
    toast.success(editing ? "Category updated" : "Category created");
    setDialogOpen(false);
    router.refresh();
  };

  const handleToggle = async (row: DmsCategoryRow) => {
    const result = row.is_active ? await deactivateDmsCategory(row.id) : await activateDmsCategory(row.id);
    if (!result.success) { toast.error(result.error ?? "Failed"); return; }
    toast.success(row.is_active ? "Category deactivated" : "Category activated");
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteDmsCategory(deleteTarget.id);
    setDeleteTarget(null);
    if (!result.success) { toast.error(result.error ?? "Failed to delete"); return; }
    toast.success("Category deleted");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {table.total !== rows.length
            ? `${table.total} of ${rows.length} ${rows.length === 1 ? "category" : "categories"}`
            : `${rows.length} ${rows.length === 1 ? "category" : "categories"}`}
        </p>
        <div className="flex items-center gap-2">
          <TableSearchInput value={table.query} onChange={table.setQuery} placeholder="Search categories…" className="w-52" />
          {manage && (
            <Button onClick={openAdd} size="sm">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <SortColHeader field="category_code" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort}>Code</SortColHeader>
              <SortColHeader field="name_en" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort}>Name</SortColHeader>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground hidden md:table-cell">Description</th>
              <th className="text-center px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-muted-foreground">Icon</th>
              <SortColHeader field="is_system" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} align="center">System</SortColHeader>
              <SortColHeader field="is_active" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} align="center">Status</SortColHeader>
              <SortColHeader field="sort_order" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} align="center">Order</SortColHeader>
              {(manage || allowDelete) && <th className="px-4 py-2.5 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {table.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  {table.query ? "No categories match your search" : "No categories found"}
                </td>
              </tr>
            )}
            {table.rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/25 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs font-medium text-foreground">{row.category_code}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-sm">{row.name_en}</div>
                  {row.name_ar && <div className="text-xs text-muted-foreground" dir="rtl">{row.name_ar}</div>}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[200px] truncate hidden md:table-cell">
                  {row.description ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{row.icon || "—"}</td>
                <td className="px-4 py-2.5 text-center">
                  {row.is_system && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">System</Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Badge className={`text-[10px] px-1.5 py-0 ${row.is_active ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                    {row.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{row.sort_order}</td>
                {(manage || allowDelete) && (
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      {manage && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleToggle(row)}
                            title={row.is_active ? "Deactivate" : "Activate"}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {allowDelete && !row.is_system && (
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
        <TablePagination
          page={table.page}
          totalPages={table.totalPages}
          onPage={table.setPage}
          pageSize={table.pageSize}
          onPageSize={table.setPageSize}
          total={table.total}
        />
      </div>

      {/* Add / Edit Dialog */}
      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Document Category" : "Add Document Category"}
        subtitle="Organize document types into logical groups"
        icon={<FolderOpen className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <RequiredLabel required>Category Code</RequiredLabel>
            <Input
              value={form.category_code}
              onChange={(e) => setForm((f) => ({ ...f, category_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. LEGAL"
              disabled={!!editing}
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Uppercase letters, numbers, and underscores</p>
          </div>
          <div className="col-span-3">
            <Label>Sort Order</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
              min={0}
            />
          </div>
          <div className="col-span-3">
            <Label>Icon</Label>
            <Input
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              placeholder="e.g. folder"
            />
          </div>
          <div className="col-span-6">
            <RequiredLabel required>Name (English)</RequiredLabel>
            <Input
              value={form.name_en}
              onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
              placeholder="e.g. Legal Documents"
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
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            />
            <Label>Active</Label>
          </div>
        </div>
      </ERPChildDialogForm>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name_en}&quot;? This action cannot be undone.
              System categories and categories with document types cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
