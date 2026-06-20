"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { ProfitCenter } from "@/features/master-data/finance-basics/types";
import { createProfitCenter, updateProfitCenter } from "@/features/master-data/finance-basics/actions";
import { LookupSelect } from "@/components/erp/lookup-select";
import { ProfitCenterSelect } from "@/components/erp/finance-basics";
import { OwnerCompanySelect, BranchSelect } from "@/components/erp/organizations";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQueryClient } from "@tanstack/react-query";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { invalidateProfitCenters } from "@/lib/query/invalidation";
import { TrendingUp, Building2, Shield, Info } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type ProfitCenterWorkspaceFormProps = {
  profitCenter?: ProfitCenter | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "profit-center-workspace-form";

export function ProfitCenterWorkspaceForm({ profitCenter, mode }: ProfitCenterWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, getDraftBoolean, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const [typeCode, setTypeCode] = useState<string | null>(() =>
    getDraftDefault("profit_center_type_code", profitCenter?.profit_center_type_code ?? "") || null
  );
  const [parentId, setParentId] = useState<number | null>(() => {
    const d = getDraftDefault("parent_profit_center_id", "");
    return d ? Number(d) : profitCenter?.parent_profit_center_id ?? null;
  });
  const [ownerCompanyId, setOwnerCompanyId] = useState<number | null>(() => {
    const d = getDraftDefault("owner_company_id", "");
    return d ? Number(d) : profitCenter?.owner_company_id ?? null;
  });
  const [branchId, setBranchId] = useState<number | null>(() => {
    const d = getDraftDefault("branch_id", "");
    return d ? Number(d) : profitCenter?.branch_id ?? null;
  });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const sections = [
    { id: "basic", label: "Basic Info", icon: TrendingUp },
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
        profit_center_name_en: formData.get("profit_center_name_en") as string,
        profit_center_name_ar: (formData.get("profit_center_name_ar") as string) || null,
        profit_center_type_code: typeCode,
        parent_profit_center_id: parentId,
        owner_company_id: ownerCompanyId,
        branch_id: branchId,
        description_en: (formData.get("description_en") as string) || null,
        description_ar: (formData.get("description_ar") as string) || null,
        notes: (formData.get("notes") as string) || null,
        sort_order: parseInt(formData.get("sort_order") as string) || 0,
      };
      let result;
      if (isEditing && profitCenter) {
        result = await updateProfitCenter({ id: profitCenter.id, ...shared, is_active: formData.get("is_active") === "on" });
      } else {
        result = await createProfitCenter({ profit_center_code: (formData.get("profit_center_code") as string).toUpperCase(), ...shared });
      }
      if (result.success) {
        toast.success(`Profit center ${isEditing ? "updated" : "created"} successfully`);
        clearDraft();
        resetDirty();
        invalidateProfitCenters(queryClient);
        return true;
      } else {
        toast.error(result.error ?? "Failed to save profit center");
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
    if (success) forceCloseActiveTab();
  };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Profit Center" : isEditing ? "Edit Profit Center" : "New Profit Center"}
      subtitle={profitCenter ? `${profitCenter.profit_center_name_en} (${profitCenter.profit_center_code})` : "Create a new profit center"}
      recordCode={profitCenter?.profit_center_code}
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
              <RequiredLabel htmlFor="profit_center_code">Profit Center Code</RequiredLabel>
              <Input id="profit_center_code" name="profit_center_code" required defaultValue={getDraftDefault("profit_center_code", profitCenter?.profit_center_code ?? "")} disabled={isViewing || isEditing} className="uppercase" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Profit Center Type</Label>
              <LookupSelect categoryCode="PROFIT_CENTER_TYPES" value={typeCode} onValueChange={(v) => { const s = v ? String(v) : null; setTypeCode(s); writeDraftField("profit_center_type_code", s ?? ""); }} valueField="code" showCode disabled={isViewing} allowClear />
            </div>
            <div className="space-y-2 col-span-6">
              <RequiredLabel htmlFor="profit_center_name_en">English Name</RequiredLabel>
              <Input id="profit_center_name_en" name="profit_center_name_en" required defaultValue={getDraftDefault("profit_center_name_en", profitCenter?.profit_center_name_en ?? "")} disabled={isViewing} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="profit_center_name_ar" className="text-muted-foreground text-xs">Arabic Name</Label>
              <Input id="profit_center_name_ar" name="profit_center_name_ar" defaultValue={getDraftDefault("profit_center_name_ar", profitCenter?.profit_center_name_ar ?? "")} disabled={isViewing} dir="rtl" />
            </div>
            <div className="space-y-2 col-span-6">
              <Label className="text-muted-foreground text-xs">Parent Profit Center</Label>
              <ProfitCenterSelect value={parentId} onValueChange={(v) => { setParentId(v); writeDraftField("parent_profit_center_id", v ?? ""); }} ownerCompanyId={ownerCompanyId} excludeId={profitCenter?.id} disabled={isViewing} allowClear showCode />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="sort_order" className="text-muted-foreground text-xs">Sort Order</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={getDraftDefault("sort_order", profitCenter?.sort_order ?? 0)} disabled={isViewing} />
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
              <Textarea id="description_en" name="description_en" defaultValue={getDraftDefault("description_en", profitCenter?.description_en ?? "")} disabled={isViewing} rows={2} />
            </div>
            <div className="space-y-2 col-span-6">
              <Label htmlFor="description_ar" className="text-muted-foreground text-xs">Description (AR)</Label>
              <Textarea id="description_ar" name="description_ar" defaultValue={getDraftDefault("description_ar", profitCenter?.description_ar ?? "")} disabled={isViewing} dir="rtl" rows={2} />
            </div>
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="status" activeId={activeSection} title="Status">
          <div className="grid grid-cols-12 gap-4">
            {(isEditing || isViewing) && (
              <div className="space-y-2 col-span-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="is_active" name="is_active" defaultChecked={getDraftBoolean("is_active", profitCenter?.is_active ?? true)} disabled={isViewing} />
                  <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">Active</Label>
                </div>
              </div>
            )}
          </div>
        </ERPRecordSectionPanel>

        <ERPRecordSectionPanel id="audit" activeId={activeSection} title="Audit Information" lazyMount>
          {profitCenter ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Created At</Label>
                <Input value={new Date(profitCenter.created_at).toLocaleString()} disabled className="text-xs" />
              </div>
              <div className="space-y-2 col-span-6">
                <Label className="text-muted-foreground text-xs">Updated At</Label>
                <Input value={new Date(profitCenter.updated_at).toLocaleString()} disabled className="text-xs" />
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
