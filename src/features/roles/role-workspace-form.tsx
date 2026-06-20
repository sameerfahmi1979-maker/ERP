"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Role } from "@/types/database";
import { createRole, updateRole } from "@/server/actions/roles";
import { RequiredLabel } from "@/components/erp/required-label";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { Shield, ShieldAlert } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  ERPRecordWorkspaceForm,
  ERPRecordSectionPanel,
} from "@/components/workspace/erp-record-workspace-form";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";

type RoleWorkspaceFormProps = {
  role?: Role | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
};

const FORM_ID = "role-workspace-form";

export function RoleWorkspaceForm({ role, mode }: RoleWorkspaceFormProps) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSection, setActiveSection] = useState("basic");

  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  const { getDraftDefault, syncDraft, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });

  useEffect(() => {
    if (activeTab?.id) markDirty(activeTab.id, isDirty);
  }, [isDirty, activeTab?.id, markDirty]);

  const sections = [
    { id: "basic", label: "Role Details", icon: Shield },
  ];

  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const formData = new FormData(form);
    setIsSubmitting(true);
    try {
      const data = {
        role_code: (formData.get("role_code") as string).toLowerCase().replace(/\s+/g, "_"),
        role_name: formData.get("role_name") as string,
        description: (formData.get("description") as string) || null,
        is_system_role: formData.get("is_system_role") === "true",
        is_active: formData.get("is_active") === "true",
      };

      const result = isEditing && role
        ? await updateRole({ ...data, id: role.id })
        : await createRole(data);

      if (result.success) {
        toast.success(isEditing ? "Role updated" : "Role created");
        clearDraft();
        resetDirty();
        return true;
      } else {
        toast.error(result.error ?? "Failed to save role");
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
      title={isViewing ? "View Role" : isEditing ? "Edit Role" : "New Role"}
      subtitle={role ? `Role Code: ${role.role_code}` : "Define a new security role with custom scopes"}
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
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Role Configurations">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="role_code">Role Code</RequiredLabel>
              <Input
                id="role_code"
                name="role_code"
                className="lowercase"
                defaultValue={getDraftDefault("role_code", role?.role_code ?? "")}
                disabled={isViewing || isEditing}
                required
                placeholder="e.g., fleet_manager"
              />
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="role_name">Role Name</RequiredLabel>
              <Input
                id="role_name"
                name="role_name"
                defaultValue={getDraftDefault("role_name", role?.role_name ?? "")}
                disabled={isViewing}
                required
              />
            </div>
            <div className="col-span-12 space-y-1.5">
              <RequiredLabel htmlFor="description">Description</RequiredLabel>
              <Textarea
                id="description"
                name="description"
                defaultValue={getDraftDefault("description", role?.description ?? "")}
                disabled={isViewing}
                rows={4}
              />
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="is_system_role">Type</RequiredLabel>
              <select
                id="is_system_role"
                name="is_system_role"
                defaultValue={getDraftDefault("is_system_role", role?.is_system_role ? "true" : "false")}
                disabled={isViewing || role?.is_system_role}
                className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
              >
                <option value="false">Custom</option>
                <option value="true">System</option>
              </select>
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="is_active">Status</RequiredLabel>
              <select
                id="is_active"
                name="is_active"
                defaultValue={getDraftDefault("is_active", role?.is_active !== false ? "true" : "false")}
                disabled={isViewing}
                className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div className="col-span-12 flex gap-2.5 p-3 rounded-lg border border-border bg-muted/20 mt-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-normal font-medium">
                System roles are read-only policies configured by default engine controllers. Custom roles can be managed and deleted freely.
              </p>
            </div>
          </div>
        </ERPRecordSectionPanel>
      </form>
    </ERPRecordWorkspaceForm>
  );
}
