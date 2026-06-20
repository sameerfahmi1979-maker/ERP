"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ShieldCheck, ScrollText } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { RequiredLabel } from "@/components/erp/required-label";
import type { ApprovalRoleRow } from "@/server/actions/common-master-data/approval-roles";
import { createApprovalRole, updateApprovalRole } from "@/server/actions/common-master-data/approval-roles";

type Props = {
  role?: ApprovalRoleRow | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  companies?: { id: number; legal_name_en: string; company_code: string }[];
  allRoles?: { id: number; role_name: string; role_code: string }[];
};

const FORM_ID = "approval-role-workspace-form";
const SCOPES = ['company','branch','department','site','module','global'];

export function ApprovalRoleWorkspaceForm({ role, mode, companies = [], allRoles = [] }: Props) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const disabled = isViewing;

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  useEffect(() => { if (activeTab?.id) markDirty(activeTab.id, isDirty); }, [isDirty, activeTab?.id, markDirty]);
  const { getDraftDefault, syncDraft, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  const sections = [
    { id: "basic", label: "Role Info", icon: ShieldCheck },
    { id: "notes", label: "Description", icon: ScrollText },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    setIsSubmitting(true);
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const fd = new FormData(form);
    const data = {
      role_code: fd.get("role_code") as string,
      role_name: fd.get("role_name") as string,
      level_number: parseInt(fd.get("level_number") as string),
      scope: (fd.get("scope") as "company" | "branch" | "department" | "site" | "module" | "global") || "company",
      module_code: (fd.get("module_code") as string) || null,
      amount_limit: fd.get("amount_limit") ? Number(fd.get("amount_limit")) : null,
      currency_code: (fd.get("currency_code") as string) || "AED",
      can_approve: fd.get("can_approve") !== "off",
      can_reject: fd.get("can_reject") !== "off",
      can_delegate: fd.get("can_delegate") === "on",
      escalation_role_id: fd.get("escalation_role_id") ? parseInt(fd.get("escalation_role_id") as string) : null,
      owner_company_id: fd.get("owner_company_id") ? parseInt(fd.get("owner_company_id") as string) : null,
      is_active: fd.get("is_active") !== "off",
      description: (fd.get("description") as string) || null,
    };
    try {
      const result = isEditing && role
        ? await updateApprovalRole({ ...data, id: role.id })
        : await createApprovalRole(data);
      if (result.success) { toast.success(isEditing ? "Approval role updated" : "Approval role created"); clearDraft(); resetDirty(); if (activeTab?.id) markDirty(activeTab.id, false); return true; }
      toast.error(result.error ?? "Failed to save"); return false;
    } catch { toast.error("An unexpected error occurred"); return false; }
    finally { setIsSubmitting(false); }
  };

  const handleSaveAndClose = async () => { const ok = await handleSave(); if (ok) forceCloseActiveTab(); };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Approval Role" : isEditing ? "Edit Approval Role" : "New Approval Role"}
      subtitle={role ? `L${role.level_number} — ${role.role_name} (${role.role_code})` : "Define a new approval authority level"}
      recordCode={role?.role_code}
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
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Approval Role Details">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="role_code">Role Code</RequiredLabel>
              <Input id="role_code" name="role_code" className="uppercase" defaultValue={getDraftDefault("role_code", role?.role_code ?? "")} disabled={disabled || isEditing} required placeholder="e.g., APPR-L1" />
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="role_name">Role Name</RequiredLabel>
              <Input id="role_name" name="role_name" defaultValue={getDraftDefault("role_name", role?.role_name ?? "")} disabled={disabled} required />
            </div>
            <div className="col-span-4 space-y-1.5">
              <RequiredLabel htmlFor="level_number">Level Number</RequiredLabel>
              <Input type="number" id="level_number" name="level_number" min="1" defaultValue={getDraftDefault("level_number", role?.level_number ?? "")} disabled={disabled} required />
            </div>
            <div className="col-span-4 space-y-1.5">
              <RequiredLabel htmlFor="scope">Scope</RequiredLabel>
              <select id="scope" name="scope" defaultValue={getDraftDefault("scope", role?.scope ?? "company")} disabled={disabled} required className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                {SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="module_code" className="text-muted-foreground text-xs">Module Code</Label>
              <Input id="module_code" name="module_code" defaultValue={getDraftDefault("module_code", role?.module_code ?? "")} disabled={disabled} placeholder="e.g., HR, FIN" />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="amount_limit" className="text-muted-foreground text-xs">Amount Limit</Label>
              <Input type="number" step="0.01" id="amount_limit" name="amount_limit" defaultValue={getDraftDefault("amount_limit", role?.amount_limit ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="currency_code" className="text-muted-foreground text-xs">Currency</Label>
              <Input id="currency_code" name="currency_code" defaultValue={getDraftDefault("currency_code", role?.currency_code ?? "AED")} disabled={disabled} maxLength={10} />
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label htmlFor="owner_company_id" className="text-muted-foreground text-xs">Organization</Label>
              <select id="owner_company_id" name="owner_company_id" defaultValue={getDraftDefault("owner_company_id", role?.owner_company_id ?? "")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">All Organizations</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.legal_name_en}</option>)}
              </select>
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="escalation_role_id" className="text-muted-foreground text-xs">Escalation Role</Label>
              <select id="escalation_role_id" name="escalation_role_id" defaultValue={getDraftDefault("escalation_role_id", role?.escalation_role_id ?? "")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">None</option>
                {allRoles.filter(r => r.id !== role?.id).map(r => <option key={r.id} value={r.id}>{r.role_name} ({r.role_code})</option>)}
              </select>
            </div>
            <div className="col-span-12 grid grid-cols-4 gap-2">
              {[
                { id: "can_approve", label: "Can Approve", checked: role?.can_approve ?? true },
                { id: "can_reject", label: "Can Reject", checked: role?.can_reject ?? true },
                { id: "can_delegate", label: "Can Delegate", checked: role?.can_delegate ?? false },
                { id: "is_active", label: "Active", checked: role?.is_active ?? true },
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
          <Textarea id="description" name="description" defaultValue={getDraftDefault("description", role?.description ?? "")} rows={6} disabled={disabled} />
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
