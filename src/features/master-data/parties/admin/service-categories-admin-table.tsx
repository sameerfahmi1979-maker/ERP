"use client";

import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { PlusCircle, Pencil, Power, Tags } from "lucide-react";
import { toast } from "sonner";
import { RequiredLabel } from "@/components/erp/required-label";
import {
  createServiceCategory,
  updateServiceCategory,
} from "@/server/actions/master-data/party-admin-masters";
import type { ServiceCategoryAdminRow } from "@/server/actions/master-data/party-admin-masters";
import type { AuthContext } from "@/lib/rbac/check";
import { useRouter } from "next/navigation";

type Props = {
  rows: ServiceCategoryAdminRow[];
  authContext: AuthContext;
};

type FormState = {
  category_code: string;
  category_name_en: string;
  category_name_ar: string;
  parent_category_id: number | null;
  description: string;
  is_active: boolean;
  sort_order: number;
};

const emptyForm: FormState = {
  category_code: "",
  category_name_en: "",
  category_name_ar: "",
  parent_category_id: null,
  description: "",
  is_active: true,
  sort_order: 0,
};

export function ServiceCategoriesAdminTable({ rows, authContext }: Props) {
  const router = useRouter();
  const canManage = authContext.permissionCodes?.includes("master_data.parties.manage_services") || authContext.roleCodes?.includes("system_admin") || authContext.roleCodes?.includes("group_admin");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceCategoryAdminRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parentOptions = rows
    .filter((r) => !editing || r.id !== editing.id)
    .map((r) => ({ value: r.id, label: r.category_name_en, code: r.category_code }));

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setIsDialogOpen(true);
  };

  const openEdit = (row: ServiceCategoryAdminRow) => {
    setEditing(row);
    setForm({
      category_code: row.category_code,
      category_name_en: row.category_name_en,
      category_name_ar: row.category_name_ar ?? "",
      parent_category_id: row.parent_category_id,
      description: row.description ?? "",
      is_active: row.is_active,
      sort_order: row.sort_order,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.category_code || !form.category_name_en) {
      toast.error("Code and name are required");
      return;
    }
    setIsSubmitting(true);
    const payload = {
      category_code: form.category_code.toUpperCase(),
      category_name_en: form.category_name_en,
      category_name_ar: form.category_name_ar || null,
      parent_category_id: form.parent_category_id,
      description: form.description || null,
      is_active: form.is_active,
      sort_order: form.sort_order,
    };

    const result = editing
      ? await updateServiceCategory(editing.id, payload)
      : await createServiceCategory(payload);

    setIsSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Failed to save");
      return;
    }
    toast.success(editing ? "Category updated" : "Category created");
    setIsDialogOpen(false);
    router.refresh();
  };

  const handleToggle = async (row: ServiceCategoryAdminRow) => {
    const result = await updateServiceCategory(row.id, { is_active: !row.is_active });
    if (!result.success) {
      toast.error(result.error ?? "Failed to toggle");
      return;
    }
    toast.success(row.is_active ? "Deactivated" : "Activated");
    router.refresh();
  };

  const columns: ColumnDef<ServiceCategoryAdminRow>[] = [
    {accessorKey:"category_code",header:"Code",cell:({row:tableRow})=>{const row=tableRow.original;return <>{row.category_code}</>; }},
    {accessorKey:"category_name_en",header:"Name",cell:({row:tableRow})=>{const row=tableRow.original;return <>
                  <div>{row.category_name_en}</div>
                  {row.category_name_ar && <div className="text-xs text-muted-foreground">{row.category_name_ar}</div>}
                </>; }},
    {accessorKey:"parent_name",header:"Parent",cell:({row:tableRow})=>{const row=tableRow.original;return <>{row.parent_name ?? "—"}</>; }},
    {accessorKey:"is_active",header:"Status",cell:({row:tableRow})=>{const row=tableRow.original;return <>
                  <Badge className={row.is_active ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-muted text-muted-foreground"}>
                    {row.is_active ? "Active" : "Inactive"}
                  </Badge>
                </>; }},
    {accessorKey:"sort_order",header:"Order",cell:({row:tableRow})=>{const row=tableRow.original;return <>{row.sort_order}</>; }},
    ...(canManage ? [{id:"actions",header:"Actions",enableSorting:false,cell:({row:tableRow})=>{const row=tableRow.original;return <>
                    <div className="flex items-center gap-1 justify-end">
                      <Button aria-label="Edit record" size="icon" variant="ghost" onClick={() => openEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button aria-label={row.is_active ? "Deactivate record" : "Activate record"} size="icon" variant="ghost" onClick={() => handleToggle(row)}>
                        <Power className="h-4 w-4" />
                      </Button>
                    </div>
                  </>;}} satisfies ColumnDef<ServiceCategoryAdminRow>] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Party Service Categories</h2>
          <p className="text-sm text-muted-foreground">{rows.length} categories</p>
        </div>
        {canManage && (
          <Button onClick={openAdd} size="sm">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <ERPDataTable tableId="admin.service-categories" resultsLabel="service categories" data={rows} columns={columns} enableRowSelection={false} />
      </div>

      <ERPChildDialogForm
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={editing ? "Edit Category" : "Add Category"}
        subtitle="Define a service category for party assignment"
        icon={<Tags className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <RequiredLabel required>Code</RequiredLabel>
            <Input
              required aria-label="Code" name="category_code" value={form.category_code}
              onChange={(e) => setForm((f) => ({ ...f, category_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. CIVIL_WORKS"
              disabled={!!editing}
              className="font-mono"
            />
          </div>
          <div className="col-span-6">
            <Label>Sort Order</Label>
            <Input aria-label="Sort Order" type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className="col-span-6">
            <RequiredLabel required>Name (English)</RequiredLabel>
            <Input required aria-label="Name" name="category_name_en" value={form.category_name_en} onChange={(e) => setForm((f) => ({ ...f, category_name_en: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Name (Arabic)</Label>
            <Input aria-label="Name (Arabic)" value={form.category_name_ar} onChange={(e) => setForm((f) => ({ ...f, category_name_ar: e.target.value }))} dir="rtl" />
          </div>
          <div className="col-span-12">
            <Label>Parent Category</Label>
            <ERPCombobox ariaLabel="Parent Category"
              value={form.parent_category_id}
              onValueChange={(v) => setForm((f) => ({ ...f, parent_category_id: v !== null ? Number(v) : null }))}
              options={parentOptions}
              placeholder="No parent (root category)"
              allowClear
              showCode
            />
          </div>
          <div className="col-span-12">
            <Label>Description</Label>
            <Textarea aria-label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          </div>
          <div className="col-span-6 flex items-center gap-3">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            <Label>Active</Label>
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
