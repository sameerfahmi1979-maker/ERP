"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Briefcase, ScrollText } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { RequiredLabel } from "@/components/erp/required-label";
import type { DesignationRow } from "@/server/actions/common-master-data/designations";
import { createDesignation, updateDesignation } from "@/server/actions/common-master-data/designations";

type Props = {
  designation?: DesignationRow | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  companies?: { id: number; legal_name_en: string; company_code: string }[];
};

const FORM_ID = "designation-workspace-form";
const MGMT_LEVELS = [
  { value: "staff", label: "Staff" },
  { value: "supervisor", label: "Supervisor" },
  { value: "manager", label: "Manager" },
  { value: "senior_manager", label: "Senior Manager" },
  { value: "director", label: "Director" },
  { value: "executive", label: "Executive" },
  { value: "c_level", label: "C-Level" },
];

export function DesignationWorkspaceForm({ designation, mode, companies = [] }: Props) {
  const { closeTab, activeTab, markDirty } = useWorkspace();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const disabled = isViewing;

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  useEffect(() => { if (activeTab?.id) markDirty(activeTab.id, isDirty); }, [isDirty, activeTab?.id, markDirty]);
  const { getDraftDefault, syncDraft, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const sections = [
    { id: "basic", label: "Designation Info", icon: Briefcase },
    { id: "notes", label: "Description", icon: ScrollText },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    setIsSubmitting(true);
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const fd = new FormData(form);
    const data = {
      designation_code: fd.get("designation_code") as string,
      designation_name_en: fd.get("designation_name_en") as string,
      designation_name_ar: (fd.get("designation_name_ar") as string) || null,
      owner_company_id: fd.get("owner_company_id") ? parseInt(fd.get("owner_company_id") as string) : null,
      job_level: (fd.get("job_level") as string) || null,
      management_level: (fd.get("management_level") as string) || null,
      is_supervisor: fd.get("is_supervisor") === "on",
      is_authorized_signatory: fd.get("is_authorized_signatory") === "on",
      has_approval_authority: fd.get("has_approval_authority") === "on",
      is_safety_critical: fd.get("is_safety_critical") === "on",
      is_active: fd.get("is_active") !== "off",
      description: (fd.get("description") as string) || null,
    };
    try {
      const result = isEditing && designation
        ? await updateDesignation({ ...data, management_level: data.management_level as "staff" | "supervisor" | "manager" | "senior_manager" | "director" | "executive" | "c_level" | null | undefined, id: designation.id })
        : await createDesignation({ ...data, management_level: data.management_level as "staff" | "supervisor" | "manager" | "senior_manager" | "director" | "executive" | "c_level" | null | undefined });
      if (result.success) { toast.success(isEditing ? "Designation updated" : "Designation created"); clearDraft(); resetDirty(); return true; }
      toast.error(result.error ?? "Failed to save"); return false;
    } catch { toast.error("An unexpected error occurred"); return false; }
    finally { setIsSubmitting(false); }
  };

  const handleSaveAndClose = async () => { const ok = await handleSave(); if (ok) handleRequestClose(); };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Designation" : isEditing ? "Edit Designation" : "New Designation"}
      subtitle={designation ? `${designation.designation_name_en} (${designation.designation_code})` : "Create a new job title / designation"}
      recordCode={designation?.designation_code}
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
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Designation Details">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="designation_code">Designation Code</RequiredLabel>
              <Input id="designation_code" name="designation_code" className="uppercase" defaultValue={getDraftDefault("designation_code", designation?.designation_code ?? "")} disabled={disabled || isEditing} required placeholder="e.g., DESG-001" />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="owner_company_id" className="text-muted-foreground text-xs">Organization</Label>
              <select id="owner_company_id" name="owner_company_id" defaultValue={getDraftDefault("owner_company_id", designation?.owner_company_id ?? "")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">All Organizations</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.legal_name_en}</option>)}
              </select>
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="designation_name_en">Name (English)</RequiredLabel>
              <Input id="designation_name_en" name="designation_name_en" defaultValue={getDraftDefault("designation_name_en", designation?.designation_name_en ?? "")} disabled={disabled} required />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="designation_name_ar" className="text-muted-foreground text-xs">Name (Arabic)</Label>
              <Input id="designation_name_ar" name="designation_name_ar" defaultValue={getDraftDefault("designation_name_ar", designation?.designation_name_ar ?? "")} disabled={disabled} dir="rtl" />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="job_level" className="text-muted-foreground text-xs">Job Level / Grade</Label>
              <Input id="job_level" name="job_level" defaultValue={getDraftDefault("job_level", designation?.job_level ?? "")} disabled={disabled} placeholder="e.g., L4, Grade 7" />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="management_level" className="text-muted-foreground text-xs">Management Level</Label>
              <select id="management_level" name="management_level" defaultValue={getDraftDefault("management_level", designation?.management_level ?? "")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">Select Level</option>
                {MGMT_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="col-span-12 grid grid-cols-2 gap-2 pt-1">
              {[
                { id: "is_supervisor", label: "Is Supervisor", checked: designation?.is_supervisor ?? false },
                { id: "is_authorized_signatory", label: "Authorized Signatory", checked: designation?.is_authorized_signatory ?? false },
                { id: "has_approval_authority", label: "Has Approval Authority", checked: designation?.has_approval_authority ?? false },
                { id: "is_safety_critical", label: "Safety Critical Role", checked: designation?.is_safety_critical ?? false },
                { id: "is_active", label: "Active", checked: designation?.is_active ?? true },
              ].map(f => (
                <div key={f.id} className="flex items-center space-x-2">
                  <Checkbox id={f.id} name={f.id} defaultChecked={f.checked} disabled={disabled} />
                  <Label htmlFor={f.id} className="text-xs cursor-pointer">{f.label}</Label>
                </div>
              ))}
            </div>
          </div>
        </ERPRecordSectionPanel>
        <ERPRecordSectionPanel id="notes" activeId={activeSection} title="Description">
          <div className="space-y-2">
            <Textarea id="description" name="description" defaultValue={getDraftDefault("description", designation?.description ?? "")} rows={6} disabled={disabled} />
          </div>
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
