"use client";

import { useState, useCallback, useTransition } from "react";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Search, Pencil, ToggleLeft, Settings2 } from "lucide-react";
import type { HrSettingsRow } from "@/server/actions/hr/settings";
import type { ActionResult } from "@/server/actions/hr/settings";
import { toast } from "sonner";

type LookupRecord = HrSettingsRow;

type Props = {
  title: string;
  description: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
  initialData: LookupRecord[];
  canManage: boolean;
  onList: (params: { search?: string; is_active?: boolean }) => Promise<ActionResult<{ data: LookupRecord[]; total: number }>>;
  onCreate: (input: { code: string; name_en: string; name_ar?: string | null; description?: string | null; is_active: boolean; sort_order: number }) => Promise<ActionResult<{ id: number }>>;
  onUpdate: (id: number, input: Partial<{ code: string; name_en: string; name_ar?: string | null; description?: string | null; is_active: boolean; sort_order: number }>) => Promise<ActionResult>;
  onToggle?: (id: number, is_active: boolean) => Promise<ActionResult>;
};

type FormState = {
  code: string;
  name_en: string;
  name_ar: string;
  description: string;
  is_active: boolean;
  sort_order: string;
};

const blank: FormState = { code: "", name_en: "", name_ar: "", description: "", is_active: true, sort_order: "0" };

export function HrSettingsLookupPage({
  title,
  description,
  breadcrumbs,
  initialData,
  canManage,
  onList,
  onCreate,
  onUpdate,
  onToggle,
}: Props) {
  const [rows, setRows] = useState<LookupRecord[]>(initialData);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LookupRecord | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback((s?: string) => {
    startTransition(async () => {
      const searchTerm = s !== undefined ? s : search;
      const res = await onList({ search: searchTerm || undefined });
      if (res.success && res.data) setRows(res.data.data);
    });
  }, [onList, search]);

  const handleSearch = (v: string) => {
    setSearch(v);
    refresh(v);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(blank);
    setDialogOpen(true);
  };

  const openEdit = (row: LookupRecord) => {
    setEditing(row);
    setForm({
      code: row.code,
      name_en: row.name_en,
      name_ar: row.name_ar ?? "",
      description: row.description ?? "",
      is_active: row.is_active,
      sort_order: String(row.sort_order),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name_en.trim()) { toast.error("Name (English) is required"); return; }
    if (!form.code.trim()) { toast.error("Code is required"); return; }
    setIsSubmitting(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name_en: form.name_en.trim(),
        name_ar: form.name_ar.trim() || null,
        description: form.description.trim() || null,
        is_active: form.is_active,
        sort_order: parseInt(form.sort_order, 10) || 0,
      };
      const res = editing
        ? await onUpdate(editing.id, payload)
        : await onCreate(payload);
      if (res.success) {
        toast.success(editing ? "Updated successfully" : "Created successfully");
        setDialogOpen(false);
        refresh();
      } else {
        toast.error(res.error ?? "An error occurred");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (row: LookupRecord) => {
    if (!onToggle) return;
    const res = await onToggle(row.id, !row.is_active);
    if (res.success) {
      toast.success(!row.is_active ? "Activated" : "Deactivated");
      refresh();
    } else {
      toast.error(res.error ?? "Failed to toggle status");
    }
  };

  const f = (k: keyof FormState, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        actions={canManage ? (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        ) : null}
      />

      <ERPSectionCard
        title="Records"
        description={`${rows.length} item${rows.length !== 1 ? "s" : ""}`}
        noPadding
        actions={
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search..."
              className="h-8 pl-7 text-xs"
            />
          </div>
        }
      >
        {rows.length === 0 ? (
          <ERPEmptyState icon={Settings2} title={`No ${title.toLowerCase()} yet`} description={canManage ? "Click Add to create the first entry." : "No records found."} />
        ) : (
          <div className="divide-y">
            {rows.map(row => (
              <div key={row.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{row.name_en}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{row.code}</Badge>
                    {!row.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                  </div>
                  {row.name_ar && <p className="text-xs text-muted-foreground" dir="rtl">{row.name_ar}</p>}
                  {row.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{row.description}</p>}
                </div>
                {canManage && (
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    {onToggle && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleToggle(row)}>
                        <ToggleLeft className="h-3.5 w-3.5 mr-1" />
                        {row.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(row)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ERPSectionCard>

      {isPending && <p className="text-xs text-muted-foreground text-center">Loading...</p>}

      {canManage && (
        <ERPChildDialogForm
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={editing ? `Edit ${title.replace(/s$/, "")}` : `Add ${title.replace(/s$/, "")}`}
          subtitle={editing ? "Update the record details below" : "Enter details to create a new record"}
          mode={editing ? "edit" : "add"}
          size="md"
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
        >
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-4">
              <Label className="text-xs font-medium mb-1 block">Code <span className="text-destructive">*</span></Label>
              <Input
                value={form.code}
                onChange={e => f("code", e.target.value.toUpperCase())}
                placeholder="e.g. STAFF"
                className="uppercase"
                maxLength={50}
              />
            </div>
            <div className="col-span-8">
              <Label className="text-xs font-medium mb-1 block">Name (English) <span className="text-destructive">*</span></Label>
              <Input value={form.name_en} onChange={e => f("name_en", e.target.value)} placeholder="Enter English name" maxLength={200} />
            </div>
            <div className="col-span-12">
              <Label className="text-xs font-medium mb-1 block">Name (Arabic)</Label>
              <Input value={form.name_ar} onChange={e => f("name_ar", e.target.value)} placeholder="Enter Arabic name" dir="rtl" maxLength={200} />
            </div>
            <div className="col-span-9">
              <Label className="text-xs font-medium mb-1 block">Description</Label>
              <Input value={form.description} onChange={e => f("description", e.target.value)} placeholder="Optional description" maxLength={1000} />
            </div>
            <div className="col-span-3">
              <Label className="text-xs font-medium mb-1 block">Sort Order</Label>
              <Input type="number" value={form.sort_order} onChange={e => f("sort_order", e.target.value)} min={0} max={9999} />
            </div>
            <div className="col-span-12 flex items-center gap-3">
              <Switch id="is_active" checked={form.is_active} onCheckedChange={v => f("is_active", v)} />
              <Label htmlFor="is_active" className="text-sm cursor-pointer">Active</Label>
            </div>
          </div>
        </ERPChildDialogForm>
      )}
    </div>
  );
}
