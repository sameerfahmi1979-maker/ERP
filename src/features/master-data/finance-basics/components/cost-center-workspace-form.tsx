"use client";

import { useState, useEffect } from "react";
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
import { Target, Building2, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type CostCenterWorkspaceFormProps = {
  costCenter?: CostCenter | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "cost-center-workspace-form";

export function CostCenterWorkspaceForm({ costCenter, mode }: CostCenterWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty } = useWorkspace();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const [typeCode, setTypeCode] = useState<string | null>(() =>
    getDraftDefault("cost_center_type_code", costCenter?.cost_center_type_code ?? "") || null
  );
  const [parentId, setParentId] = useState<number | null>(() => {
    const d = getDraftDefault("parent_cost_center_id", "");
    return d ? Number(d) : costCenter?.parent_cost_center_id ?? null;
  });
  const [ownerCompanyId, setOwnerCompanyId] = useState<number | null>(() => {
    const d = getDraftDefault("owner_company_id", "");
    return d ? Number(d) : costCenter?.owner_company_id ?? null;
  });
  const [branchId, setBranchId] = useState<number | null>(() => {
    const d = getDraftDefault("branch_id", "");
    return d ? Number(d) : costCenter?.branch_id ?? null;
  });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: Target },
    { id: "org", label: "Organization", icon: Building2 },
    { id: "status", label: "Status", icon: Shield },
    { id: "audit", label: "Audit Info", icon: Info },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
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
        result = await createCostCenter({ cost_center_code: (formData.get("cost_center_code") as string).toUpperCase(), ...shared });
      }
      if (result.success) {
        toast.success(`Cost center ${isEditing ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();
        invalidateCostCenters(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save cost center");
        return false;
      }
    } catch {
      toast.error("An unexpected error occurred");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndClose = async () => {
    const success = await handleSave();
    if (success) handleRequestClose();
  };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Cost Center" : isEditing ? "Edit Cost Center" : "New Cost Center"}
      subtitle={costCenter ? `${costCenter.cost_center_name_en} (${costCenter.cost_center_code})` : "Create a new cost center"}
      recordCode={costCenter?.cost_center_code}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={isDirty}
      onSave={isViewing ? undefined : handleSave}
      onSaveAndClose={isViewing ? undefined : handleSaveAndClose}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
    >
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); handleSaveAndClose(); }} onInput={syncDraft} onChange={syncDraft}>
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Basic Information">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="cost_center_code">Cost Center Code</RequiredLabel>
              <Input id="cost_center_code" name="cost_center_code" required defaultValue={getDraftDefault("cost_center_code", costCenter?.cost_center_code ?? "")} disabled={isViewing || isEditing} className="uppercase" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Cost Center Type</Label>
              <LookupSelect categoryCode="COST_CENTER_TYPES" value={typeCode} onValueChange={(v) => { const s = v ? String(v) : null; setTypeCode(s); writeDraftField("cost_center_type_code", s ?? ""); }} valueField="code" showCode disabled={isViewing} allowClear />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="cost_center_name_en">English Name</RequiredLabel>
              <Input id="cost_center_name_en" name="cost_center_name_en" required defaultValue={getDraftDefault("cost_center_name_en", costCenter?.cost_center_name_en ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="cost_center_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input id="cost_center_name_ar" name="cost_center_name_ar" defaultValue={getDraftDefault("cost_center_name_ar", costCenter?.cost_center_name_ar ?? "")} disabled={isViewing} dir="rtl" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Parent Cost Center</Label>
              <CostCenterSelect value={parentId} onValueChange={(v) => { setParentId(v); writeDraftField("parent_cost_center_id", v ?? ""); }} ownerCompanyId={ownerCompanyId} excludeId={costCenter?.id} disabled={isViewing} allowClear showCode />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", costCenter?.sort_order ?? 0)} disabled={isViewing} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="org" activeId={activeSection} title="Organization Scope">
          <div className="grid grid-cols-12 gap-4">
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Owner Company</Label>
              <OwnerCompanySelect value={ownerCompanyId} onValueChange={(v) => { setOwnerCompanyId(v); writeDraftField("owner_company_id", v ?? ""); }} disabled={isViewing} allowClear showCode placeholder="Leave empty for global" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Branch</Label>
              <BranchSelect value={branchId} onValueChange={(v) => { setBranchId(v); writeDraftField("branch_id", v ?? ""); }} ownerCompanyId={ownerCompanyId} disabled={isViewing} allowClear showCode placeholder="Optional" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="description_en" className="text-muted-foreground text-xs">Description (EN)</Label>
              <Textarea id="description_en" name="description_en" defaultValue={getDraftDefault("description_en", costCenter?.description_en ?? "")} disabled={isViewing} rows={2} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="description_ar" className="text-muted-foreground text-xs">Description (AR)</Label>
              <Textarea id="description_ar" name="description_ar" defaultValue={getDraftDefault("description_ar", costCenter?.description_ar ?? "")} disabled={isViewing} dir="rtl" rows={2} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            {(isEditing || isViewing) && (
              <div className="space-y-2 col-span-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", costCenter?.is_active ?? true)} disabled={isViewing} />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                </div>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {costCenter ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(costCenter.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(costCenter.updated_at).toLocaleString()} disabled className="text-xs" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Audit information will be available after saving</p>
          )}
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
