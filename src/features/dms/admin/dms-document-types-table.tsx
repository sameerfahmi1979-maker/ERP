"use client";

import { useMemo, useState } from "react";
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
import { SortColHeader } from "@/components/erp/table/sort-col-header";
import { TablePagination } from "@/components/erp/table/table-pagination";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { FileType2, PlusCircle, Pencil, Power, Copy, Info } from "lucide-react";
import { toast } from "sonner";
import {
  createDmsDocumentType,
  updateDmsDocumentType,
  activateDmsDocumentType,
  deactivateDmsDocumentType,
  duplicateDmsDocumentType,
  type DmsDocumentTypeRow,
} from "@/server/actions/dms/document-types";
import {
  ALLOWED_CONFIDENTIALITY,
  ALLOWED_ENTITY_TYPES,
  PARTY_DOC_TYPE_CODES,
} from "@/features/dms/admin/dms-constants";
import type { DmsCategoryRow } from "@/server/actions/dms/categories";
import type { AuthContext } from "@/lib/rbac/check";

type Props = {
  rows: DmsDocumentTypeRow[];
  categories: DmsCategoryRow[];
  authContext: AuthContext;
};

type FormState = {
  type_code: string;
  name_en: string;
  name_ar: string;
  description: string;
  category_id: string;
  requires_expiry_tracking: boolean;
  is_renewable: boolean;
  default_confidentiality: string;
  requires_approval: boolean;
  default_retention_days: string;
  allowed_entity_types: string[];
  is_active: boolean;
  sort_order: number;
};

const emptyForm: FormState = {
  type_code: "",
  name_en: "",
  name_ar: "",
  description: "",
  category_id: "",
  requires_expiry_tracking: false,
  is_renewable: true,
  default_confidentiality: "internal",
  requires_approval: false,
  default_retention_days: "",
  allowed_entity_types: [],
  is_active: true,
  sort_order: 0,
};

