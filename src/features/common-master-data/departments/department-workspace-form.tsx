"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2, ScrollText } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { RequiredLabel } from "@/components/erp/required-label";
import type { DepartmentRow } from "@/server/actions/common-master-data/departments";
import { createDepartment, updateDepartment } from "@/server/actions/common-master-data/departments";

type Props = {
  department?: DepartmentRow | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  companies?: { id: number; legal_name_en: string; company_code: string }[];
};

const FORM_ID = "department-workspace-form";

export function DepartmentWorkspaceForm({ department, mode, companies = [] }: Props) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const disabled = isViewing;

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  useEffect(() => { if (activeTab?.id) markDirty(activeTab.id, isDirty); }, [isDirty, activeTab?.id, markDirty]);

  const { getDraftDefault, syncDraft, writeDraftField, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const sections = [
    { id: "basic", label: "Department Info", icon: Building2 },
    { id: "notes", label: "Notes", icon: ScrollText },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    setIsSubmitting(true);
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const fd = new FormData(form);
    const data = {
      department_code: fd.get("department_code") as string,
      department_name_en: fd.get("department_name_en") as string,
      department_name_ar: (fd.get("department_name_ar") as string) || null,
      owner_company_id: parseInt(fd.get("owner_company_id") as string),
      branch_id: null,
      parent_department_id: null,
      cost_center_id: null,
      department_head_user_id: null,
      description: (fd.get("description") as string) || null,
      is_active: fd.get("is_active") !== "off",
      effective_from: (fd.get("effective_from") as string) || null,
      effective_to: (fd.get("effective_to") as string) || null,
    };
    try {
      const result = isEditing && department
        ? await updateDepartment({ ...data, id: department.id })
        : await createDepartment(data);
      if (result.success) {
        toast.success(isEditing ? "Department updated" : "Department created");
        clearDraft(); resetDirty(); if (activeTab?.id) markDirty(activeTab.id, false);
        if (!isEditing && (result as { data?: { id: number } }).data?.id) {
          window.history.replaceState(null, "", `/admin/common-master-data/departments/record/${(result as { data?: { id: number } }).data!.id}`);
        }
        return true;
      }
      toast.error(result.error ?? "Failed to save");
      return false;
    } catch { toast.error("An unexpected error occurred"); return false; }
    finally { setIsSubmitting(false); }
  };

  const handleSaveAndClose = async () => { const ok = await handleSave(); if (ok) forceCloseActiveTab(); };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Department" : isEditing ? "Edit Department" : "New Department"}
      subtitle={department ? `${department.department_name_en} (${department.department_code})` : "Create a new department"}
      recordCode={department?.department_code}
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
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Department Details">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="owner_company_id">Organization</RequiredLabel>
              <select id="owner_company_id" name="owner_company_id" defaultValue={getDraftDefault("owner_company_id", department?.owner_company_id ?? "")} required disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">Select organization...</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.legal_name_en} ({c.company_code})</option>)}
              </select>
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="department_code">Department Code</RequiredLabel>
              <Input id="department_code" name="department_code" className="uppercase" defaultValue={getDraftDefault("department_code", department?.department_code ?? "")} disabled={disabled || isEditing} required placeholder="e.g., HR, FIN, OPS" />
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="department_name_en">Name (English)</RequiredLabel>
              <Input id="department_name_en" name="department_name_en" defaultValue={getDraftDefault("department_name_en", department?.department_name_en ?? "")} disabled={disabled} required />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="department_name_ar" className="text-muted-foreground text-xs">Name (Arabic)</Label>
              <Input id="department_name_ar" name="department_name_ar" defaultValue={getDraftDefault("department_name_ar", department?.department_name_ar ?? "")} disabled={disabled} dir="rtl" />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="effective_from" className="text-muted-foreground text-xs">Effective From</Label>
              <Input type="date" id="effective_from" name="effective_from" defaultValue={getDraftDefault("effective_from", department?.effective_from ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="effective_to" className="text-muted-foreground text-xs">Effective To</Label>
              <Input type="date" id="effective_to" name="effective_to" defaultValue={getDraftDefault("effective_to", department?.effective_to ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 flex items-center space-x-2">
              <Checkbox id="is_active" name="is_active" defaultChecked={department?.is_active ?? true} disabled={disabled} />
              <Label htmlFor="is_active" className="cursor-pointer text-muted-foreground text-xs font-normal">Active</Label>
            </div>
          </div>
        </ERPRecordSectionPanel>
        <ERPRecordSectionPanel id="notes" activeId={activeSection} title="Description">
          <div className="space-y-2">
            <Label htmlFor="description" className="text-muted-foreground text-xs">Description</Label>
            <Textarea id="description" name="description" defaultValue={getDraftDefault("description", department?.description ?? "")} rows={6} disabled={disabled} />
          </div>
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
