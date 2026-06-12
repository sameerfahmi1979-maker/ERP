"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { CostCenter } from "@/features/master-data/finance-basics/types";
import { createCostCenter, updateCostCenter } from "@/features/master-data/finance-basics/actions";
import { LookupSelect } from "@/components/erp/lookup-select";
import { CostCenterSelect } from "@/components/erp/finance-basics";
import { OwnerCompanySelect, BranchSelect } from "@/components/erp/organizations";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateCostCenters } from "@/lib/query/invalidation";
import { ERPFormFooter } from "@/components/erp/erp-form-footer";
import {
  ERPDrawerForm,
  ERPDrawerSectionNav,
  ERPDrawerBody,
  ERPDrawerSection,
  ERPFieldGrid,
} from "@/components/erp/erp-drawer-form";
import { Target, Building2, Shield, Info } from "lucide-react";

type CostCenterFormDialogProps = {
  costCenter?: CostCenter | null;
  mode: "add" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CostCenterFormDialog(props: CostCenterFormDialogProps) {
  if (!props.open) return null;
  return (
    <CostCenterFormDialogInner
      key={`${props.mode}-${props.costCenter?.id ?? "new"}`}
      {...props}
    />
  );
}

function CostCenterFormDialogInner({
  costCenter,
  mode,
  open,
  onOpenChange,
}: CostCenterFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const [typeCode, setTypeCode] = useState<string | null>(costCenter?.cost_center_type_code ?? null);
  const [parentId, setParentId] = useState<number | null>(costCenter?.parent_cost_center_id ?? null);
  const [ownerCompanyId, setOwnerCompanyId] = useState<number | null>(costCenter?.owner_company_id ?? null);
  const [branchId, setBranchId] = useState<number | null>(costCenter?.branch_id ?? null);
  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const queryClient = useQueryClient();
  // Dirty state tracking for Safe Close
  const { isDirty, resetDirty } = useFormDirty({
    formId: "drawer-form",
    enabled: !isViewing,
  });

  const sections = [
    { id: "basic", label: "Basic Info", icon: Target },
    { id: "org", label: "Organization", icon: Building2 },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleSave = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (isViewing) return;

    const form = document.getElementById("drawer-form") as HTMLFormElement;
    const formData = new FormData(form);

    setIsSubmitting(true);
    try {
      const shared = {
        cost_center_name_en: formData.get("cost_center_name_en") as string,
        cost_center_name_ar: (formData.get("cost_center_name_ar") as string) || null,
        cost_center_type_code: typeCode,
        parent_cost_center_id: parentId,
        owner_company_id: ownerCompanyId,
        branch_id: branchId,
        description_en: (formData.get("description_en") as string) || null,
        description_ar: (formData.get("description_ar") as string) || null,
        notes: (formData.get("notes") as string) || null,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };

      let result;
      if (isEditing && costCenter) {
        result = await updateCostCenter({ id: costCenter.id, ...shared, is_active: formData.get("is_active") === "on" });
      } else {
        result = await createCostCenter({
          cost_center_code: (formData.get("cost_center_code") as string).toUpperCase(),
          ...shared,
        });
      }

      if (result.success) {
        toast.success(`Cost center ${isEditing ? "updated" : "created"} successfully`);
        resetDirty();
        invalidateCostCenters(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save cost center");
        return false;
      }
    } catch (error) {
      console.error("Form submission error", error);
      toast.error("An unexpected error occurred");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndClose = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    const success = await handleSave();
    if (success) {
      onOpenChange(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await handleSaveAndClose();
  };

  return (
    <ERPDrawerForm
      open={open}
      onOpenChange={onOpenChange}
      title={isViewing ? "View Cost Center" : isEditing ? "Edit Cost Center" : "Add Cost Center"}
      subtitle={costCenter ? `Cost Center: ${costCenter.cost_center_name_en} (${costCenter.cost_center_code})` : "Create a new cost center"}
      recordNumber={costCenter?.cost_center_code}
      mode={isViewing ? "view" : isEditing ? "edit" : "add"}
      isDirty={isDirty}
    >
      <form id="drawer-form" onSubmit={handleSubmit} className="flex flex-1 overflow-hidden h-full">
        <ERPDrawerSectionNav sections={sections} activeSection={activeSection} setActiveSection={setActiveSection} />
        <div className="flex-grow flex flex-col justify-between overflow-hidden">
          <ERPDrawerBody>
            <ERPDrawerSection id="basic" activeId={activeSection} title="Basic Information">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="cost_center_code">Cost Center Code</RequiredLabel>
                  <Input id="cost_center_code" name="cost_center_code" required defaultValue={costCenter?.cost_center_code} disabled={isViewing || isEditing} className="uppercase" />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label className="text-muted-foreground text-xs">Cost Center Type</Label>
                  <LookupSelect
                    categoryCode="COST_CENTER_TYPES"
                    value={typeCode}
                    onValueChange={(v) => setTypeCode(v ? String(v) : null)}
                    valueField="code"
                    showCode
                    disabled={isViewing}
                    allowClear
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <RequiredLabel htmlFor="cost_center_name_en">English Name</RequiredLabel>
                  <Input id="cost_center_name_en" name="cost_center_name_en" required defaultValue={costCenter?.cost_center_name_en} disabled={isViewing} />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="cost_center_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
                  <Input id="cost_center_name_ar" name="cost_center_name_ar" defaultValue={costCenter?.cost_center_name_ar ?? ""} disabled={isViewing} dir="rtl" />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label className="text-muted-foreground text-xs">Parent Cost Center</Label>
                  <CostCenterSelect
                    value={parentId}
                    onValueChange={setParentId}
                    ownerCompanyId={ownerCompanyId}
                    excludeId={costCenter?.id}
                    disabled={isViewing}
                    allowClear
                    showCode
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
                  <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={costCenter?.sort_order ?? 0} disabled={isViewing} />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="org" activeId={activeSection} title="Organization Scope">
              <ERPFieldGrid>
                <div className="space-y-2 col-span-6">
                  <Label className="text-muted-foreground text-xs">Owner Company</Label>
                  <OwnerCompanySelect
                    value={ownerCompanyId}
                    onValueChange={setOwnerCompanyId}
                    disabled={isViewing}
                    allowClear
                    showCode
                    placeholder="Leave empty for global"
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label className="text-muted-foreground text-xs">Branch</Label>
                  <BranchSelect
                    value={branchId}
                    onValueChange={setBranchId}
                    ownerCompanyId={ownerCompanyId}
                    disabled={isViewing}
                    allowClear
                    showCode
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="description_en" className="text-muted-foreground text-xs">Description (EN)</Label>
                  <Textarea id="description_en" name="description_en" defaultValue={costCenter?.description_en ?? ""} disabled={isViewing} rows={2} />
                </div>
                <div className="space-y-2 col-span-6">
                  <Label htmlFor="description_ar" className="text-muted-foreground text-xs">Description (AR)</Label>
                  <Textarea id="description_ar" name="description_ar" defaultValue={costCenter?.description_ar ?? ""} disabled={isViewing} dir="rtl" rows={2} />
                </div>
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="status" activeId={activeSection} title="Status">
              <ERPFieldGrid>
                {(isEditing || isViewing) && (
                  <div className="space-y-2 col-span-6">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="is_active" name="is_active" defaultChecked={costCenter?.is_active ?? true} disabled={isViewing} />
                      <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                    </div>
                  </div>
                )}
              </ERPFieldGrid>
            </ERPDrawerSection>

            <ERPDrawerSection id="audit" activeId={activeSection} title="Audit Information" lazyMount>
              {costCenter ? (
                <ERPFieldGrid>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Created At</Label>
                    <Input value={new Date(costCenter.created_at).toLocaleString()} disabled className="text-xs" />
                  </div>
                  <div className="space-y-2 col-span-6">
                    <Label className="text-muted-foreground text-xs">Updated At</Label>
                    <Input value={new Date(costCenter.updated_at).toLocaleString()} disabled className="text-xs" />
                  </div>
                </ERPFieldGrid>
              ) : (
                <div className="text-sm text-muted-foreground">Audit information will be available after saving</div>
              )}
            </ERPDrawerSection>
          </ERPDrawerBody>
          <ERPFormFooter
            mode={mode}
            onSave={handleSave}
            onSaveAndClose={handleSaveAndClose}
            onCancel={() => onOpenChange(false)}
            isSubmitting={isSubmitting}
            hasUnsavedChanges={isDirty}
          />
        </div>
      </form>
    </ERPDrawerForm>
  );
}