const CONFIDENTIALITY_LABELS: Record<string, { label: string; color: string }> = {
  internal: { label: "Internal", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  company: { label: "Company", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  hr: { label: "HR", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  finance: { label: "Finance", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  legal: { label: "Legal", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
  executive: { label: "Executive", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

function canManage(ctx: AuthContext) {
  return (
    ctx.permissionCodes?.includes("dms.documents.manage_types") ||
    ctx.permissionCodes?.includes("dms.admin") ||
    ctx.roleCodes?.includes("system_admin") ||
    ctx.roleCodes?.includes("group_admin")
  );
}

export function DmsDocumentTypesTable({ rows, categories, authContext }: Props) {
  const router = useRouter();
  const manage = canManage(authContext);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DmsDocumentTypeRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSystem, setFilterSystem] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (row: DmsDocumentTypeRow) => {
    setEditing(row);
    setForm({
      type_code: row.type_code,
      name_en: row.name_en,
      name_ar: row.name_ar ?? "",
      description: row.description ?? "",
            category_id: row.category_id != null ? String(row.category_id) : "",
      requires_expiry_tracking: row.requires_expiry_tracking,
      is_renewable: row.is_renewable,
      default_confidentiality: row.default_confidentiality,
      requires_approval: row.requires_approval,
      default_retention_days: row.default_retention_days ? String(row.default_retention_days) : "",
      allowed_entity_types: row.allowed_entity_types ?? [],
      is_active: row.is_active,
      sort_order: row.sort_order,
    });
    setDialogOpen(true);
  };

  const toggleEntityType = (et: string) => {
    setForm((f) => ({
      ...f,
      allowed_entity_types: f.allowed_entity_types.includes(et)
        ? f.allowed_entity_types.filter((x) => x !== et)
        : [...f.allowed_entity_types, et],
    }));
  };

  const handleSubmit = async () => {
    if (!form.type_code || !form.name_en) {
      toast.error("Code and English name are required");
      return;
    }
    const retDays = form.default_retention_days ? parseInt(form.default_retention_days) : null;
    if (form.default_retention_days && (isNaN(retDays!) || retDays! <= 0)) {
      toast.error("Default retention days must be a positive number");
      return;
    }
    setIsSubmitting(true);
    const payload = {
      type_code: form.type_code.toUpperCase(),
      name_en: form.name_en,
      name_ar: form.name_ar || null,
      description: form.description || null,
      category_id: form.category_id ? parseInt(form.category_id) : null,
      requires_expiry_tracking: form.requires_expiry_tracking,
      is_renewable: form.is_renewable,
      default_confidentiality: form.default_confidentiality as typeof ALLOWED_CONFIDENTIALITY[number],
      requires_approval: form.requires_approval,
      default_retention_days: retDays,
      allowed_entity_types: form.allowed_entity_types as typeof ALLOWED_ENTITY_TYPES[number][],
      is_active: form.is_active,
      sort_order: form.sort_order,
    };
    const result = editing
      ? await updateDmsDocumentType(editing.id, payload)
      : await createDmsDocumentType(payload);
    setIsSubmitting(false);
    if (!result.success) { toast.error(result.error ?? "Failed to save"); return; }
    toast.success(editing ? "Document type updated" : "Document type created");
    setDialogOpen(false);
    router.refresh();
  };

  const handleToggle = async (row: DmsDocumentTypeRow) => {
    const result = row.is_active ? await deactivateDmsDocumentType(row.id) : await activateDmsDocumentType(row.id);
    if (!result.success) { toast.error(result.error ?? "Failed"); return; }
    toast.success(row.is_active ? "Type deactivated" : "Type activated");
    router.refresh();
  };

  const handleDuplicate = async (row: DmsDocumentTypeRow) => {
    const result = await duplicateDmsDocumentType(row.id);
    if (!result.success) { toast.error(result.error ?? "Failed to duplicate"); return; }
    toast.success(`Duplicated as ${result.data?.type_code}`);
    router.refresh();
  };

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (filterCategory !== "all" && String(row.category_id) !== filterCategory) return false;
    if (filterStatus === "active" && !row.is_active) return false;
    if (filterStatus === "inactive" && row.is_active) return false;
    if (filterSystem === "system" && !row.is_system) return false;
    if (filterSystem === "custom" && row.is_system) return false;
    if (searchText && !row.type_code.toLowerCase().includes(searchText.toLowerCase()) && !row.name_en.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  }), [rows, filterCategory, filterStatus, filterSystem, searchText]);

  const table = useSortPaginate(filteredRows, {
    defaultSortKey: "sort_order",
    defaultSortDir: "asc",
    defaultPageSize: 25,
    comparators: {
      metadata_defs: (a, b) => (a.metadata_defs?.length ?? 0) - (b.metadata_defs?.length ?? 0),
      category: (a, b) => (a.category?.name_en ?? "").localeCompare(b.category?.name_en ?? ""),
    },
  });

  return (
    <div className="space-y-4">


      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search by code or name..."
          className="h-8 w-52 text-xs"
        />
        <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v ?? "all")}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name_en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "all")}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSystem} onValueChange={(v) => setFilterSystem(v ?? "all")}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="system">System only</SelectItem>
            <SelectItem value="custom">Custom only</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground ml-auto">
          {filteredRows.length} of {rows.length} types
        </p>

        {manage && (
          <Button onClick={openAdd} size="sm">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Type
          </Button>
        )}
      </div>

      <div className="rounded-md border overflow-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-muted/50 border-b">
            <tr>
              <SortColHeader field="type_code" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort}>Code</SortColHeader>
              <SortColHeader field="name_en" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort}>Name</SortColHeader>
              <SortColHeader field="category" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort}>Category</SortColHeader>
              <SortColHeader field="requires_expiry_tracking" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} align="center">Expiry</SortColHeader>
              <SortColHeader field="default_confidentiality" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} align="center">Confidentiality</SortColHeader>
              <SortColHeader field="metadata_defs" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} align="center">Fields</SortColHeader>
              <SortColHeader field="is_system" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} align="center">Type</SortColHeader>
              <SortColHeader field="is_active" sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} align="center">Status</SortColHeader>
              {manage && <th className="px-4 py-2.5 w-28" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {table.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">No document types found</td>
              </tr>
            )}
            {table.rows.map((row) => {
              const conf = CONFIDENTIALITY_LABELS[row.default_confidentiality] ?? { label: row.default_confidentiality, color: "bg-gray-100 text-gray-600" };
              const metaCount = row.metadata_defs?.length ?? 0;
              const isPartyType = PARTY_DOC_TYPE_CODES.has(row.type_code);
              return (
                <tr key={row.id} className="hover:bg-muted/25 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-medium">{row.type_code}</span>
                      {isPartyType && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-400 text-amber-600">Party</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-sm font-medium">{row.name_en}</div>
                    {row.name_ar && <div className="text-xs text-muted-foreground" dir="rtl">{row.name_ar}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {row.category?.name_en ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {row.requires_expiry_tracking ? (
                        <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px] px-1.5 py-0">Expiry</Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                      {!row.is_renewable && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-slate-400 text-slate-500" title="One-time document — renewal actions are hidden for this type">
                          One-time
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge className={`text-[10px] px-1.5 py-0 ${conf.color}`}>{conf.label}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-muted-foreground font-medium">
                    {metaCount > 0 ? metaCount : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {row.is_system ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">System</Badge>
                    ) : (
                      <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-[10px] px-1.5 py-0">Custom</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge className={`text-[10px] px-1.5 py-0 ${row.is_active ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                      {row.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  {manage && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-0.5 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleToggle(row)} title={row.is_active ? "Deactivate" : "Activate"}>
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDuplicate(row)} title="Duplicate as Custom">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
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
        title={editing ? "Edit Document Type" : "Add Document Type"}
        subtitle="Define a DMS document type with classification and AI settings"
        icon={<FileType2 className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="lg"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-5">
            <RequiredLabel required>Type Code</RequiredLabel>
            <Input
              value={form.type_code}
              onChange={(e) => setForm((f) => ({ ...f, type_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. TRADE_LICENSE"
              disabled={!!editing && editing.is_system}
              className="font-mono"
            />
            {editing?.is_system && (
              <p className="text-[10px] text-muted-foreground mt-1">System type codes cannot be changed</p>
            )}
          </div>
          <div className="col-span-4">
            <Label>Category</Label>
            <Select value={form.category_id} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v ?? "" }))}>
              <SelectTrigger>
                <span className="truncate text-sm">
                  {form.category_id
                    ? (categories.find((c) => String(c.id) === form.category_id)?.name_en ?? "Select category")
                    : <span className="text-muted-foreground">Select category</span>}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name_en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div className="col-span-6">
            <RequiredLabel required>Name (English)</RequiredLabel>
            <Input
              value={form.name_en}
              onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
              placeholder="e.g. Trade License"
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
          <div className="col-span-6">
            <RequiredLabel required>Default Confidentiality</RequiredLabel>
            <Select value={form.default_confidentiality} onValueChange={(v) => setForm((f) => ({ ...f, default_confidentiality: v ?? "internal" }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLOWED_CONFIDENTIALITY.map((c) => (
                  <SelectItem key={c} value={c}>{CONFIDENTIALITY_LABELS[c]?.label ?? c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-6">
            <Label>Default Retention (Days)</Label>
            <Input
              type="number"
              value={form.default_retention_days}
              onChange={(e) => setForm((f) => ({ ...f, default_retention_days: e.target.value }))}
              placeholder="e.g. 2555 (7 years)"
              min={1}
            />
          </div>
          <div className="col-span-12">
            <Label className="mb-2 block">Allowed Entity Types</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {ALLOWED_ENTITY_TYPES.map((et) => (
                <label key={et} className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={form.allowed_entity_types.includes(et)}
                    onChange={() => toggleEntityType(et)}
                    className="rounded border-border"
                  />
                  <span className="font-mono">{et}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="col-span-12 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.requires_expiry_tracking} onCheckedChange={(v) => setForm((f) => ({ ...f, requires_expiry_tracking: v }))} />
              <Label>Requires Expiry Tracking</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_renewable} onCheckedChange={(v) => setForm((f) => ({ ...f, is_renewable: v }))} />
              <Label>Renewable</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.requires_approval} onCheckedChange={(v) => setForm((f) => ({ ...f, requires_approval: v }))} />
              <Label>Requires Approval</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              <Label>Active</Label>
            </div>
          </div>
          {!form.is_renewable && (
            <div className="col-span-12 flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 border border-border rounded-md p-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p>
                Documents of this type are treated as one-time (e.g. Visit Visa). The &quot;Start Renewal&quot; / &quot;Renew&quot;
                actions will be hidden everywhere for these documents — a brand new document must be uploaded instead.
              </p>
            </div>
          )}
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
