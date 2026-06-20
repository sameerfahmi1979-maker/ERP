"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Building } from "lucide-react";
import { toast } from "sonner";
import { useOwnerCompaniesQuery } from "@/hooks/lookups/use-org-queries";
import { useEmiratesQuery } from "@/hooks/lookups/use-geography-queries";
import type {
  createHrMohreEstablishment,
  updateHrMohreEstablishment,
  listHrMohreEstablishments,
  ActionResult,
} from "@/server/actions/hr/settings";

type ListResult = Awaited<ReturnType<typeof listHrMohreEstablishments>>;
type MohreRow = NonNullable<NonNullable<ListResult["data"]>["data"]>[number];

type FormState = {
  owner_company_id: number | null;
  establishment_number: string;
  establishment_name: string;
  emirate_id: number | null;
  status: "active" | "inactive";
};

const blank: FormState = {
  owner_company_id: null,
  establishment_number: "",
  establishment_name: "",
  emirate_id: null,
  status: "active",
};

type Props = {
  initialData: MohreRow[];
  canManage: boolean;
  onCreate: (input: Parameters<typeof createHrMohreEstablishment>[0]) => Promise<ActionResult<{ id: number }>>;
  onUpdate: (id: number, input: Parameters<typeof updateHrMohreEstablishment>[1]) => Promise<ActionResult>;
};

export function HrMohreEstablishmentsPage({ initialData, canManage, onCreate, onUpdate }: Props) {
  const router = useRouter();
  const rows = initialData;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MohreRow | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  const { options: companyOptions } = useOwnerCompaniesQuery();
  const { options: emirateOptions } = useEmiratesQuery();

  function openAdd() {
    setEditing(null);
    setForm(blank);
    setDialogOpen(true);
  }

  function openEdit(row: MohreRow) {
    setEditing(row);
    setForm({
      owner_company_id: row.owner_company_id ?? null,
      establishment_number: row.establishment_number ?? "",
      establishment_name: row.establishment_name ?? "",
      emirate_id: row.emirate_id ?? null,
      status: (row.status as "active" | "inactive") ?? "active",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.owner_company_id) { toast.error("Please select a company"); return; }
    if (!form.establishment_number.trim()) { toast.error("Establishment number is required"); return; }
    if (!form.establishment_name.trim()) { toast.error("Establishment name is required"); return; }

    setIsSubmitting(true);
    startTransition(async () => {
      try {
        const payload = {
          owner_company_id: form.owner_company_id!,
          establishment_number: form.establishment_number.trim(),
          establishment_name: form.establishment_name.trim(),
          emirate_id: form.emirate_id,
          status: form.status,
        };

        const result = editing
          ? await onUpdate(editing.id, payload)
          : await onCreate(payload);

        if (!result.success) { toast.error(result.error); return; }
        toast.success(editing ? "Establishment updated" : "Establishment created");
        setDialogOpen(false);
        router.refresh();
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="MOHRE Establishments"
        description="Ministry of Human Resources & Emiratisation registered establishment numbers per company"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "HR Settings", href: "/admin/hr/settings" },
          { label: "MOHRE Establishments" },
        ]}
        actions={canManage ? (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add Establishment
          </Button>
        ) : undefined}
      />

      <ERPSectionCard
        title="Registered Establishments"
        description={`${rows.length} establishment${rows.length !== 1 ? "s" : ""}`}
        noPadding
      >
        {rows.length === 0 ? (
          <ERPEmptyState
            icon={Building}
            title="No MOHRE establishments configured"
            description={canManage
              ? "Click 'Add Establishment' above to register your first MOHRE establishment number."
              : "Contact your HR administrator to configure MOHRE establishment numbers."}
            actionLabel={canManage ? "Add Establishment" : undefined}
            onAction={canManage ? openAdd : undefined}
          />
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{row.establishment_name}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {row.establishment_number}
                    </Badge>
                    <Badge
                      variant={row.status === "active" ? "secondary" : "destructive"}
                      className="text-[10px]"
                    >
                      {row.status}
                    </Badge>
                  </div>
                  {row.owner_company && (
                    <p className="text-xs text-muted-foreground">
                      {(row.owner_company as { legal_name_en: string }).legal_name_en}
                    </p>
                  )}
                </div>
                {canManage && (
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(row)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </ERPSectionCard>

      {/* Add / Edit Dialog */}
      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit MOHRE Establishment" : "Add MOHRE Establishment"}
        subtitle="Enter MOHRE (Ministry of Human Resources) registered establishment details"
        icon={<Building className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">

          {/* Company */}
          <div className="col-span-12">
            <Label>Company <span className="text-destructive">*</span></Label>
            <ERPCombobox
              value={form.owner_company_id}
              onValueChange={(v) => setForm((f) => ({ ...f, owner_company_id: v ? Number(v) : null }))}
              options={companyOptions}
              placeholder="Select company..."
              required
            />
          </div>

          {/* Establishment Number */}
          <div className="col-span-6">
            <Label>MOHRE Establishment Number <span className="text-destructive">*</span></Label>
            <Input
              value={form.establishment_number}
              onChange={(e) => setForm((f) => ({ ...f, establishment_number: e.target.value }))}
              placeholder="e.g. 12345678"
              maxLength={100}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              The official number from the MOHRE portal
            </p>
          </div>

          {/* Status */}
          <div className="col-span-6">
            <Label>Status</Label>
            <ERPCombobox
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: (v as "active" | "inactive") || "active" }))}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
              placeholder="Select status..."
            />
          </div>

          {/* Establishment Name */}
          <div className="col-span-12">
            <Label>Establishment Name <span className="text-destructive">*</span></Label>
            <Input
              value={form.establishment_name}
              onChange={(e) => setForm((f) => ({ ...f, establishment_name: e.target.value }))}
              placeholder="e.g. Alliance Group Tech LLC"
              maxLength={200}
            />
          </div>

          {/* Emirate */}
          <div className="col-span-12">
            <Label>Emirate (Optional)</Label>
            <ERPCombobox
              value={form.emirate_id}
              onValueChange={(v) => setForm((f) => ({ ...f, emirate_id: v ? Number(v) : null }))}
              options={emirateOptions}
              placeholder="Select emirate..."
            />
          </div>

        </div>
      </ERPChildDialogForm>
    </div>
  );
}
